"use client";

import type { ReactNode } from "react";

interface FormSectionProps {
  number: number;
  title: string;
  children: ReactNode;
}

export function FormSection({ number, title, children }: FormSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 border-b border-borderSoft pb-1.5 mb-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold">
          {number}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {title}
        </span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}
