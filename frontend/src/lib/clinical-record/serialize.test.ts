import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeClinicalRecord } from "@/lib/clinical-record/serialize";
import { coDinhSchema, thaoLapSchema } from "@/lib/clinical-record/schemas";
import type { ToothStatus } from "@/lib/clinical-record/types";

describe("serializeClinicalRecord", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("strips PII fields from output", () => {
    const data = {
      ho_ten: "Nguyễn Văn A",
      sdt: "0901234567",
      dia_chi: "123 Đường ABC",
      nam_sinh: "1990",
      gioi_tinh: "Nam",
      nghe_nghiep: "Giáo viên",
    };

    const result = serializeClinicalRecord(coDinhSchema, data);

    expect(result).not.toContain("Nguyễn Văn A");
    expect(result).not.toContain("0901234567");
    expect(result).not.toContain("123 Đường ABC");
    expect(result).not.toContain("Họ và tên");
    expect(result).not.toContain("Số điện thoại");
    expect(result).not.toContain("Địa chỉ");
    expect(result).toContain("Tuổi: 36");
    expect(result).toContain("Giới tính: Nam");
    expect(result).toContain("Nghề nghiệp: Giáo viên");
  });

  it("derives age from a valid birth year and omits invalid or future years", () => {
    expect(serializeClinicalRecord(coDinhSchema, { nam_sinh: "1990" })).toContain("Tuổi: 36");

    for (const namSinh of ["", "1800", "199", "19a0", "2027"]) {
      expect(serializeClinicalRecord(coDinhSchema, { nam_sinh: namSinh })).not.toContain("Tuổi:");
    }
  });

  it("derives age from a birth year with outer whitespace", () => {
    expect(serializeClinicalRecord(coDinhSchema, { nam_sinh: " 1990 " })).toContain("Tuổi: 36");
  });

  it("trims outer whitespace from emitted field values", () => {
    const result = serializeClinicalRecord(coDinhSchema, { nghe_nghiep: "  Giáo viên  " });
    const adminLine = result.split("\n").find((line) => line.includes("Nghề nghiệp:"));

    expect(adminLine).toBe("Nghề nghiệp: Giáo viên");
  });

  it("includes dental chart conditions and notes", () => {
    const data = {
      dental_chart: {
        16: { condition: "decay", note: "sâu mặt xa, lộ tủy" },
        46: { condition: "missing" },
      } as Record<number, ToothStatus>,
    };

    const result = serializeClinicalRecord(coDinhSchema, data);

    expect(result).toContain("Răng liên quan (FDI):");
    expect(result).toContain("16(sâu — sâu mặt xa, lộ tủy)");
    expect(result).toContain("46(mất)");
  });

  it("produces the fixed-prosthodontics title and numbered section headers", () => {
    const result = serializeClinicalRecord(coDinhSchema, { nam_sinh: "1990" });

    expect(result).toContain("=== BỆNH ÁN PHỤC HÌNH CỐ ĐỊNH ===");
    expect(result).toContain("[1. HÀNH CHÍNH]");
    expect(result).toContain("[2. BỆNH SỬ & KHÁM LÂM SÀNG]");
    expect(result).toContain("[4. KHÁM VÙNG PHỤC HÌNH]");
    expect(result).toContain("[5. TÓM TẮT & CHẨN ĐOÁN]");
  });

  it("produces the removable-prosthodontics title and schema-specific sections", () => {
    const result = serializeClinicalRecord(thaoLapSchema, {});

    expect(result).toContain("=== BỆNH ÁN PHỤC HÌNH THÁO LẮP ===");
    expect(result).toContain("[1. HÀNH CHÍNH]");
    expect(result).toContain("[2. BỆNH SỬ, KHÁM LS & HÀM GIẢ CŨ]");
    expect(result).toContain("[3. KHÁM TRONG MIỆNG & KENNEDY]");
    expect(result).toContain("[4. KHÁM VÙNG PH THÁO LẮP]");
  });

  it("scrubs phone numbers in free text fields", () => {
    const result = serializeClinicalRecord(coDinhSchema, {
      ly_do_kham: "Đau răng, gọi 0901234567",
    });

    expect(result).toContain("Lý do đến khám: Đau răng, gọi [SĐT]");
    expect(result).not.toContain("0901234567");
  });

  it("propagates provincial landline scrubbing to serialized free text", () => {
    const result = serializeClinicalRecord(coDinhSchema, {
      ly_do_kham: "Gọi 0203 1234 567 hoặc +84 203 7654 321",
    });

    expect(result).toContain("Lý do đến khám: Gọi [SĐT] hoặc [SĐT]");
    expect(result).not.toMatch(/0203 1234 567|\+84 203 7654 321/);
  });

  it("excludes hidden denture fields and includes them when their dependency is visible", () => {
    const hidden = serializeClinicalRecord(thaoLapSchema, {
      ham_gia_cu: "Không",
      cach_su_dung: "Mang ngày",
    });
    const visible = serializeClinicalRecord(thaoLapSchema, {
      ham_gia_cu: "Có HT",
      cach_su_dung: "Mang ngày",
    });

    expect(hidden).toContain("Hàm giả cũ: Không");
    expect(hidden).not.toContain("Cách sử dụng:");
    expect(visible).toContain("Hàm giả cũ: Có HT");
    expect(visible).toContain("Cách sử dụng: Mang ngày");
  });

  it("sorts permanent FDI teeth numerically and excludes invalid keys or malformed statuses", () => {
    const result = serializeClinicalRecord(coDinhSchema, {
      dental_chart: {
        48: { condition: "missing" },
        31: { condition: "mobile", note: 42 },
        21: { condition: "decay" },
        19: { condition: "decay" },
        18: { condition: "normal" },
        11: { condition: "restored" },
        41: { condition: "unknown" },
        16: null,
        "16.5": { condition: "decay" },
        bad: { condition: "decay" },
      },
    });
    const toothLine = result.split("\n").find((line) => line.startsWith("Răng liên quan"));

    expect(toothLine).toBe("Răng liên quan (FDI): 11(phục hình), 21(sâu), 48(mất)");
  });

  it("scrubs phone numbers in tooth notes, arrays, and object values", () => {
    const result = serializeClinicalRecord(thaoLapSchema, {
      dental_chart: {
        16: { condition: "decay", note: "Gọi 090 123 4567" },
      },
      benh_nen: ["Tiểu đường", "", "Liên hệ 0912345678"],
      kennedy_ham_tren_ban_dau: {
        value: "Loại I 0934567890",
        text: "Biến thể, gọi 028-1234-5678",
      },
    });

    expect(result).toContain("16(sâu — Gọi [SĐT])");
    expect(result).toContain("Bệnh nền: Tiểu đường, Liên hệ [SĐT]");
    expect(result).toContain("Kennedy hàm trên (ban đầu): Loại I [SĐT] — Biến thể, gọi [SĐT]");
    expect(result).not.toMatch(/090 123 4567|0912345678|0934567890|028-1234-5678/);
  });

  it("scrubs phone numbers in every emitted administration value", () => {
    const result = serializeClinicalRecord(coDinhSchema, {
      gioi_tinh: "Nam 0901234567",
      nghe_nghiep: "Giáo viên 0912345678",
      ngay_kham: "06/10/2026, gọi 028 1234 5678",
    });

    expect(result).toContain("Giới tính: Nam [SĐT]");
    expect(result).toContain("Nghề nghiệp: Giáo viên [SĐT]");
    expect(result).toContain("Ngày khám: 06/10/2026, gọi [SĐT]");
    expect(result).not.toMatch(/0901234567|0912345678|028 1234 5678/);
  });

  it("handles malformed dental charts without throwing", () => {
    for (const dentalChart of [null, "invalid", 42, [], { 16: null, 26: "missing" }]) {
      expect(() => serializeClinicalRecord(coDinhSchema, { dental_chart: dentalChart })).not.toThrow();
      expect(serializeClinicalRecord(coDinhSchema, { dental_chart: dentalChart })).not.toContain(
        "Răng liên quan (FDI):",
      );
    }
  });
});
