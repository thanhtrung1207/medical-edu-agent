import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "UniDent — Trợ lý AI Giáo dục Nha khoa",
  description:
    "UniDent hỗ trợ sinh viên Răng Hàm Mặt phân tích case lâm sàng và học tập dựa trên y học bằng chứng.",
  icons: { icon: "/logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#8B1E3F",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={inter.className} suppressHydrationWarning>
      <body>
        <div className="flex h-screen w-full overflow-hidden bg-cream text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          {/* AppShell is the client boundary that owns drawer state; this
              layout stays a server component for metadata rendering. */}
          <AppShell>{children}</AppShell>
        </div>
      </body>
    </html>
  );
}
