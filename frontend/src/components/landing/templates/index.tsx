import { ModernProfessional } from "./ModernProfessional";
import { CorporateTrust } from "./CorporateTrust";
import { MinimalClean } from "./MinimalClean";
import { ServiceShowcase } from "./ServiceShowcase";
import { CommunityConnect } from "./CommunityConnect";
import type { TenantLandingProps } from "./types";

export type { TenantLandingProps } from "./types";
export {
  servicesForTenantType,
  ContactSection,
  ServicesSection,
} from "./PublicSections";

export function TenantLandingTemplate(props: TenantLandingProps) {
  switch (props.templateId) {
    case "corporate_trust":
      return <CorporateTrust {...props} />;
    case "minimal_clean":
      return <MinimalClean {...props} />;
    case "service_showcase":
      return <ServiceShowcase {...props} />;
    case "community_connect":
      return <CommunityConnect {...props} />;
    case "modern_professional":
    default:
      return <ModernProfessional {...props} />;
  }
}
