import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/theme/ThemeProvider";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Prefer light-on-dark chrome (nav bars on navy). */
  variant?: "default" | "on-dark" | "ghost";
};

export function ThemeToggle({ className, variant = "default" }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        variant === "default" &&
          "border border-brand-power/70 bg-transparent text-brand-power hover:bg-brand-power/15 hover:border-brand-power dark:border-brand-power/60 dark:text-brand-power dark:hover:bg-brand-power/15",
        variant === "ghost" &&
          "text-muted-foreground hover:bg-muted hover:text-foreground",
        variant === "on-dark" &&
          "border border-white/15 bg-white/10 text-white hover:bg-white/15 dark:border-brand-power/60 dark:text-brand-power dark:hover:bg-brand-power/15 dark:hover:border-brand-power",
        className,
      )}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
