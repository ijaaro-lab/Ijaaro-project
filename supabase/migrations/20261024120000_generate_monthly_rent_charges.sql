-- Automatic monthly rent charge generation.
-- First charge remains assign_renter(p_create_initial_charge).
-- This batch creates subsequent calendar-month charges for active tenancies.
--
-- Scheduling: schedules via pg_cron only when the extension is already installed.
-- Enabling pg_cron / applying this migration to production requires explicit approval.
-- Alternative: Edge Function generate-monthly-rent-charges (service_role) + Dashboard cron.

-- ---------------------------------------------------------------------------
-- Due-date helper (due_day is constrained 1–28 on rental_assignments)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._rent_charge_due_date(
  p_year integer,
  p_month integer,
  p_due_day integer
)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT make_date(
    p_year,
    p_month,
    LEAST(GREATEST(COALESCE(p_due_day, 1), 1), 28)
  );
$$;

REVOKE ALL ON FUNCTION public._rent_charge_due_date(integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rent_charge_due_date(integer, integer, integer) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Batch generator (idempotent; concurrent-safe via unique period index)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_monthly_rent_charges(
  p_as_of date DEFAULT CURRENT_DATE,
  p_max_months integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_as_of date;
  v_max int;
  v_month_cap date;
  r public.rental_assignments%ROWTYPE;
  v_last_end date;
  v_cursor date;
  v_period_start date;
  v_period_end date;
  v_due date;
  v_day int;
  v_created int := 0;
  v_skipped_dup int := 0;
  v_skipped_ineligible int := 0;
  v_assignments int := 0;
  v_months_this int;
  v_inserted uuid;
  v_had_prior boolean;
BEGIN
  -- Privileged callers only: service_role JWT (Edge / scheduler) or DB superuser (pg_cron).
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  IF v_role = 'service_role' THEN
    NULL;
  ELSIF session_user IN ('postgres', 'supabase_admin') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_as_of := COALESCE(p_as_of, CURRENT_DATE);
  v_max := COALESCE(p_max_months, 3);
  IF v_max < 1 OR v_max > 24 THEN
    RAISE EXCEPTION 'p_max_months must be between 1 and 24';
  END IF;

  v_month_cap := date_trunc('month', v_as_of)::date;

  FOR r IN
    SELECT *
    FROM public.rental_assignments
    WHERE status = 'active'
      AND start_date <= v_as_of
      AND (end_date IS NULL OR end_date >= start_date)
    ORDER BY id
    FOR UPDATE
  LOOP
    v_assignments := v_assignments + 1;
    v_months_this := 0;

    SELECT max(rc.period_end)
    INTO v_last_end
    FROM public.rent_charges rc
    WHERE rc.assignment_id = r.id;

    v_had_prior := v_last_end IS NOT NULL;

    IF NOT v_had_prior THEN
      -- No prior charge: issue at most the current calendar month (no historical backfill).
      IF date_trunc('month', r.start_date)::date > v_month_cap THEN
        v_skipped_ineligible := v_skipped_ineligible + 1;
        CONTINUE;
      END IF;
      IF date_trunc('month', r.start_date)::date = v_month_cap THEN
        v_cursor := date_trunc('month', r.start_date)::date;
      ELSE
        v_cursor := v_month_cap;
      END IF;
    ELSE
      v_cursor := (date_trunc('month', v_last_end::timestamp) + interval '1 month')::date;
    END IF;

    v_day := LEAST(
      COALESCE(r.due_day, EXTRACT(DAY FROM r.start_date)::int),
      28
    );
    IF v_day < 1 THEN
      v_day := 1;
    END IF;

    WHILE v_cursor <= v_month_cap AND v_months_this < v_max LOOP
      IF r.end_date IS NOT NULL AND v_cursor > r.end_date THEN
        EXIT;
      END IF;

      v_period_end := (v_cursor + interval '1 month - 1 day')::date;

      IF date_trunc('month', r.start_date)::date = v_cursor THEN
        v_period_start := r.start_date;
      ELSE
        v_period_start := v_cursor;
      END IF;

      IF v_period_end < v_period_start THEN
        RAISE EXCEPTION 'invalid period'
          USING ERRCODE = '22023',
            DETAIL = format('period_end %s < period_start %s', v_period_end, v_period_start);
      END IF;

      IF r.end_date IS NOT NULL AND v_period_start > r.end_date THEN
        EXIT;
      END IF;

      IF v_period_end < r.start_date THEN
        v_cursor := (v_cursor + interval '1 month')::date;
        CONTINUE;
      END IF;

      v_due := public._rent_charge_due_date(
        EXTRACT(YEAR FROM v_cursor)::int,
        EXTRACT(MONTH FROM v_cursor)::int,
        v_day
      );
      -- Match assign_renter: if due day already passed relative to period start, roll forward.
      IF v_due < v_period_start THEN
        v_due := (v_due + interval '1 month')::date;
      END IF;

      v_inserted := NULL;
      INSERT INTO public.rent_charges (
        tenant_id, assignment_id, property_id, renter_id,
        period_start, period_end, due_date,
        amount_due, amount_paid, balance, status
      ) VALUES (
        r.tenant_id,
        r.id,
        r.property_id,
        r.renter_id,
        v_period_start,
        v_period_end,
        v_due,
        r.rent_amount,
        0,
        r.rent_amount,
        CASE
          WHEN v_due < v_as_of THEN 'overdue'::public.charge_status
          ELSE 'due'::public.charge_status
        END
      )
      ON CONFLICT (assignment_id, period_start, period_end) DO NOTHING
      RETURNING id INTO v_inserted;

      IF v_inserted IS NOT NULL THEN
        v_created := v_created + 1;
        PERFORM public._insert_audit_log(
          r.tenant_id,
          r.landlord_id,
          'rent.charge_auto_created',
          'rent_charge',
          v_inserted,
          jsonb_build_object(
            'assignment_id', r.id,
            'period_start', v_period_start,
            'period_end', v_period_end,
            'due_date', v_due,
            'amount_due', r.rent_amount,
            'source', 'generate_monthly_rent_charges',
            'as_of', v_as_of
          )
        );
      ELSE
        v_skipped_dup := v_skipped_dup + 1;
      END IF;

      v_months_this := v_months_this + 1;
      v_cursor := (v_cursor + interval '1 month')::date;
    END LOOP;

    IF v_months_this = 0 AND v_had_prior AND
       (date_trunc('month', v_last_end::timestamp) + interval '1 month')::date > v_month_cap THEN
      v_skipped_ineligible := v_skipped_ineligible + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'as_of', v_as_of,
    'month_cap', v_month_cap,
    'max_months', v_max,
    'assignments_scanned', v_assignments,
    'created', v_created,
    'skipped_duplicate', v_skipped_dup,
    'skipped_ineligible', v_skipped_ineligible
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_monthly_rent_charges(date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_monthly_rent_charges(date, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_monthly_rent_charges(date, integer) TO service_role;

COMMENT ON FUNCTION public.generate_monthly_rent_charges(date, integer) IS
  'Idempotent monthly rent charge generator for active tenancies. '
  'service_role / postgres only. Does not mark paid or initiate payments. '
  'Caps catch-up at p_max_months (default 3). Unique (assignment_id, period_start, period_end) prevents duplicates.';

-- ---------------------------------------------------------------------------
-- Optional pg_cron schedule (no-op unless extension is already installed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; generate_monthly_rent_charges created but not scheduled';
    RETURN;
  END IF;

  FOR v_jobid IN
    SELECT jobid FROM cron.job WHERE jobname = 'ijaaro_generate_monthly_rent_charges'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  PERFORM cron.schedule(
    'ijaaro_generate_monthly_rent_charges',
    '20 0 * * *',
    $cron$SELECT public.generate_monthly_rent_charges(CURRENT_DATE)$cron$
  );

  RAISE NOTICE 'Scheduled ijaaro_generate_monthly_rent_charges daily at 00:20 UTC';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'cron schema unavailable; function created but not scheduled';
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'insufficient privilege to schedule pg_cron job; function created but not scheduled';
END;
$$;
