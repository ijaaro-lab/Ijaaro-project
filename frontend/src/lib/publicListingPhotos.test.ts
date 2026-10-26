import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PUBLIC_COVER_PROPERTY_IDS,
  fetchPublicListingCovers,
  fetchPublicListingGallery,
} from "./publicListingPhotos";

const invoke = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invoke(...args),
    },
  },
}));

const PROP_A = "11111111-1111-4111-8111-111111111111";
const PROP_B = "22222222-2222-4222-8222-222222222222";
const PHOTO_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("publicListingPhotos client", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("batches cover requests and returns only safe URLs", async () => {
    invoke.mockResolvedValue({
      data: {
        covers: {
          [PROP_A]: "https://cdn.example/cover-a",
          [PROP_B]: "javascript:alert(1)",
        },
      },
      error: null,
    });

    const covers = await fetchPublicListingCovers("hodan-properties", [PROP_A, PROP_B, PROP_A]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("public-listing-photos", {
      body: {
        tenant_key: "hodan-properties",
        mode: "covers",
        property_ids: [PROP_A, PROP_B],
      },
    });
    expect(covers).toEqual({ [PROP_A]: "https://cdn.example/cover-a" });
  });

  it("returns empty covers when the function leaks storage_path or errors", async () => {
    invoke.mockResolvedValueOnce({
      data: { covers: { [PROP_A]: "https://cdn.example/x" }, storage_path: "t/p/x.jpg" },
      error: null,
    });
    expect(await fetchPublicListingCovers("hodan-properties", [PROP_A])).toEqual({});

    invoke.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await fetchPublicListingCovers("hodan-properties", [PROP_A])).toEqual({});
  });

  it("rejects oversized cover batches without calling the function", async () => {
    const ids = Array.from({ length: MAX_PUBLIC_COVER_PROPERTY_IDS + 1 }, (_, i) => {
      const n = (i + 1).toString(16).padStart(12, "0");
      return `11111111-1111-4111-8111-${n}`;
    });
    expect(await fetchPublicListingCovers("hodan-properties", ids)).toEqual({});
    expect(invoke).not.toHaveBeenCalled();
  });

  it("loads an ordered gallery and ignores unsafe rows", async () => {
    invoke.mockResolvedValue({
      data: {
        photos: [
          { id: PHOTO_1, url: "https://cdn.example/1", sort_order: 1 },
          { id: "bad", url: "not-a-url", sort_order: 0 },
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            url: "https://cdn.example/0",
            sort_order: 0,
          },
        ],
      },
      error: null,
    });

    const photos = await fetchPublicListingGallery("Hodan-Properties", PROP_A);
    expect(invoke).toHaveBeenCalledWith("public-listing-photos", {
      body: {
        tenant_key: "hodan-properties",
        mode: "gallery",
        property_ids: [PROP_A],
      },
    });
    expect(photos.map((p) => p.url)).toEqual([
      "https://cdn.example/0",
      "https://cdn.example/1",
    ]);
  });

  it("returns an empty gallery when photos are absent", async () => {
    invoke.mockResolvedValue({ data: { photos: [] }, error: null });
    expect(await fetchPublicListingGallery("hodan-properties", PROP_A)).toEqual([]);
  });
});
