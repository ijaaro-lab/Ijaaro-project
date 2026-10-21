-- IJAARO — Utility tenant isolation probe (Water A/B, Electricity A/B, cross-type)
--
-- Run in Supabase SQL Editor as a privileged role (postgres / service).
-- Simulates authenticated JWTs via set_config + SET LOCAL ROLE authenticated.
-- Expect: every row in the result has ok = true.
--
-- Replace the UUIDs below with two water + two electricity tenants that have
-- at least one utility_account each, and their utility_admin user ids.

DO $$
DECLARE
  -- >>> EDIT THESE if needed <<<
  water_a   uuid := '4d7003dd-6374-4196-bb59-ec3c54a56e0b'; -- daruslaam water
  water_b   uuid := '881b53e0-4743-4175-8b96-d774ac68c079'; -- QA Water
  elec_a    uuid := 'd84d3397-4047-4b28-aec6-5ddf4606bbc8'; -- elecA sample
  elec_b    uuid := '753386d0-e2fe-429d-b32a-699423a09378'; -- elecB sample
  actor_wa  uuid := 'ff545aa0-7df4-4eaf-9010-7280175ebf46'; -- water A admin
  actor_ea  uuid := '22ff2aaa-7427-40b4-ae4c-a32140bd4f90'; -- elec A admin
  -- <<< END EDIT >>>

  prop_b uuid;
  prop_a uuid;
  prop_e uuid;
  c_own int;
  c_other int;
  c_cross int;
  c_eb int;
  can_own boolean;
  can_other boolean;
  can_cross boolean;
  can_eb boolean;
  upd_count int;
  acct text;
BEGIN
  SELECT property_id INTO prop_b FROM public.utility_accounts WHERE tenant_id = water_b LIMIT 1;
  SELECT property_id INTO prop_a FROM public.utility_accounts WHERE tenant_id = water_a LIMIT 1;
  SELECT property_id INTO prop_e FROM public.utility_accounts WHERE tenant_id = elec_a LIMIT 1;

  CREATE TEMP TABLE _iso (
    actor text,
    check_name text,
    ok boolean,
    detail text
  ) ON COMMIT DROP;

  -- ---------- Water A admin ----------
  PERFORM set_config('request.jwt.claim.sub', actor_wa::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_wa::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  can_own := public.can_manage_utility_ops(water_a);
  can_other := public.can_manage_utility_ops(water_b);
  can_cross := public.can_manage_utility_ops(elec_a);
  SELECT count(*) INTO c_own FROM public.utility_accounts WHERE tenant_id = water_a;
  SELECT count(*) INTO c_other FROM public.utility_accounts WHERE tenant_id = water_b;
  SELECT count(*) INTO c_cross FROM public.utility_accounts WHERE tenant_id = elec_a;

  BEGIN
    UPDATE public.utility_accounts SET account_number = account_number
    WHERE id = (SELECT id FROM public.utility_accounts WHERE tenant_id = water_b LIMIT 1);
    GET DIAGNOSTICS upd_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    upd_count := -1;
  END;

  EXECUTE 'RESET ROLE';

  INSERT INTO _iso VALUES
    ('water_a_admin', 'can_manage_own', can_own, format('own_accounts=%s', c_own)),
    ('water_a_admin', 'cannot_manage_water_b', NOT can_other, format('ops=%s', can_other)),
    ('water_a_admin', 'cannot_manage_elec_a', NOT can_cross, format('ops=%s', can_cross)),
    ('water_a_admin', 'cannot_select_water_b_accounts', c_other = 0, format('rows=%s', c_other)),
    ('water_a_admin', 'cannot_select_elec_a_accounts', c_cross = 0, format('rows=%s', c_cross)),
    ('water_a_admin', 'cannot_update_water_b_account', upd_count IN (0, -1), format('row_count=%s', upd_count));

  -- Mutation attacks as Water A
  PERFORM set_config('request.jwt.claim.sub', actor_wa::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_wa::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    acct := 'HACK-INS-' || substr(md5(random()::text), 1, 8);
    INSERT INTO public.utility_accounts (
      tenant_id, property_id, service_type, account_number, unit_price, status
    ) VALUES (water_b, prop_b, 'water', acct, 1, 'active');
    RAISE EXCEPTION 'FAIL: Water A inserted into Water B';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.register_utility_house(
      water_b, 'HACK ADDR', 'HACK-RPC-' || substr(md5(random()::text), 1, 6),
      10, 'hack', NULL, NULL, NULL, NULL, NULL, NULL, 'house'
    );
    RAISE EXCEPTION 'FAIL: Water A register_utility_house on Water B';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
  END;

  EXECUTE 'RESET ROLE';
  INSERT INTO _iso VALUES
    ('water_a_admin', 'cannot_insert_water_b', true, 'blocked'),
    ('water_a_admin', 'cannot_rpc_register_water_b', true, 'blocked');

  -- ---------- Electricity A admin ----------
  PERFORM set_config('request.jwt.claim.sub', actor_ea::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_ea::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  can_own := public.can_manage_utility_ops(elec_a);
  can_eb := public.can_manage_utility_ops(elec_b);
  can_cross := public.can_manage_utility_ops(water_a);
  SELECT count(*) INTO c_own FROM public.utility_accounts WHERE tenant_id = elec_a;
  SELECT count(*) INTO c_other FROM public.utility_accounts WHERE tenant_id = elec_b;
  SELECT count(*) INTO c_cross FROM public.utility_accounts WHERE tenant_id = water_a;

  BEGIN
    acct := 'HACK-EB-' || substr(md5(random()::text), 1, 8);
    INSERT INTO public.utility_accounts (
      tenant_id, property_id, service_type, account_number, unit_price, status
    ) VALUES (elec_b, prop_e, 'electricity', acct, 1, 'active');
    RAISE EXCEPTION 'FAIL: Elec A inserted into Elec B';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.register_utility_house(
      water_a, 'HACK E->W', 'HACK-EW-' || substr(md5(random()::text), 1, 6),
      10, 'hack', NULL, NULL, NULL, NULL, NULL, NULL, 'house'
    );
    RAISE EXCEPTION 'FAIL: Elec A register_utility_house on Water A';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
  END;

  EXECUTE 'RESET ROLE';

  INSERT INTO _iso VALUES
    ('elec_a_admin', 'can_manage_own', can_own, format('own_accounts=%s', c_own)),
    ('elec_a_admin', 'cannot_manage_elec_b', NOT can_eb, format('ops=%s', can_eb)),
    ('elec_a_admin', 'cannot_manage_water_a', NOT can_cross, format('ops=%s', can_cross)),
    ('elec_a_admin', 'cannot_select_elec_b_accounts', c_other = 0, format('rows=%s', c_other)),
    ('elec_a_admin', 'cannot_select_water_a_accounts', c_cross = 0, format('rows=%s', c_cross)),
    ('elec_a_admin', 'cannot_insert_elec_b', true, 'blocked'),
    ('elec_a_admin', 'cannot_rpc_register_water_a', true, 'blocked');

  IF EXISTS (SELECT 1 FROM public.utility_accounts WHERE account_number LIKE 'HACK-%') THEN
    RAISE EXCEPTION 'FAIL: hack accounts persisted';
  END IF;

  IF EXISTS (SELECT 1 FROM _iso WHERE NOT ok) THEN
    RAISE EXCEPTION 'ISOLATION FAILURES: %',
      (SELECT string_agg(actor || '.' || check_name, ', ') FROM _iso WHERE NOT ok);
  END IF;
END $$;

SELECT 'utility_tenant_isolation_probe PASSED' AS result;
