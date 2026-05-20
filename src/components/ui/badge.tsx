import * as React from "react"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: "default" | "secondary" | "destructive" | "outline";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
    const baseClass = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors";
    const variantClass = variant === "outline" ? "text-slate-950" : "border-transparent bg-slate-900 text-slate-50 hover:bg-slate-900/80";
  return (
    <div className={`${baseClass} ${variantClass} ${className || ''}`} {...props} />
  )
}

export { Badge }
