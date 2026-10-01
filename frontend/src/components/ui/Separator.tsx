import { cn } from "@/lib/utils";

interface SeparatorProps {
  label?: string;
  className?: string;
}

export function Separator({ label, className }: SeparatorProps) {
  if (!label) {
    return <div aria-hidden="true" className={cn("h-px w-full bg-borderSoft dark:bg-slate-700", className)} />;
  }

  return (
    <div className={cn("flex items-center gap-3 text-xs text-slate-400", className)}>
      <span aria-hidden="true" className="h-px flex-1 bg-borderSoft dark:bg-slate-700" />
      <span>{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-borderSoft dark:bg-slate-700" />
    </div>
  );
}
