import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "min-h-[120px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm tracking-tight text-slate-900 shadow-none outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-slate-400 focus:border-violet-400 focus:shadow-[0_0_0_1px_rgba(167,139,250,0.5),0_0_20px_-4px_rgba(124,58,237,0.2)] disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
