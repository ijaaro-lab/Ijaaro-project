import { describe, expect, it } from "vitest";
import {
  MAX_COVER_PROPERTY_IDS,
  MAX_GALLERY_PHOTOS,
  SIGNED_URL_TTL_SECONDS,
  assertNoPrivatePhotoLeak,
  orderGalleryRows,
  pickCoverRows,
  sanitizePublicPhotoResponse,
  validatePublicListingPhotosRequest,
  type PhotoMetaRow,
} from "../../../supabase/functions/public-listing-photos/logic";

const PROP_A = "11111111-1111-4111-8111-111111111111";
const PROP_B = "22222222-2222-4222-8222-222222222222";
const PHOTO_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PHOTO_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PHOTO_3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function row(
  partial: Partial<PhotoMetaRow> & Pick<PhotoMetaRow, "id" | "property_id" | "sort_order">,
): PhotoMetaRow {
  return {
    storage_path: `${partial.property_id}/secret/${partial.id}.jpg`,
    ...partial,
  };
}

describe("public-listing-photos logic", () => {
  it("uses a 15-minute signed URL TTL and gallery cap of 8", () => {
    expect(SIGNED_URL_TTL_SECONDS).toBe(15 * 60);
    expect(MAX_GALLERY_PHOTOS).toBe(8);
    expect(MAX_COVER_PROPERTY_IDS).toBe(50);
  });

  it("validates covers requests and rejects oversized / invalid payloads", () => {
    expect(
      validatePublicListingPhotosRequest({
        tenant_key: "hodan-properties",
        mode: "covers",
        property_ids: [PROP_A],
      }).ok,
    ).toBe(true);

    expect(
      validatePublicListingPhotosRequest({
        tenant_key: "",
        mode: "covers",
        property_ids: [PROP_A],
      }),
    ).toMatchObject({ ok: false, code: "invalid_tenant_key" });

    expect(
      validatePublicListingPhotosRequest({
        tenant_key: "hodan;drop",
        mode: "covers",
        property_ids: [PROP_A],
      }),
    ).toMatchObject({ ok: false, code: "invalid_tenant_key" });

    expect(
      validatePublicListingPhotosRequest({
        tenant_key: "hodan-properties",
        mode: "covers",
        property_ids: ["not-a-uuid"],
      }),
    ).toMatchObject({ ok: false, code: "invalid_property_ids" });

    expect(
      validatePublicListingPhotosRequest({
        tenant_key: "hodan-properties",
        mode: "covers",
        property_ids: Array.from({ length: MAX_COVER_PROPERTY_IDS + 1 }, (_, i) => {
          const n = (i + 1).toString(16).padStart(12, "0");
          return `11111111-1111-4111-8111-${n}`;
        }),
      }),
    ).toMatchObject({ ok: false, code: "payload_too_large" });

    expect(
      validatePublicListingPhotosRequest({
        tenant_key: "hodan-properties",
        mode: "gallery",
        property_ids: [PROP_A, PROP_B],
      }),
    ).toMatchObject({ ok: false, code: "invalid_property_ids" });
  });

  it("picks the lowest sort_order row as cover and orders galleries", () => {
    const rows = [
      row({ id: PHOTO_2, property_id: PROP_A, sort_order: 2, storage_path: "a/2.jpg" }),
      row({ id: PHOTO_1, property_id: PROP_A, sort_order: 0, storage_path: "a/0.jpg" }),
      row({ id: PHOTO_3, property_id: PROP_B, sort_order: 1, storage_path: "b/1.jpg" }),
    ];

    const covers = pickCoverRows(rows);
    expect(covers).toHaveLength(2);
    expect(covers.find((c) => c.property_id === PROP_A)?.id).toBe(PHOTO_1);
    expect(covers.find((c) => c.property_id === PROP_A)?.storage_path).toBe("a/0.jpg");

    const gallery = orderGalleryRows(rows.filter((r) => r.property_id === PROP_A), 8);
    expect(gallery.map((g) => g.id)).toEqual([PHOTO_1, PHOTO_2]);
  });

  it("caps gallery rows at MAX_GALLERY_PHOTOS", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${(i + 1).toString(16).padStart(12, "0")}`,
        property_id: PROP_A,
        sort_order: i,
      }),
    );
    expect(orderGalleryRows(rows)).toHaveLength(MAX_GALLERY_PHOTOS);
    expect(orderGalleryRows(rows)[0]?.sort_order).toBe(0);
  });

  it("sanitizes responses and detects private leaks", () => {
    const safe = sanitizePublicPhotoResponse({
      covers: { [PROP_A]: "https://example.test/signed" },
      storage_path: "must-not-leak",
      tenant_id: "must-not-leak",
    });
    expect(safe).toEqual({ covers: { [PROP_A]: "https://example.test/signed" } });
    expect(assertNoPrivatePhotoLeak(safe)).toBe(true);
    expect(
      assertNoPrivatePhotoLeak({ covers: {}, storage_path: "tenant/prop/x.jpg" }),
    ).toBe(false);
    expect(assertNoPrivatePhotoLeak({ service_role_key: "secret" })).toBe(false);
  });
});
