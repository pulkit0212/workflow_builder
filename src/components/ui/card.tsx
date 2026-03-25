import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "card-shadow rounded-xl border border-[#e5e7eb] bg-white",
        className
      )}
      {...props}
    />
  );
}
