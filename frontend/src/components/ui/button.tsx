import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[#6c63ff] text-white shadow-sm hover:bg-[#5b52ee]",
        secondary: "border border-[#6c63ff] bg-white text-[#6c63ff] hover:bg-[#f5f3ff]",
        ghost: "bg-transparent text-[#6b7280] hover:bg-[#f9fafb]",
        outline: "border border-[#d1d5db] bg-white text-[#374151] hover:bg-[#f9fafb]",
        danger: "bg-[#dc2626] text-white hover:bg-[#b91c1c]"
      },
      size: {
        default: "h-10",
        sm: "h-9 px-3 text-sm",
        lg: "h-11 px-5 text-sm"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
