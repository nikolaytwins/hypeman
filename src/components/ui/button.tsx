import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium tracking-tight transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f7fc] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-slate-200/90 bg-white/80 text-slate-900 shadow-sm backdrop-blur-md hover:bg-white hover:border-slate-300",
        /** High-gloss violet CTA */
        gloss:
          "relative isolate overflow-hidden border border-violet-400/50 bg-gradient-to-b from-[#A855F7] via-[#9333EA] to-[#7C3DED] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.45),0_10px_36px_-10px_rgba(124,58,237,0.45)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.55),0_14px_44px_-8px_rgba(192,38,211,0.35)] active:scale-[0.99] motion-safe:animate-gloss-pulse disabled:animate-none disabled:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.28)]",
        secondary:
          "border border-slate-200/90 bg-white/60 text-slate-800 backdrop-blur-xl hover:border-violet-200 hover:bg-white",
        ghost: "text-slate-500 hover:bg-slate-100/80 hover:text-slate-800",
        outline:
          "border border-slate-200 bg-transparent text-slate-800 hover:border-violet-300 hover:bg-violet-50/50",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    if (variant === "gloss" && !asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          disabled={disabled}
          {...props}
        >
          {!disabled ? (
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-px w-[55%] skew-x-[-14deg] bg-gradient-to-r from-transparent via-white/40 to-transparent motion-safe:animate-gloss-shimmer"
            />
          ) : null}
          <span className="relative z-[1] flex items-center justify-center gap-2">{children}</span>
        </Comp>
      );
    }
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
