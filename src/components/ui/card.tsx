import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[1.75rem] border border-white/80 bg-white/92 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-sm",
        className
      )}
      {...props}
    />
  );
}
