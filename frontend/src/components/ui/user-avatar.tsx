import { cn } from "@/lib/utils";

type Props = {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base",
  xl: "h-20 w-20 text-2xl",
};

function initialFrom(name?: string | null, email?: string | null) {
  const source = (name || email || "?").trim();
  return source.charAt(0).toUpperCase() || "?";
}

export function UserAvatar({ name, email, avatarUrl, size = "md", className }: Props) {
  const initial = initialFrom(name, email);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || email || "Profile"}
        className={cn(
          "shrink-0 rounded-full object-cover ring-2 ring-white/20",
          sizes[size],
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-green font-semibold text-white ring-2 ring-white/20",
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {initial}
    </span>
  );
}
