import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Trợ lý AI Giáo dục Y khoa",
  description:
    "AI Agent hỗ trợ giảng dạy và học tập y khoa dựa trên y học bằng chứng.",
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
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header />
            <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
            <Footer />
          </div>
        </div>
      </body>
    </html>
  );
}
