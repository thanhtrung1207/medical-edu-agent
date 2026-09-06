import { ShieldAlert } from "lucide-react";

export function Footer() {
  return (
    <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400 dark:text-slate-500">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        Thông tin chỉ mang tính tham khảo học thuật, không thay thế tư vấn y khoa
        chuyên nghiệp. Luôn tham vấn bác sĩ trước khi ra quyết định lâm sàng.
      </p>
    </footer>
  );
}
