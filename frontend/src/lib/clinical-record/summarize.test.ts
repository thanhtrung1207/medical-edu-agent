import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildClinicalSummary } from "@/lib/clinical-record/summarize";
import { coDinhSchema, thaoLapSchema } from "@/lib/clinical-record/schemas";
import type { ToothStatus } from "@/lib/clinical-record/types";

describe("buildClinicalSummary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("output is ≤1500 chars for co-dinh", () => {
    const data: Record<string, unknown> = {
      nam_sinh: "1990",
      gioi_tinh: "Nam",
      benh_nen: ["Tiểu đường", "THA"],
      ly_do_kham: "A".repeat(500),
      chan_doan_lam_sang: "B".repeat(500),
      mo_nha_chu_chung: "C".repeat(300),
      tom_tat_benh_an: "D".repeat(500),
      dental_chart: Object.fromEntries(
        Array.from({ length: 32 }, (_, i) => [
          i + 11,
          { condition: "decay", note: "N".repeat(80) } as ToothStatus,
        ])
      ),
    };
    const result = buildClinicalSummary(coDinhSchema, data);
    expect(result.length).toBeLessThanOrEqual(1500);
  });

  it("output is ≤1500 chars for thao-lap", () => {
    const data: Record<string, unknown> = {
      nam_sinh: "1990",
      gioi_tinh: "Nữ",
      benh_nen: ["Tim mạch"],
      ly_do_kham: "A".repeat(500),
      chan_doan_lam_sang: "B".repeat(500),
      mo_nha_chu_chung: "C".repeat(300),
      tom_tat_benh_an: "D".repeat(500),
      kennedy_ham_tren_ban_dau: { value: "Loại I", text: "Biến thể 1" },
      kennedy_ham_duoi_ban_dau: { value: "Loại III", text: "Biến thể 2" },
      dental_chart: Object.fromEntries(
        Array.from({ length: 32 }, (_, i) => [
          i + 11,
          { condition: "missing", note: "N".repeat(80) } as ToothStatus,
        ])
      ),
    };
    const result = buildClinicalSummary(thaoLapSchema, data);
    expect(result.length).toBeLessThanOrEqual(1500);
  });

  it("includes per-tooth conditions", () => {
    const data: Record<string, unknown> = {
      nam_sinh: "1990",
      gioi_tinh: "Nam",
      dental_chart: {
        16: { condition: "decay", note: "sâu mặt xa" },
        46: { condition: "missing" },
      } as Record<number, ToothStatus>,
    };
    const result = buildClinicalSummary(coDinhSchema, data);
    expect(result).toContain("16(sâu");
    expect(result).toContain("46(mất)");
  });

  it("never includes PII fields", () => {
    const data: Record<string, unknown> = {
      ho_ten: "Nguyễn Văn A",
      sdt: "0901234567",
      dia_chi: "123 Street",
      nam_sinh: "1990",
      gioi_tinh: "Nam",
    };
    const result = buildClinicalSummary(coDinhSchema, data);
    expect(result).not.toContain("Nguyễn Văn A");
    expect(result).not.toContain("0901234567");
    expect(result).not.toContain("123 Street");
  });

  it("includes Kennedy for thao-lap schema", () => {
    const data: Record<string, unknown> = {
      nam_sinh: "1990",
      gioi_tinh: "Nam",
      kennedy_ham_tren_ban_dau: { value: "Loại II", text: "Biến thể 1" },
      kennedy_ham_duoi_ban_dau: { value: "Loại I", text: "" },
    };
    const result = buildClinicalSummary(thaoLapSchema, data);
    expect(result).toContain("Kennedy");
    expect(result).toContain("Loại II");
  });

  it("tooth section capped at 500 chars with 32 teeth", () => {
    const data: Record<string, unknown> = {
      dental_chart: Object.fromEntries(
        Array.from({ length: 32 }, (_, i) => [
          i + 11,
          { condition: "decay", note: "ghi chú dài ".repeat(5) } as ToothStatus,
        ])
      ),
    };
    const result = buildClinicalSummary(coDinhSchema, data);
    const toothLine = result.split("\n").find((l) => l.startsWith("Răng:"));
    expect((toothLine ?? "").length).toBeLessThanOrEqual(510);
  });

  it("derives age from nam_sinh", () => {
    const data: Record<string, unknown> = { nam_sinh: "1990", gioi_tinh: "Nam" };
    const result = buildClinicalSummary(coDinhSchema, data);
    expect(result).toContain("36");
    expect(result).toContain("Nam");
  });

  it("omits age when nam_sinh is empty or out of range", () => {
    expect(buildClinicalSummary(coDinhSchema, { nam_sinh: "", gioi_tinh: "Nam" })).not.toContain("2026 tuổi");
    expect(buildClinicalSummary(coDinhSchema, { nam_sinh: "1800", gioi_tinh: "Nam" })).not.toContain("226 tuổi");
  });

  it("omits malformed birth years", () => {
    expect(buildClinicalSummary(coDinhSchema, { nam_sinh: "199", gioi_tinh: "Nam" })).not.toContain("tuổi");
    expect(buildClinicalSummary(coDinhSchema, { nam_sinh: "19a0", gioi_tinh: "Nam" })).not.toContain("tuổi");
  });

  it("scrubs phone numbers from free text, including tooth notes", () => {
    const result = buildClinicalSummary(coDinhSchema, {
      ly_do_kham: "Liên hệ 0901234567",
      dental_chart: { 16: { condition: "decay", note: "Gọi 090 123 4567" } },
    });
    expect(result).not.toContain("0901234567");
    expect(result).not.toContain("090 123 4567");
    expect(result).toContain("[SĐT]");
  });

  it("ignores malformed dental chart entries without throwing", () => {
    expect(() => buildClinicalSummary(coDinhSchema, {
      dental_chart: {
        16: null,
        26: "missing",
        36: { condition: 42, note: {} },
        bad: { condition: "decay", note: "hợp lệ" },
      },
    })).not.toThrow();
  });
});
