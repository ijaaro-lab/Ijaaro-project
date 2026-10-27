import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

export type WorkspaceTab = {
  to: string;
  label: string;
  end?: boolean;
};

export function WorkspaceTabs({
  tabs,
  tenantSearch = "",
  className,
}: {
  tabs: WorkspaceTab[];
  tenantSearch?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1 border-b border-border pb-px",
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={`${tab.to}${tenantSearch}`}
          end={tab.end}
          role="tab"
          className={({ isActive }) =>
            cn(
              "rounded-t-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              isActive &&
                "border-b-2 border-brand-water text-foreground dark:border-brand-water",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
