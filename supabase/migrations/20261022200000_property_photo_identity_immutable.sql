-- =============================================================================
-- M1: property_photos identity immutability (property_id + storage_path)
-- =============================================================================
-- Local-repo only. Do not auto-apply to hosted/Live without approval.
-- Staff may still UPDATE sort_order via property_photos_update RLS.
-- Trusted RPCs may bypass with set_config('ijaaro.internal', '1', true).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.protect_property_photo_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('ijaaro.internal', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.property_id IS DISTINCT FROM OLD.property_id THEN
      RAISE EXCEPTION 'property_photos.property_id is immutable'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
      RAISE EXCEPTION 'property_photos.storage_path is immutable'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'property_photos.tenant_id is immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_photos_protect_identity ON public.property_photos;
CREATE TRIGGER property_photos_protect_identity
  BEFORE UPDATE ON public.property_photos
  FOR EACH ROW EXECUTE FUNCTION public.protect_property_photo_identity();

COMMENT ON FUNCTION public.protect_property_photo_identity() IS
  'M1: Prevent client re-pointing of property_id/storage_path/tenant_id on property_photos. sort_order remains updatable.';

REVOKE ALL ON FUNCTION public.protect_property_photo_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_property_photo_identity() FROM anon, authenticated;
