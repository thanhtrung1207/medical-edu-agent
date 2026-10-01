import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "muted";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary-700 disabled:hover:bg-primary",
  secondary:
    "bg-secondary text-primary-900 shadow-lg shadow-secondary/20 hover:bg-secondary-600",
  outline:
    "border border-borderSoft bg-white text-slate-700 hover:border-primary/40 hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  muted:
    "bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-[40px] px-3 text-xs",
  md: "min-h-[44px] px-4 text-sm",
  lg: "min-h-[48px] px-5 text-sm",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-80",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
