import { Navigate } from "react-router-dom";

/**
 * Public self-signup for tenant admins lives in the create-workspace flow.
 * Keep /signup as a stable alias.
 */
export function SignupPage() {
  return <Navigate to="/create-workspace" replace />;
}
