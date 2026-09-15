import {
  BookOpen,
  Clock,
  FileText,
  ListChecks,
  MessageSquare,
  Stethoscope,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Primary app navigation shared by the Sidebar and the mobile Drawer. */
export const NAV: NavItem[] = [
  { href: "/", label: "Ca lâm sàng", icon: Stethoscope },
  { href: "/chat", label: "Trò chuyện", icon: MessageSquare },
  { href: "/history", label: "Lịch sử", icon: Clock },
  { href: "/quiz", label: "Trắc nghiệm", icon: ListChecks },
  { href: "/progress", label: "Tiến độ", icon: TrendingUp },
  { href: "/upload", label: "Tài liệu", icon: FileText },
];

// External link to the standalone Quarto knowledge base site.
// TODO: replace "#" with the deployed site URL (GitHub Pages / Vercel).
export const KNOWLEDGE_BASE_URL = "#";

/** Icon for the external knowledge base link (shared by Sidebar/Drawer). */
export const KNOWLEDGE_BASE_ICON = BookOpen;
