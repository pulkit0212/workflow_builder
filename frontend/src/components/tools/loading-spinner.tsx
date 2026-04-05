import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type LoadingSpinnerProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

export function LoadingSpinner({ className, size = "md" }: LoadingSpinnerProps) {
  return (
    <LoaderCircle
      className={cn(
        "animate-spin",
        size === "sm" && "h-4 w-4",
        size === "md" && "h-5 w-5",
        size === "lg" && "h-6 w-6",
        className
      )}
    />
  );
}
