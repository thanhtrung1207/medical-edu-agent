"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";

interface ScenarioCardProps {
  href: string;
  icon: string;
  title: string;
  description: string;
  tags: string[];
}

export default function ScenarioCard({
  href,
  icon,
  title,
  description,
  tags,
}: ScenarioCardProps) {
  return (
    <Link href={href} className="group block h-full focus:outline-none">
      <Card className="h-full overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:-translate-y-1 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10 group-focus-visible:ring-4 group-focus-visible:ring-primary/20">
        <CardContent className="flex h-full flex-col p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cream text-3xl shadow-inner shadow-white dark:bg-slate-800">
              {icon}
            </div>
            <Badge variant="secondary">Case study</Badge>
          </div>
          <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </p>
          <ul className="mt-4 space-y-1.5">
            {tags.map((tag) => (
              <li key={tag} className="flex items-baseline gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                {tag}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-5">
            <div className="flex min-h-[44px] items-center justify-between rounded-2xl bg-primary px-4 text-sm font-semibold text-white transition-all duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] active:scale-[0.98] group-hover:bg-primary-700">
              Bắt đầu phân tích
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 transition group-hover:bg-white/25">
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
