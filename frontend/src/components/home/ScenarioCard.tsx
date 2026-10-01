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
      <Card className="h-full overflow-hidden transition duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 group-focus-visible:ring-4 group-focus-visible:ring-primary/20">
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
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="muted">
                {tag}
              </Badge>
            ))}
          </div>
          <div className="mt-6 flex min-h-[44px] items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white transition group-hover:bg-primary-700">
            Bắt đầu phân tích
            <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
