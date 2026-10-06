import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildClinicalSummary } from "@/lib/clinical-record/summarize";
import { coDinhSchema, thaoLapSchema } from "@/lib/clinical-record/schemas";
import type { ToothStatus } from "@/lib/clinical-record/types";

const PERMANENT_FDI = [
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
];

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
        PERMANENT_FDI.map((fdi) => [
          fdi,
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
        PERMANENT_FDI.map((fdi) => [
          fdi,
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

  it("excludes malformed, non-integer, and non-permanent FDI keys", () => {
    const result = buildClinicalSummary(coDinhSchema, {
      dental_chart: {
        11: { condition: "decay" },
        18: { condition: "decay" },
        19: { condition: "decay" },
        20: { condition: "decay" },
        21: { condition: "decay" },
        28: { condition: "decay" },
        29: { condition: "decay" },
        31: { condition: "decay" },
        38: { condition: "decay" },
        39: { condition: "decay" },
        41: { condition: "decay" },
        48: { condition: "decay" },
        49: { condition: "decay" },
        "16.5": { condition: "decay" },
        "11x": { condition: "decay" },
      },
    });
    const toothLine = result.split("\n").find((line) => line.startsWith("Răng:"));
    expect(toothLine).toBe("Răng: 11(sâu), 18(sâu), 21(sâu), 28(sâu), 31(sâu), 38(sâu), 41(sâu), 48(sâu)");
  });

  it("lists permanent FDI teeth in numeric order", () => {
    const result = buildClinicalSummary(coDinhSchema, {
      dental_chart: Object.fromEntries([
        [48, { condition: "missing" }],
        [31, { condition: "mobile" }],
        [21, { condition: "decay" }],
        [11, { condition: "restored" }],
      ]),
    });
    const toothLine = result.split("\n").find((line) => line.startsWith("Răng:"));
    expect(toothLine).toBe("Răng: 11(phục hình), 21(sâu), 31(lung lay), 48(mất)");
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

  it("includes Kennedy in upper-then-lower arch order for thao-lap schema", () => {
    const data: Record<string, unknown> = {
      nam_sinh: "1990",
      gioi_tinh: "Nam",
      kennedy_ham_tren_ban_dau: { value: "Loại II", text: "Biến thể 1" },
      kennedy_ham_duoi_ban_dau: { value: "Loại I", text: "" },
    };
    const result = buildClinicalSummary(thaoLapSchema, data);
    const kennedyLine = result.split("\n").find((line) => line.startsWith("Kennedy:"));
    expect(kennedyLine).toBe("Kennedy: HT: Loại II (Biến thể 1), HD: Loại I");
  });

  it("tooth section capped at 500 chars with 32 teeth", () => {
    const data: Record<string, unknown> = {
      dental_chart: Object.fromEntries(
        PERMANENT_FDI.map((fdi) => [
          fdi,
          { condition: "decay", note: "ghi chú dài ".repeat(5) } as ToothStatus,
        ])
      ),
    };
    const result = buildClinicalSummary(coDinhSchema, data);
    const toothLine = result.split("\n").find((l) => l.startsWith("Răng:"));
    expect((toothLine ?? "").length).toBeLessThanOrEqual(500);
  });

  it("retains a tooth that brings the rendered section to exactly 500 chars", () => {
    const result = buildClinicalSummary(coDinhSchema, {
      dental_chart: Object.fromEntries(
        PERMANENT_FDI.slice(0, 10).map((fdi, index) => [
          fdi,
          { condition: "decay", note: "N".repeat(index === 9 ? 16 : 40) } as ToothStatus,
        ])
      ),
    });
    const toothLine = result.split("\n").find((line) => line.startsWith("Răng:"));

    expect(toothLine?.length).toBe(500);
    expect(toothLine).toContain(`22(sâu — ${"N".repeat(16)})`);
  });

  it("counts the ellipsis within each 40-character tooth label and note cap", () => {
    const result = buildClinicalSummary(coDinhSchema, {
      dental_chart: {
        11: { condition: "L".repeat(41), note: "N".repeat(41) },
      },
    });
    const toothLine = result.split("\n").find((line) => line.startsWith("Răng:"));
    expect(toothLine).toBe(`Răng: 11(${"L".repeat(39)}… — ${"N".repeat(39)}…)`);
  });

  it("counts the ellipsis within each configured free-text value cap", () => {
    const result = buildClinicalSummary(coDinhSchema, {
      ly_do_kham: "A".repeat(201),
      chan_doan_lam_sang: "B".repeat(301),
      mo_nha_chu_chung: "C".repeat(121),
      tom_tat_benh_an: "D".repeat(301),
    });
    const lines = result.split("\n");
    const cappedValues = [
      ["Lý do khám: ", "A", 200],
      ["Chẩn đoán: ", "B", 300],
      ["Nha chu: ", "C", 120],
      ["Tóm tắt: ", "D", 300],
    ] as const;

    for (const [prefix, character, max] of cappedValues) {
      const line = lines.find((candidate) => candidate.startsWith(prefix));
      const value = line?.slice(prefix.length);
      expect(value).toBe(`${character.repeat(max - 1)}…`);
      expect(value?.length).toBe(max);
    }
  });

  it("removes the lowest-priority section first when the total exceeds 1500", () => {
    const result = buildClinicalSummary(thaoLapSchema, {
      nam_sinh: "1990",
      gioi_tinh: "Nam",
      benh_nen: ["X".repeat(60)],
      dental_chart: Object.fromEntries(
        PERMANENT_FDI.map((fdi) => [fdi, { condition: "decay", note: "N".repeat(80) }])
      ),
      kennedy_ham_tren_ban_dau: { value: "Loại I", text: "Biến thể 1" },
      kennedy_ham_duoi_ban_dau: { value: "Loại III", text: "Biến thể 2" },
      ly_do_kham: "A".repeat(201),
      chan_doan_lam_sang: "B".repeat(301),
      mo_nha_chu_chung: "C".repeat(121),
      tom_tat_benh_an: "LOWEST_PRIORITY".repeat(30),
    });

    expect(result.length).toBeLessThanOrEqual(1500);
    expect(result).toContain("Nha chu:");
    expect(result).not.toContain("Tóm tắt:");
    expect(result).not.toContain("LOWEST_PRIORITY");
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

  it("scrubs Vietnamese landlines from free text and tooth notes", () => {
    const result = buildClinicalSummary(coDinhSchema, {
      ly_do_kham: "Liên hệ 024 1234 5678",
      dental_chart: { 16: { condition: "decay", note: "Gọi 028-1234-5678" } },
    });

    expect(result).not.toContain("024 1234 5678");
    expect(result).not.toContain("028-1234-5678");
    expect(result.match(/\[SĐT\]/g)).toHaveLength(2);
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
