"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Clock,
  FileText,
  ListChecks,
  MessageSquare,
  Stethoscope,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SessionList } from "./SessionList";

const NAV = [
  { href: "/", label: "Ca lâm sàng", icon: Stethoscope },
  { href: "/chat", label: "Trò chuyện", icon: MessageSquare },
  { href: "/history", label: "Lịch sử", icon: Clock },
  { href: "/quiz", label: "Trắc nghiệm", icon: ListChecks },
  { href: "/progress", label: "Tiến độ", icon: TrendingUp },
  { href: "/upload", label: "Tài liệu", icon: FileText },
];

// External link to the standalone Quarto knowledge base site.
// TODO: replace "#" with the deployed site URL (GitHub Pages / Vercel).
const KNOWLEDGE_BASE_URL = "#";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:flex">
      {/* Brand */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
          <Stethoscope className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Phục hình AI
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Trợ lý Phục hình
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-3 py-3">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <a
              href={KNOWLEDGE_BASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <BookOpen className="h-4 w-4" />
              📖 Knowledge Base
            </a>
          </li>
        </ul>
      </nav>

      {/* Recent chat sessions */}
      <SessionList />
    </aside>
  );
}
