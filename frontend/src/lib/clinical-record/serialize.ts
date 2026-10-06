import { isFieldVisible, type ClinicalRecordSchema } from "./schemas";
import type { ToothStatus } from "./types";
import { scrubPII } from "./scrub";

const CONDITION_LABELS: Record<string, string> = {
  decay: "sâu",
  missing: "mất",
  restored: "phục hình",
  mobile: "lung lay",
  "treatment-needed": "cần điều trị",
};

const TOOTH_CONDITIONS = new Set<ToothStatus["condition"]>([
  "normal",
  "decay",
  "missing",
  "restored",
  "mobile",
  "treatment-needed",
]);

function scrubValue(value: unknown, fieldId?: string): string {
  if (value === undefined || value === null || typeof value === "object" || typeof value === "function") {
    return "";
  }

  const scrubbed = scrubPII(String(value), fieldId);
  return scrubbed.trim();
}

function isPermanentFdi(value: string): boolean {
  if (!/^\d{2}$/.test(value)) return false;

  const fdi = Number(value);
  const quadrant = Math.floor(fdi / 10);
  const position = fdi % 10;
  return quadrant >= 1 && quadrant <= 4 && position >= 1 && position <= 8;
}

function isToothStatus(value: unknown): value is ToothStatus {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const { condition, note } = value as { condition?: unknown; note?: unknown };
  return (
    typeof condition === "string"
    && TOOTH_CONDITIONS.has(condition as ToothStatus["condition"])
    && (note === undefined || typeof note === "string")
  );
}

function formatToothList(chart: unknown): string {
  if (typeof chart !== "object" || chart === null || Array.isArray(chart)) return "";

  return Object.entries(chart)
    .filter((entry): entry is [string, ToothStatus] => (
      isPermanentFdi(entry[0]) && isToothStatus(entry[1]) && entry[1].condition !== "normal"
    ))
    .map(([fdi, status]) => [Number(fdi), status] as const)
    .sort(([a], [b]) => a - b)
    .map(([fdi, status]) => {
      const label = CONDITION_LABELS[status.condition];
      const note = scrubValue(status.note);
      return note ? `${fdi}(${label} — ${note})` : `${fdi}(${label})`;
    })
    .join(", ");
}

function formatArray(values: unknown[], fieldId: string): string {
  return values
    .map((value) => scrubValue(value, fieldId))
    .filter(Boolean)
    .join(", ");
}

function formatChoiceObject(value: object, fieldId: string): string {
  const choice = value as { value?: unknown; text?: unknown };
  return [choice.value, choice.text]
    .map((part) => scrubValue(part, fieldId))
    .filter(Boolean)
    .join(" — ");
}

export function serializeClinicalRecord(
  schema: ClinicalRecordSchema,
  data: Record<string, unknown>,
): string {
  const lines = [`=== ${schema.title.toUpperCase()} ===`];

  const toothList = formatToothList(data.dental_chart);
  if (toothList) {
    lines.push(`Răng liên quan (FDI): ${toothList}`);
  }

  lines.push("", "[1. HÀNH CHÍNH]");

  const namSinhText = scrubValue(data.nam_sinh, "nam_sinh");
  const namSinh = Number(namSinhText);
  const currentYear = new Date().getFullYear();
  const age = /^\d{4}$/.test(namSinhText) && namSinh >= 1900 && namSinh <= currentYear
    ? currentYear - namSinh
    : null;
  const gioiTinh = scrubValue(data.gioi_tinh, "gioi_tinh");
  const ngheNghiep = scrubValue(data.nghe_nghiep, "nghe_nghiep");
  const adminParts = [
    age !== null ? `Tuổi: ${age}` : "",
    gioiTinh ? `Giới tính: ${gioiTinh}` : "",
    ngheNghiep ? `Nghề nghiệp: ${ngheNghiep}` : "",
  ].filter(Boolean);

  if (adminParts.length > 0) {
    lines.push(adminParts.join(" | "));
  }

  const ngayKham = scrubValue(data.ngay_kham, "ngay_kham");
  if (ngayKham) {
    lines.push(`Ngày khám: ${ngayKham}`);
  }

  for (let stepIndex = 1; stepIndex < schema.steps.length; stepIndex++) {
    const step = schema.steps[stepIndex];
    lines.push("", `[${stepIndex + 1}. ${step.label.toUpperCase()}]`);

    for (const field of step.fields) {
      if (field.id === "dental_chart" || field.type === "dental-chart") continue;
      if (!isFieldVisible(field, data)) continue;

      const value = data[field.id];
      let formatted = "";

      if (Array.isArray(value)) {
        formatted = formatArray(value, field.id);
      } else if (
        typeof value === "object"
        && value !== null
        && (field.type === "select-with-text" || field.type === "radio-with-other")
      ) {
        formatted = formatChoiceObject(value, field.id);
      } else {
        formatted = scrubValue(value, field.id);
      }

      if (formatted) {
        lines.push(`${field.label}: ${formatted}`);
      }
    }
  }

  return lines.join("\n");
}
