-- Expose public-safe room counts and neighborhood on landlord public listing detail.
-- Does not change table schema or RLS; only extends the existing anon-safe allowlist RPC.

DROP FUNCTION IF EXISTS public.get_landlord_public_listing(text, uuid);

CREATE OR REPLACE FUNCTION public.get_landlord_public_listing(
  p_tenant_key text,
  p_property_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  district text,
  city text,
  property_type public.property_type,
  status public.property_status,
  rent_amount numeric,
  currency text,
  address_line text,
  description text,
  contact_phone text,
  contact_email text,
  neighborhood text,
  bedrooms integer,
  kitchens integer,
  bathrooms integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
BEGIN
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'listing id is required' USING ERRCODE = '22023';
  END IF;

  v_tenant := public.resolve_operable_landlord_tenant(p_tenant_key);

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.district,
    p.city,
    p.property_type,
    p.status,
    p.rent_amount,
    p.currency,
    p.address_line,
    p.description,
    p.contact_phone,
    p.contact_email,
    p.neighborhood,
    p.bedrooms,
    p.kitchens,
    p.bathrooms
  FROM public.properties AS p
  WHERE p.id = p_property_id
    AND p.tenant_id = v_tenant.id
    AND p.is_listed = true
    AND p.status = 'available'::public.property_status;
END;
$$;

COMMENT ON FUNCTION public.get_landlord_public_listing(text, uuid) IS
  'Anon-safe landlord public detail: allowlisted fields (incl. rooms/neighborhood) for one listed+available property of the resolved landlord.';

REVOKE ALL ON FUNCTION public.get_landlord_public_listing(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_landlord_public_listing(text, uuid) TO anon, authenticated;
