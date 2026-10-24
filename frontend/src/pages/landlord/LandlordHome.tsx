import { useAuth } from "@/auth/AuthProvider";
import { LandlordDashboard } from "@/pages/landlord/LandlordDashboard";
import { StaffDashboard } from "@/pages/landlord/StaffDashboard";

/** Role-aware landlord home: staff vs admin dashboards. */
export function LandlordHome() {
  const { activeMembership } = useAuth();
  if (activeMembership?.role === "landlord_staff") {
    return <StaffDashboard />;
  }
  return <LandlordDashboard />;
}
