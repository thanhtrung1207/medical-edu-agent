"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Edit3,
  ExternalLink,
  FileText,
  HelpCircle,
  Layers,
  PanelRightClose,
  Plus,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import type { ClinicalRecordData, ToothStatus } from "@/lib/clinical-record/types";
import { TOOTH_CONDITIONS } from "@/components/clinical-record/ToothPopover";

const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

function getToothName(tooth: number): string {
  const jaw = tooth >= 11 && tooth <= 28 ? "hàm trên" : "hàm dưới";
  const side = (tooth >= 11 && tooth <= 18) || (tooth >= 41 && tooth <= 48) ? "phải" : "trái";
  const pos = tooth % 10;
  let type = "Răng";
  if (pos === 1) type = "Răng cửa giữa";
  else if (pos === 2) type = "Răng cửa bên";
  else if (pos === 3) type = "Răng nanh";
  else if (pos === 4) type = "Răng cối nhỏ 1 (tiền cối 1)";
  else if (pos === 5) type = "Răng cối nhỏ 2 (tiền cối 2)";
  else if (pos === 6) type = "Răng cối lớn 1 (răng 6)";
  else if (pos === 7) type = "Răng cối lớn 2 (răng 7)";
  else if (pos === 8) type = "Răng cối lớn 3 (răng khôn 8)";
  return `${type} ${jaw} ${side} (#${tooth})`;
}

const CLINICAL_STAGES = [
  { step: 1, title: "Khám bệnh", short: "Khám", prompt: "Hãy đặt câu hỏi Socratic hướng dẫn tôi khai thác chi tiết bệnh sử và lý do khám của ca này" },
  { step: 2, title: "Chẩn đoán PB", short: "Chẩn đoán", prompt: "Dựa trên triệu chứng hiện có, hãy gợi mở các giả thuyết chẩn đoán phân biệt chính" },
  { step: 3, title: "Cận lâm sàng", short: "CLS & Phim", prompt: "Cần chỉ định thêm X-quang quanh chóp, Panorama hay CBCT nào để xác định chẩn đoán?" },
  { step: 4, title: "Lập phác đồ", short: "Phác đồ", prompt: "Xây dựng các phương án điều trị và phục hình toàn diện theo hướng dẫn ITI/ADA" },
];

const ELLIS_CLASSES = [
  {
    classNum: "Class I",
    title: "Gãy men răng",
    color: "emerald",
    severity: "Nhẹ",
    desc: "Chấn thương chỉ giới hạn ở lớp men răng, không nhạy cảm với nhiệt độ.",
    action: "Mài nhẵn bờ sắc cạnh hoặc trám composite thẩm mỹ.",
    prompt: "Phân tích hướng xử trí và theo dõi tủy cho chấn thương gãy Ellis Class I",
  },
  {
    classNum: "Class II",
    title: "Gãy men & ngà răng",
    color: "amber",
    severity: "Trung bình",
    desc: "Tổn thương qua men vào ngà nhưng chưa lộ tủy. Răng ê buốt khi gặp nóng/lạnh.",
    action: "Bảo vệ tủy bằng Ca(OH)2 hoặc MTA, trám lót và phục hồi composite.",
    prompt: "Quy trình bảo vệ phức hợp tủy - ngà trong gãy Ellis Class II",
  },
  {
    classNum: "Class III",
    title: "Gãy hở tủy răng",
    color: "orange",
    severity: "Nặng",
    desc: "Lộ buồng tủy, chảy máu tại điểm hở, đau nhức dữ dội.",
    action: "Lấy tủy buồng / che tủy trực tiếp nếu tủy còn tươi, hoặc điều trị nội nha toàn phần.",
    prompt: "Chỉ định che tủy trực tiếp vs lấy tủy buồng trong gãy Ellis Class III",
  },
  {
    classNum: "Class IV",
    title: "Chết tủy / Mất thân răng",
    color: "rose",
    severity: "Rất nặng",
    desc: "Răng đổi màu, mất tủy sống do sang chấn mạch máu vùng cuống hoặc vỡ lớn dưới nướu.",
    action: "Nội nha toàn phần, chốt tủy, tái tạo cùi và bọc mão sứ bảo vệ.",
    prompt: "Chiến lược phục hồi răng đổi màu và vỡ lớn sau chấn thương Ellis Class IV",
  },
];

const GUIDELINES = [
  {
    title: "ITI Consensus 2023 · Implant đơn lẻ",
    organization: "International Team for Implantology (ITI)",
    keypoint: "Đánh giá khoảng sinh học tối thiểu 1.5mm giữa implant và răng thật kế cận, 3.0mm giữa hai implant liền kề.",
    prompt: "Theo ITI Consensus 2023, khoảng cách tối thiểu giữa implant và răng thật là bao nhiêu?",
  },
  {
    title: "ADA Guideline · Kháng sinh dự phòng",
    organization: "American Dental Association (ADA)",
    keypoint: "Chỉ định Amoxicillin 2g uống trước can thiệp 30-60 phút cho bệnh nhân có nguy cơ cao viêm nội tâm mạc nhiễm khuẩn.",
    prompt: "Phác đồ kháng sinh dự phòng theo ADA trước phẫu thuật nha khoa cho bệnh nhân có tiền sử tim mạch",
  },
  {
    title: "Phân loại SAC trong Implantology",
    organization: "ITI SAC Classification",
    keypoint: "Phân chia mức độ ca lâm sàng: S (Đơn giản), A (Nâng cao), C (Phức tạp) dựa trên rủi ro thẩm mỹ và giải phẫu.",
    prompt: "Tiêu chí xếp một ca cắm implant vùng thẩm mỹ vào nhóm Phức tạp (Complex) theo SAC",
  },
];

interface ClinicalStudioCanvasProps {
  activeRecord: ClinicalRecordData | null;
  onEditRecord?: (recordId: string) => void;
  onNewRecord?: () => void;
  onAskQuestion?: (prompt: string) => void;
  onClose?: () => void;
}

export function ClinicalStudioCanvas({
  activeRecord,
  onEditRecord,
  onNewRecord,
  onAskQuestion,
  onClose,
}: ClinicalStudioCanvasProps) {
  const [activeTab, setActiveTab] = useState<"case" | "chart" | "cards" | "guidelines">("case");
  const [currentStage, setCurrentStage] = useState(1);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(38);

  const recordData = activeRecord?.data as Record<string, any> | undefined;
  const dentalChart = (recordData?.dental_chart ?? {}) as Record<number, ToothStatus>;

  const annotatedTeeth = Object.entries(dentalChart).filter(
    ([, status]) => status?.condition && status.condition !== "normal"
  );

  return (
    <aside
      className="flex h-full w-full flex-col border-l border-slate-200/80 bg-slate-50/60 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/60"
      aria-label="Clinical Studio Canvas"
    >
      {/* Canvas Top Bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200/70 px-4 dark:border-slate-800/70">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary-950/60">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
              Clinical Canvas
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Không gian làm việc lâm sàng
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {activeRecord && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Case
            </span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng Clinical Canvas"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Clinical Mastery Stepper (Giai đoạn 3) */}
      <div className="border-b border-slate-200/60 bg-white/40 px-3.5 py-2 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/40">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-1.5 text-primary dark:text-primary-400 font-bold">
            <Activity className="h-3.5 w-3.5" />
            <span>Tiến trình Lâm sàng</span>
          </div>
          <span className="text-[10px] text-slate-400">
            Bước {currentStage}/4 ({currentStage * 25}%)
          </span>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {CLINICAL_STAGES.map((s) => {
            const isCompleted = s.step < currentStage;
            const isCurrent = s.step === currentStage;
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => setCurrentStage(s.step)}
                title={s.title}
                className={`flex flex-col items-center rounded-lg p-1 text-center transition ${
                  isCurrent
                    ? "bg-primary/10 text-primary dark:bg-primary-950/40 dark:text-primary-400 font-bold ring-1 ring-primary/30"
                    : isCompleted
                    ? "bg-emerald-50/80 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <div className="flex items-center gap-1 text-[10px]">
                  {isCompleted ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <span>{s.step}</span>
                  )}
                  <span className="truncate">{s.short}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200/60 bg-white/50 px-2 pt-1.5 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/50">
        <button
          type="button"
          onClick={() => setActiveTab("case")}
          className={`flex flex-1 items-center justify-center gap-1 border-b-2 py-2 text-xs font-semibold transition ${
            activeTab === "case"
              ? "border-primary text-primary dark:border-primary-400 dark:text-primary-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <FileText className="h-3 w-3" />
          <span>Bệnh án</span>
          {activeRecord && (
            <span className="rounded-full bg-primary/10 px-1 text-[9px] text-primary">
              1
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("chart")}
          className={`flex flex-1 items-center justify-center gap-1 border-b-2 py-2 text-xs font-semibold transition ${
            activeTab === "chart"
              ? "border-primary text-primary dark:border-primary-400 dark:text-primary-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Layers className="h-3 w-3" />
          <span>Sơ đồ răng</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("cards")}
          className={`flex flex-1 items-center justify-center gap-1 border-b-2 py-2 text-xs font-semibold transition ${
            activeTab === "cards"
              ? "border-primary text-primary dark:border-primary-400 dark:text-primary-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Sparkles className="h-3 w-3" />
          <span>Thẻ tri thức</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("guidelines")}
          className={`flex flex-1 items-center justify-center gap-1 border-b-2 py-2 text-xs font-semibold transition ${
            activeTab === "guidelines"
              ? "border-primary text-primary dark:border-primary-400 dark:text-primary-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <BookOpen className="h-3 w-3" />
          <span>Y văn ITI</span>
        </button>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        {/* TAB 1: BỆNH ÁN ĐIỆN TỬ */}
        {activeTab === "case" && (
          <div className="space-y-4">
            {activeRecord ? (
              <>
                {/* Active Case Card */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/90">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
                    <div>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary dark:bg-primary-950/60">
                        {activeRecord.schemaId === "co-dinh"
                          ? "Phục hình Cố định"
                          : "Phục hình Tháo lắp"}
                      </span>
                      <h4 className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                        {recordData?.ho_ten || "Bệnh nhân ẩn danh"}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {recordData?.gioi_tinh ? `${recordData.gioi_tinh} · ` : ""}
                        {recordData?.nam_sinh ? `Sinh năm ${recordData.nam_sinh}` : "Chưa có năm sinh"}
                      </p>
                    </div>
                    {onEditRecord && (
                      <button
                        type="button"
                        onClick={() => onEditRecord(activeRecord.id)}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        <Edit3 className="h-3 w-3" />
                        <span>Sửa</span>
                      </button>
                    )}
                  </div>

                  {/* Chief complaint & Clinical history */}
                  <div className="mt-3 space-y-2 text-xs">
                    {recordData?.ly_do_kham && (
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Lý do khám:
                        </span>{" "}
                        <span className="text-slate-600 dark:text-slate-400">
                          {recordData.ly_do_kham}
                        </span>
                      </div>
                    )}
                    {recordData?.suc_khoe_chung && (
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Sức khỏe toàn thân:
                        </span>{" "}
                        <span className="text-slate-600 dark:text-slate-400">
                          {recordData.suc_khoe_chung}
                        </span>
                      </div>
                    )}
                    {recordData?.chan_doan && (
                      <div className="rounded-lg bg-amber-50 p-2 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        <span className="font-semibold">Chẩn đoán:</span> {recordData.chan_doan}
                      </div>
                    )}
                  </div>

                  {/* Dental Chart Summary */}
                  <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      RĂNG CẦN CHÚ Ý (FDI CHART):
                    </span>
                    {annotatedTeeth.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {annotatedTeeth.map(([tooth, status]) => {
                          const option = TOOTH_CONDITIONS.find(
                            (c) => c.value === status.condition
                          );
                          return (
                            <span
                              key={tooth}
                              className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1 text-xs font-medium text-primary dark:bg-primary-950/30 dark:text-primary-300"
                            >
                              <span className="font-bold">#{tooth}</span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                ({option?.label ?? status.condition})
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs italic text-slate-400">
                        Chưa có răng nào được đánh dấu tổn thương.
                      </p>
                    )}
                  </div>
                </div>

                {/* Socratic Discussion Prompts */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/90">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <HelpCircle className="h-4 w-4 text-primary" />
                    <span>HỎI SOCRATIC VỀ CA NÀY</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Nhấn vào câu hỏi bên dưới để thảo luận trực tiếp cùng trợ lý AI:
                  </p>
                  <div className="mt-3 space-y-2">
                    {[
                      "Phân tích phương án phục hình tối ưu dựa trên ca bệnh đang mở",
                      "Đánh giá các chống chỉ định lâm sàng theo bệnh sử của bệnh nhân",
                      "Cần chỉ định thêm cận lâm sàng (X-quang quanh chóp / CBCT) nào?",
                    ].map((prompt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onAskQuestion?.(prompt)}
                        className="group flex w-full items-center justify-between rounded-xl border border-slate-200/70 bg-slate-50/70 p-2.5 text-left text-xs font-medium text-slate-700 transition hover:border-primary hover:bg-primary/5 hover:text-primary dark:border-slate-700/70 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-primary-400"
                      >
                        <span className="flex-1 pr-2">{prompt}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* Empty Case State */
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center dark:border-slate-700 dark:bg-slate-850/60">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Stethoscope className="h-6 w-6" />
                </div>
                <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">
                  Chưa có bệnh án đang mở
                </h4>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Tạo bệnh án để trợ lý AI cá nhân hoá câu hỏi Socratic và đối chiếu guideline ITI chính xác.
                </p>
                {onNewRecord && (
                  <button
                    type="button"
                    onClick={onNewRecord}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Mở Bệnh án Mới (/benh-an)</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SƠ ĐỒ 32 RĂNG TƯƠNG TÁC (ODONTOGRAM 2D) */}
        {activeTab === "chart" && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Layers className="h-3.5 w-3.5" />
                </span>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Sơ đồ 32 Răng FDI (2D Odontogram)
                </h4>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Nhấn chọn một răng để xem giải phẫu và gửi câu hỏi lâm sàng vào Chat:
              </p>
            </div>

            {/* Jaw Visual Grid */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-800/90">
              {/* Upper Jaw */}
              <div className="mb-3">
                <span className="text-[10px] font-bold uppercase text-slate-400">
                  Hàm trên (Maxillary)
                </span>
                <div className="mt-1 grid grid-cols-8 gap-1">
                  {UPPER_TEETH.map((tooth) => {
                    const status = dentalChart[tooth];
                    const isAnnotated = status && status.condition !== "normal";
                    const isSelected = selectedTooth === tooth;

                    let bgClass = "bg-slate-50 border-slate-200 text-slate-700";
                    if (isAnnotated) {
                      if (status.condition === "decay") bgClass = "bg-red-50 border-red-400 text-red-700 font-bold";
                      else if (status.condition === "missing") bgClass = "bg-slate-200 border-slate-400 text-slate-400";
                      else if (status.condition === "restored") bgClass = "bg-sky-50 border-sky-400 text-sky-700 font-bold";
                      else if (status.condition === "mobile") bgClass = "bg-amber-50 border-amber-400 text-amber-700 font-bold";
                      else bgClass = "bg-purple-50 border-purple-400 text-purple-700 font-bold";
                    }

                    return (
                      <button
                        key={tooth}
                        type="button"
                        onClick={() => setSelectedTooth(tooth)}
                        className={`flex h-8 items-center justify-center rounded-lg border text-xs transition ${bgClass} ${
                          isSelected
                            ? "ring-2 ring-primary ring-offset-1 font-bold shadow-sm"
                            : "hover:border-primary/50"
                        }`}
                      >
                        {tooth}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lower Jaw */}
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">
                  Hàm dưới (Mandibular)
                </span>
                <div className="mt-1 grid grid-cols-8 gap-1">
                  {LOWER_TEETH.map((tooth) => {
                    const status = dentalChart[tooth];
                    const isAnnotated = status && status.condition !== "normal";
                    const isSelected = selectedTooth === tooth;

                    let bgClass = "bg-slate-50 border-slate-200 text-slate-700";
                    if (isAnnotated) {
                      if (status.condition === "decay") bgClass = "bg-red-50 border-red-400 text-red-700 font-bold";
                      else if (status.condition === "missing") bgClass = "bg-slate-200 border-slate-400 text-slate-400";
                      else if (status.condition === "restored") bgClass = "bg-sky-50 border-sky-400 text-sky-700 font-bold";
                      else if (status.condition === "mobile") bgClass = "bg-amber-50 border-amber-400 text-amber-700 font-bold";
                      else bgClass = "bg-purple-50 border-purple-400 text-purple-700 font-bold";
                    }

                    return (
                      <button
                        key={tooth}
                        type="button"
                        onClick={() => setSelectedTooth(tooth)}
                        className={`flex h-8 items-center justify-center rounded-lg border text-xs transition ${bgClass} ${
                          isSelected
                            ? "ring-2 ring-primary ring-offset-1 font-bold shadow-sm"
                            : "hover:border-primary/50"
                        }`}
                      >
                        {tooth}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Selected Tooth Inspector Card */}
            {selectedTooth !== null && (
              <div className="rounded-2xl border border-primary/20 bg-white p-3.5 shadow-sm dark:border-primary/30 dark:bg-slate-800">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                      FDI #{selectedTooth}
                    </span>
                    <h5 className="mt-1 text-xs font-bold text-slate-900 dark:text-slate-100">
                      {getToothName(selectedTooth)}
                    </h5>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Tình trạng hiện tại:{" "}
                      <span className="font-semibold text-primary">
                        {dentalChart[selectedTooth]?.condition
                          ? TOOTH_CONDITIONS.find(
                              (c) => c.value === dentalChart[selectedTooth].condition
                            )?.label ?? dentalChart[selectedTooth].condition
                          : "Bình thường / Chưa ghi nhận bệnh lý"}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-700">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Gợi ý câu hỏi Socratic cho răng #{selectedTooth}:
                  </span>
                  {[
                    `Phân tích hình thái giải phẫu chân răng và tương quan xương của răng #${selectedTooth}`,
                    `Đánh giá chỉ định nhổ vs giữ lại để làm trụ cầu cho răng #${selectedTooth}`,
                    `Nếu răng #${selectedTooth} bị mất, phương án cắm Implant có ưu thế gì hơn cầu răng?`,
                  ].map((prompt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onAskQuestion?.(prompt)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50/70 p-2 text-left text-xs text-slate-700 transition hover:border-primary hover:bg-primary/5 hover:text-primary dark:border-slate-700 dark:bg-slate-750 dark:text-slate-200"
                    >
                      <span className="flex-1 pr-1.5 text-[11px]">{prompt}</span>
                      <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: THẺ TRI THỨC ĐỒ HOẠ (ELLIS & IMPLANT MATRIX) */}
        {activeTab === "cards" && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Phân loại Gãy Răng theo Ellis
                </h4>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Hệ thống phân cấp chấn thương thân răng kinh điển trong Nha khoa:
              </p>
            </div>

            <div className="space-y-2.5">
              {ELLIS_CLASSES.map((item) => (
                <div
                  key={item.classNum}
                  className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm transition hover:shadow-md dark:border-slate-700/80 dark:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                        {item.classNum}
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        {item.title}
                      </span>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {item.severity}
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {item.desc}
                  </p>

                  <div className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-750 dark:text-slate-300">
                    <span className="font-semibold text-primary">Xử trí:</span> {item.action}
                  </div>

                  <button
                    type="button"
                    onClick={() => onAskQuestion?.(item.prompt)}
                    className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-lg border border-primary/20 bg-primary/5 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary hover:text-white"
                  >
                    <span>Hỏi AI về {item.classNum}</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Matrix Implant vs FDP */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-700/80 dark:bg-slate-800">
              <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                So sánh Implant vs Cầu răng cố định (FDP)
              </h5>
              <div className="mt-2 space-y-2 text-xs">
                <div className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-slate-700">
                  <span className="text-slate-500">Bảo tồn răng kế cận</span>
                  <span className="font-semibold text-emerald-600">Implant tối ưu</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-slate-700">
                  <span className="text-slate-500">Chống tiêu xương ổ</span>
                  <span className="font-semibold text-emerald-600">Implant kích thích xương</span>
                </div>
                <div className="flex justify-between pb-0.5">
                  <span className="text-slate-500">Thời gian điều trị</span>
                  <span className="font-semibold text-amber-600">Cầu răng nhanh hơn</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onAskQuestion?.(
                    "So sánh chi tiết ưu nhược điểm giữa Implant và Cầu răng theo ITI"
                  )
                }
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-slate-100 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
              >
                <span>Hỏi Socratic về Ma trận lựa chọn này</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: GUIDELINES Y VĂN */}
        {activeTab === "guidelines" && (
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Evidence-based Guidelines
                </h4>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Các đồng thuận và hướng dẫn lâm sàng chuẩn mực được nạp trong bộ não AI:
              </p>
            </div>

            {GUIDELINES.map((guide, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-700/80 dark:bg-slate-800"
              >
                <div className="flex items-start justify-between gap-1">
                  <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {guide.title}
                  </h5>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    Verified
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                  {guide.organization}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  &ldquo;{guide.keypoint}&rdquo;
                </p>
                <button
                  type="button"
                  onClick={() => onAskQuestion?.(guide.prompt)}
                  className="mt-2.5 flex items-center gap-1 text-xs font-semibold text-primary hover:underline dark:text-primary-400"
                >
                  <span>Thảo luận khuyến cáo này với AI</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
