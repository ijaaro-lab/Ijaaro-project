import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PropertyImageGallery } from "./PropertyImageGallery";

const images = [
  { id: "1", url: "https://example.com/a.jpg", alt: "Front" },
  { id: "2", url: "https://example.com/b.jpg", alt: "Kitchen" },
  { id: "3", url: "https://example.com/c.jpg", alt: "Yard" },
];

describe("PropertyImageGallery", () => {
  it("shows a polished placeholder when there are no images", () => {
    render(<PropertyImageGallery images={[]} propertyName="Villa" />);
    expect(screen.getByTestId("property-gallery-empty")).toBeTruthy();
    expect(screen.getByLabelText(/No photo available/i)).toBeTruthy();
    expect(screen.queryByTestId("property-gallery-counter")).toBeNull();
  });

  it("renders a single image without prev/next controls", () => {
    render(
      <PropertyImageGallery
        images={[{ id: "1", url: "https://example.com/a.jpg" }]}
        propertyName="Villa"
      />,
    );
    expect(screen.getByTestId("property-gallery")).toBeTruthy();
    expect(screen.getByTestId("property-gallery-counter").textContent).toMatch(/1 \/ 1/);
    expect(screen.queryByRole("button", { name: /Previous photo/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Next photo/i })).toBeNull();
  });

  it("selects a thumbnail to change the main image", () => {
    render(<PropertyImageGallery images={images} propertyName="Villa" />);
    expect(screen.getByTestId("property-gallery-counter").textContent).toMatch(/1 \/ 3/);
    fireEvent.click(screen.getByRole("button", { name: /Show photo 2/i }));
    expect(screen.getByTestId("property-gallery-counter").textContent).toMatch(/2 \/ 3/);
    expect(screen.getByAltText("Kitchen")).toBeTruthy();
  });

  it("navigates with previous and next controls", () => {
    render(<PropertyImageGallery images={images} propertyName="Villa" />);
    fireEvent.click(screen.getByRole("button", { name: /^Next photo$/i }));
    expect(screen.getByTestId("property-gallery-counter").textContent).toMatch(/2 \/ 3/);
    fireEvent.click(screen.getByRole("button", { name: /^Next photo$/i }));
    expect(screen.getByTestId("property-gallery-counter").textContent).toMatch(/3 \/ 3/);
    fireEvent.click(screen.getByRole("button", { name: /^Previous photo$/i }));
    expect(screen.getByTestId("property-gallery-counter").textContent).toMatch(/2 \/ 3/);
  });

  it("opens an accessible lightbox and closes with the close control", () => {
    render(<PropertyImageGallery images={images} propertyName="Villa" />);
    fireEvent.click(screen.getByRole("button", { name: /Open photo 1 of 3/i }));
    expect(screen.getByTestId("property-gallery-lightbox")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Close photo viewer/i }));
    expect(screen.queryByTestId("property-gallery-lightbox")).toBeNull();
  });

  it("keeps a responsive-safe thumbnail strip for multiple photos", () => {
    render(<PropertyImageGallery images={images} propertyName="Villa" />);
    const thumbs = screen.getByTestId("property-gallery-thumbs");
    expect(thumbs.className).toMatch(/overflow-x-auto/);
    expect(thumbs.querySelectorAll("button")).toHaveLength(3);
  });

  it("caps the gallery at eight existing photos", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: String(i + 1),
      url: `https://example.com/${i + 1}.jpg`,
    }));
    render(<PropertyImageGallery images={many} propertyName="Villa" />);
    expect(screen.getByTestId("property-gallery-counter").textContent).toMatch(/1 \/ 8/);
    expect(screen.getByTestId("property-gallery-thumbs").querySelectorAll("button")).toHaveLength(
      8,
    );
  });
});
