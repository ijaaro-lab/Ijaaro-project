# SUPERSEDED — `20261019160000_profiles_username`

**Status:** Superseded by RP-1.3.2 / hardened in RP-1.3.4  
**Replacement:** `20261020090000_renter_applications_landlord_usernames.sql`  
**Live migration file:** `20261019160000_profiles_username.sql` is now a **no-op** (NOTICE only) so CLI discovery cannot recreate global username uniqueness on fresh local setups.

## Why

Approved product decision: renter usernames are **unique per landlord tenant**, not globally.

The draft below would have added `profiles.username` with a **global** unique index (`profiles_username_lower_uidx`). That conflicts with the approved model and must **never** be applied.

## What to use instead

- Table `tenant_renter_usernames` with `UNIQUE (tenant_id, lower(username))` and `UNIQUE (tenant_id, user_id)`.
- Application workflow table `rental_applications` with pending/accepted/rejected.
- RPCs for public landlord listings, application submit/list, and landlord review.

## Local history note (RP-1.3.3)

On the isolated local database, version `20261019160000` was recorded as `profiles_username_SUPERSEDED_SKIPPED` without applying the draft SQL. RP-1.3.4 converted the tracked `.sql` file into a no-op for future fresh applies.

## Rollback note

If the draft SQL was ever applied by mistake, drop `profiles_username_lower_uidx` and stop writing global usernames before adopting the landlord-scoped table. Prefer restoring from backup over inventing a data merge.

## Archived draft SQL (do not execute)

```sql
-- DRAFT ONLY — DO NOT RUN
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_username_format'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_format
      CHECK (
        username IS NULL
        OR username ~ '^[a-z][a-z0-9_]{2,31}$'
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uidx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_username_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.username IS NOT NULL AND NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'username is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_username_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_username_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS profiles_prevent_username_change ON public.profiles;
CREATE TRIGGER profiles_prevent_username_change
  BEFORE UPDATE OF username ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_username_change();
```
