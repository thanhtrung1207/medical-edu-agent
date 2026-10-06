import { describe, it, expect } from "vitest";
import { scrubPII } from "@/lib/clinical-record/scrub";

describe("scrubPII", () => {
  describe("PII field gate", () => {
    it("returns empty string for ho_ten field", () => {
      expect(scrubPII("Nguyễn Văn A", "ho_ten")).toBe("");
    });

    it("returns empty string for sdt field", () => {
      expect(scrubPII("0901234567", "sdt")).toBe("");
    });

    it("returns empty string for dia_chi field", () => {
      expect(scrubPII("123 Đường ABC", "dia_chi")).toBe("");
    });

    it("passes through non-PII fields", () => {
      expect(scrubPII("Đau răng", "ly_do_kham")).toBe("Đau răng");
    });

    it("passes through when no fieldId provided", () => {
      expect(scrubPII("some text")).toBe("some text");
    });
  });

  describe("phone number scrubbing", () => {
    it("redacts 10-digit phone 0901234567", () => {
      expect(scrubPII("Gọi 0901234567 để hẹn")).toBe("Gọi [SĐT] để hẹn");
    });

    it("redacts phone with spaces 090 123 4567", () => {
      expect(scrubPII("SĐT: 090 123 4567")).toBe("SĐT: [SĐT]");
    });

    it("redacts phone with dots 090.123.4567", () => {
      expect(scrubPII("Liên hệ 090.123.4567")).toBe("Liên hệ [SĐT]");
    });

    it("redacts +84 prefix", () => {
      expect(scrubPII("Call +84901234567")).toBe("Call [SĐT]");
    });

    it("redacts +84 with spaces", () => {
      expect(scrubPII("Tel: +84 90 123 4567")).toBe("Tel: [SĐT]");
    });

    it.each([
      ["024 1234 5678", "Gọi 024 1234 5678 để hẹn", "Gọi [SĐT] để hẹn"],
      ["028-1234-5678", "SĐT: 028-1234-5678", "SĐT: [SĐT]"],
      ["+84 24 1234 5678", "Tel: +84 24 1234 5678", "Tel: [SĐT]"],
    ])("redacts Vietnamese landline %s", (_phone, input, expected) => {
      expect(scrubPII(input)).toBe(expected);
    });

    it("does not match short numbers like 12345", () => {
      expect(scrubPII("Răng số 12345")).toBe("Răng số 12345");
    });

    it("preserves surrounding text", () => {
      expect(scrubPII("Răng 0901234567 đau")).toBe("Răng [SĐT] đau");
    });

    it("does not match inside longer digit sequence", () => {
      expect(scrubPII("ID: 123045678901234")).toBe("ID: 123045678901234");
    });

    it("does not match a landline inside a longer digit sequence", () => {
      expect(scrubPII("ID: 1024123456789")).toBe("ID: 1024123456789");
    });
  });
});
