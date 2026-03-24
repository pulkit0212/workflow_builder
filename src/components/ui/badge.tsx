import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
  {
    variants: {
      variant: {
        available: "border-emerald-200 bg-emerald-50 text-emerald-700",
        pending: "border-amber-200 bg-amber-50 text-amber-700",
        neutral: "border-slate-200 bg-slate-50 text-slate-700",
        info: "border-blue-200 bg-blue-50 text-blue-700",
        accent: "border-indigo-200 bg-indigo-50 text-indigo-700",
        danger: "border-rose-200 bg-rose-50 text-rose-700"
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
