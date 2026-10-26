/** Display-only labels for landlord tenancy list/detail. */

export type PropertyLabelSource = {
  name?: string | null;
  address_line?: string | null;
} | null | undefined;

export type RenterLabelSource = {
  full_name?: string | null;
  email?: string | null;
} | null | undefined;

export function propertyLabel(property: PropertyLabelSource): string {
  if (!property) return "Unknown property";
  const name = property.name?.trim();
  if (name) return name;
  const address = property.address_line?.trim();
  if (address) return address;
  return "Unknown property";
}

export function renterLabel(renter: RenterLabelSource): string {
  if (!renter) return "Unknown renter";
  const name = renter.full_name?.trim();
  if (name) return name;
  const email = renter.email?.trim();
  if (email) return email;
  return "Unknown renter";
}

export function shortId(id: string): string {
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}
