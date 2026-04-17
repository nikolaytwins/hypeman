import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm tracking-tight text-slate-900 outline-none transition-[border-color,box-shadow] duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-slate-500 placeholder:text-slate-400 focus:border-violet-400 focus:shadow-[0_0_0_1px_rgba(167,139,250,0.5),0_0_20px_-4px_rgba(124,58,237,0.2)] disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
