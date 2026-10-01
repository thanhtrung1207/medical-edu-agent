import { BookOpenCheck, FileText, GraduationCap, Stethoscope } from "lucide-react";

const features = [
  { icon: FileText, label: "Case study theo ca lâm sàng" },
  { icon: GraduationCap, label: "Quiz luyện thi & spaced repetition" },
  { icon: BookOpenCheck, label: "Câu trả lời có nguồn tham khảo" },
];

export function LoginBrandPanel() {
  return (
    <section className="relative hidden flex-1 overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary-900 via-primary to-primary-700 p-8 text-white shadow-2xl shadow-primary/25 md:flex md:flex-col md:justify-between">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-secondary/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-10 h-64 w-64 rounded-full border border-white/10" />

      <div className="relative">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <Stethoscope className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xl font-bold">UniDent</div>
            <div className="text-xs text-white/70">AI Dental Education</div>
          </div>
        </div>

        <h2 className="mt-10 max-w-sm text-4xl font-extrabold leading-tight tracking-tight">
          Học nha khoa với trợ lý AI có trích dẫn.
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-6 text-white/75">
          Một không gian học tập cao cấp cho case study, quiz luyện thi và câu trả lời có nguồn rõ ràng.
        </p>
      </div>

      <div className="relative space-y-3">
        {features.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-3 text-sm text-white/90"
          >
            <Icon className="h-4 w-4 text-secondary-100" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
