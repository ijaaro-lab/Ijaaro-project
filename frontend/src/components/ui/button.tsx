import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-navy text-white hover:bg-[#132b4d] dark:bg-brand-power dark:text-brand-navy dark:hover:bg-[#e0b300]",
        secondary:
          "bg-brand-green text-white hover:bg-[#18964f] dark:hover:bg-[#22c06a]",
        outline:
          "border border-brand-green bg-transparent text-brand-green hover:bg-brand-green/10 dark:hover:bg-brand-green/15",
        ghost:
          "text-foreground hover:bg-muted dark:text-[#e8eef6] dark:hover:bg-brand-green/10",
        destructive:
          "bg-destructive text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
