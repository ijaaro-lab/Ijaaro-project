-- Add optional room counts and neighborhood (xaafad) on properties.
-- Nullable so existing rows stay valid without invented defaults.
-- Do not apply to production/live automatically; ship via normal migration process.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS bedrooms integer,
  ADD COLUMN IF NOT EXISTS kitchens integer,
  ADD COLUMN IF NOT EXISTS bathrooms integer,
  ADD COLUMN IF NOT EXISTS neighborhood text;

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_bedrooms_nonneg,
  DROP CONSTRAINT IF EXISTS properties_kitchens_nonneg,
  DROP CONSTRAINT IF EXISTS properties_bathrooms_nonneg;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_bedrooms_nonneg
    CHECK (bedrooms IS NULL OR bedrooms >= 0),
  ADD CONSTRAINT properties_kitchens_nonneg
    CHECK (kitchens IS NULL OR kitchens >= 0),
  ADD CONSTRAINT properties_bathrooms_nonneg
    CHECK (bathrooms IS NULL OR bathrooms >= 0);
