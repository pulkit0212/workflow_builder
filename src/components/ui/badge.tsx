import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
  {
    variants: {
      variant: {
        available: "border-transparent bg-[#f0fdf4] text-[#15803d]",
        pending: "border-transparent bg-[#fefce8] text-[#ca8a04]",
        neutral: "border-transparent bg-[#f3f4f6] text-[#6b7280]",
        info: "border-transparent bg-[#eff6ff] text-[#2563eb]",
        accent: "border-transparent bg-[#faf5ff] text-[#7c3aed]",
        danger: "border-transparent bg-[#fef2f2] text-[#dc2626]"
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
