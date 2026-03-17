import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
  {
    variants: {
      variant: {
        available: "bg-emerald-100 text-emerald-700",
        pending: "bg-amber-100 text-amber-700",
        neutral: "bg-slate-100 text-slate-700"
      }
    },
    defaultVariants: {
      variant: "neutral"
    }
  }
);

type BadgeProps = VariantProps<typeof badgeVariants> & {
  className?: string;
  children: ReactNode;
};

export function Badge({ className, variant, children }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}
