# IJAARO backend helpers

Phase 1 privileged workflows run as:

1. **PostgreSQL RPCs** (`provision_tenant`, `set_tenant_status`, `manage_membership`) — authorization + audit inside the database.
2. **Supabase Edge Functions** in `supabase/functions/` — thin HTTP wrappers that forward the caller JWT and invoke those RPCs.

This `backend/` folder holds shared TypeScript types for those server workflows. Do **not** put the service-role key in the frontend.
