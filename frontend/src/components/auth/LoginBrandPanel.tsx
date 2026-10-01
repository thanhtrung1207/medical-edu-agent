import { Stethoscope } from "lucide-react";

export function LoginBrandPanel() {
  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary to-primary-900 p-10 text-center text-white md:flex">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
        <Stethoscope className="h-8 w-8" />
      </div>
      <div className="text-2xl font-bold">UniDent</div>
      <p className="max-w-xs text-sm text-white/80">
        Học nha khoa cùng AI — hỏi đáp, case study, quiz có trích dẫn
      </p>
    </div>
  );
}
