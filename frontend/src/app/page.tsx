'use client';

import ScenarioCard from '@/components/home/ScenarioCard';

export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-10 min-h-[calc(100vh-56px)] overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary-700 rounded-2xl flex items-center justify-center text-4xl mb-4">
          🦷
        </div>
        <h1 className="text-3xl font-extrabold text-slate-800 mb-2">
          Trợ lý Lâm sàng Phục hình
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed max-w-xl">
          Hỗ trợ sinh viên RHM phân tích case · AI-powered
        </p>
      </div>

      {/* Scenario Cards */}
      <div className="flex gap-5 max-w-3xl flex-wrap justify-center">
        <ScenarioCard
          href="/case/fracture"
          icon="🦷"
          title="Răng vỡ / Sâu nặng"
          description="Đánh giá khả năng phục hồi và lựa chọn loại phục hình tối ưu cho răng tổn thương lớn"
          tags={[
            'Composite · Inlay · Onlay',
            'Mão răng (toàn sứ / PFM / kim loại)',
            'Trụ nội + Core + Mão',
            'Tiên lượng và chỉ định nhổ',
          ]}
        />
        <ScenarioCard
          href="/case/missing"
          icon="🔬"
          title="Mất răng đơn lẻ"
          description="Phân tích chỉ định và lựa chọn phương pháp phục hình mất răng phù hợp nhất"
          tags={[
            'Implant nha khoa (tiêu chuẩn vàng)',
            'Cầu răng cố định (FPD)',
            'Hàm tháo lắp một phần (RPD)',
            'So sánh ưu / nhược điểm',
          ]}
        />
      </div>

      {/* Footer info */}
      <p className="mt-8 text-xs text-slate-400 text-center">
        Xưng hô: Thầy – Em · Phân tích theo phương pháp Socratic · Tiếng Việt
      </p>
    </div>
  );
}
