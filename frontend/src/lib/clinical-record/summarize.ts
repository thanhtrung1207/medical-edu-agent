import type { ClinicalRecordSchema } from "./schemas";
import type { ToothStatus } from "./types";
import { scrubPII } from "./scrub";

const CONDITION_LABELS: Record<string, string> = {
  decay: "sâu",
  missing: "mất",
  restored: "phục hình",
  mobile: "lung lay",
  "treatment-needed": "cần điều trị",
};

const MAX_TOTAL = 1500;
const MAX_TOOTH_SECTION = 500;
const MAX_NOTE_PER_TOOTH = 40;

function truncate(text: unknown, max: number, fieldId?: string): string {
  if (typeof text !== "string" || !text) return "";

  const scrubbed = scrubPII(text, fieldId);
  return scrubbed.length > max ? `${scrubbed.slice(0, max)}…` : scrubbed;
}

function isToothStatus(value: unknown): value is ToothStatus {
  return typeof value === "object" && value !== null && typeof (value as ToothStatus).condition === "string";
}

function buildToothSection(chart: unknown): string {
  if (typeof chart !== "object" || chart === null || Array.isArray(chart)) return "";

  const entries = Object.entries(chart)
    .filter((entry): entry is [string, ToothStatus] => isToothStatus(entry[1]) && entry[1].condition !== "normal")
    .map(([fdi, status]) => [Number(fdi), status] as const)
    .filter(([fdi]) => Number.isFinite(fdi))
    .sort(([a], [b]) => a - b);

  if (entries.length === 0) return "";

  const parts: string[] = [];
  let total = "Răng: ".length;

  for (const [fdi, status] of entries) {
    const label = truncate(CONDITION_LABELS[status.condition] ?? status.condition, MAX_NOTE_PER_TOOTH);
    if (!label) continue;

    const note = truncate(status.note, MAX_NOTE_PER_TOOTH);
    const part = note ? `${fdi}(${label} — ${note})` : `${fdi}(${label})`;

    if (total + part.length + 2 > MAX_TOOTH_SECTION) break;
    parts.push(part);
    total += part.length + 2;
  }

  return parts.length > 0 ? `Răng: ${parts.join(", ")}` : "";
}

function getKennedy(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["kennedy_ham_tren_ban_dau", "kennedy_ham_duoi_ban_dau"]) {
    const value = data[key];
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;

    const { value: classification, text } = value as { value?: unknown; text?: unknown };
    const label = truncate(classification, 80);
    if (!label) continue;

    const variant = truncate(text, 80);
    const arch = key.includes("tren") ? "HT" : "HD";
    parts.push(`${arch}: ${label}${variant ? ` (${variant})` : ""}`);
  }
  return parts.length > 0 ? `Kennedy: ${parts.join(", ")}` : "";
}

export function buildClinicalSummary(
  schema: ClinicalRecordSchema,
  data: Record<string, unknown>,
): string {
  const toothSection = buildToothSection(data.dental_chart);

  const namSinhText = typeof data.nam_sinh === "string" ? data.nam_sinh : "";
  const namSinh = Number(namSinhText);
  const currentYear = new Date().getFullYear();
  const age = /^\d{4}$/.test(namSinhText) && namSinh >= 1900 && namSinh <= currentYear
    ? currentYear - namSinh
    : null;
  const gioiTinh = truncate(data.gioi_tinh, 80);
  const demographics = [age !== null ? `${age} tuổi` : null, gioiTinh].filter(Boolean).join(", ");

  const benhNen = Array.isArray(data.benh_nen)
    ? data.benh_nen.map((value) => truncate(value, 80)).filter(Boolean).join(", ")
    : "";

  const sections: string[] = [];

  if (toothSection) sections.push(toothSection);
  if (demographics) sections.push(demographics);
  if (benhNen) sections.push(`Bệnh nền: ${benhNen}`);

  if (schema.id === "thao-lap") {
    const kennedy = getKennedy(data);
    if (kennedy) sections.push(kennedy);
  }

  const lyDoKham = truncate(data.ly_do_kham, 200);
  if (lyDoKham) sections.push(`Lý do khám: ${lyDoKham}`);

  const chanDoan = truncate(data.chan_doan_lam_sang, 300);
  if (chanDoan) sections.push(`Chẩn đoán: ${chanDoan}`);

  const nhaChu = truncate(data.mo_nha_chu_chung, 120);
  if (nhaChu) sections.push(`Nha chu: ${nhaChu}`);

  const tomTat = truncate(data.tom_tat_benh_an, 300);
  if (tomTat) sections.push(`Tóm tắt: ${tomTat}`);

  let result = sections.join("\n");

  while (result.length > MAX_TOTAL && sections.length > 1) {
    sections.pop();
    result = sections.join("\n");
  }

  return result.slice(0, MAX_TOTAL);
}
