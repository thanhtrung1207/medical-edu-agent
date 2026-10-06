import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClinicalRecordData } from "@/lib/clinical-record/types";
import { ClinicalRecordBadge } from "./ClinicalRecordBadge";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseRecord: ClinicalRecordData = {
  id: "rec-1",
  schemaId: "co-dinh",
  data: {
    dental_chart: {
      "11": { condition: "normal" },
      "21": { condition: "decay" },
    },
  },
  serializedText: "Bệnh nhân: Nguyễn Văn A",
  createdAt: "2025-06-01T08:00:00.000Z",
  updatedAt: "2025-06-01T08:00:00.000Z",
};

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClinicalRecordBadge", () => {
  // -- Schema title mapping --------------------------------------------------

  describe("schema title mapping", () => {
    it("maps co-dinh → Cố Định", () => {
      render(<ClinicalRecordBadge record={baseRecord} />);
      expect(screen.getByText(/Cố Định/)).toBeInTheDocument();
    });

    it("maps thao-lap → Tháo Lắp", () => {
      render(
        <ClinicalRecordBadge record={{ ...baseRecord, schemaId: "thao-lap" }} />,
      );
      expect(screen.getByText(/Tháo Lắp/)).toBeInTheDocument();
    });
  });

  // -- Dental chart tooth list -----------------------------------------------

  describe("dental chart teeth list", () => {
    it("displays FDI tooth numbers from dental_chart", () => {
      render(<ClinicalRecordBadge record={baseRecord} />);
      const article = screen.getByRole("article");
      expect(article.textContent).toContain("11");
      expect(article.textContent).toContain("21");
    });

    it("renders without error when dental_chart field is absent", () => {
      render(<ClinicalRecordBadge record={{ ...baseRecord, data: {} }} />);
      expect(screen.getByText(/Cố Định/)).toBeInTheDocument();
    });

    it("renders without error when dental_chart is an empty object", () => {
      render(
        <ClinicalRecordBadge
          record={{ ...baseRecord, data: { dental_chart: {} } }}
        />,
      );
      expect(screen.getByText(/Cố Định/)).toBeInTheDocument();
    });
  });

  // -- Expand / collapse (Xem button) ----------------------------------------

  describe("expand / collapse (Xem button)", () => {
    it("initially renders a Xem button", () => {
      render(<ClinicalRecordBadge record={baseRecord} />);
      expect(screen.getByRole("button", { name: "Xem" })).toBeInTheDocument();
    });

    it("clicking Xem changes the button label to Thu gọn", () => {
      render(<ClinicalRecordBadge record={baseRecord} />);
      fireEvent.click(screen.getByRole("button", { name: "Xem" }));

      expect(
        screen.queryByRole("button", { name: "Xem" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Thu gọn" }),
      ).toBeInTheDocument();
    });

    it("clicking Thu gọn collapses back to Xem", () => {
      render(<ClinicalRecordBadge record={baseRecord} />);
      fireEvent.click(screen.getByRole("button", { name: "Xem" }));
      fireEvent.click(screen.getByRole("button", { name: "Thu gọn" }));

      expect(screen.getByRole("button", { name: "Xem" })).toBeInTheDocument();
    });
  });

  // -- Sửa button ------------------------------------------------------------

  describe("Sửa button", () => {
    it("shows Sửa when onEdit is provided and record is open", () => {
      render(<ClinicalRecordBadge record={baseRecord} onEdit={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Sửa" })).toBeInTheDocument();
    });

    it("calls onEdit when Sửa is clicked", () => {
      const onEdit = vi.fn();
      render(<ClinicalRecordBadge record={baseRecord} onEdit={onEdit} />);
      fireEvent.click(screen.getByRole("button", { name: "Sửa" }));
      expect(onEdit).toHaveBeenCalledOnce();
    });

    it("hides Sửa when closedAt is present", () => {
      render(
        <ClinicalRecordBadge
          record={{ ...baseRecord, closedAt: "2025-06-02T08:00:00.000Z" }}
          onEdit={vi.fn()}
        />,
      );
      expect(
        screen.queryByRole("button", { name: "Sửa" }),
      ).not.toBeInTheDocument();
    });

    it("hides Sửa when onEdit is not provided", () => {
      render(<ClinicalRecordBadge record={baseRecord} />);
      expect(
        screen.queryByRole("button", { name: "Sửa" }),
      ).not.toBeInTheDocument();
    });
  });

  // -- Closed state ----------------------------------------------------------

  describe("closed state", () => {
    it("shows Đã kết thúc when closedAt and summary are both present", () => {
      render(
        <ClinicalRecordBadge
          record={{
            ...baseRecord,
            closedAt: "2025-06-02T08:00:00.000Z",
            summary: "Tóm tắt ca lâm sàng đã hoàn thành",
          }}
        />,
      );
      expect(screen.getByText(/Đã kết thúc/)).toBeInTheDocument();
    });

    it("shows Đã lưu — chưa tóm tắt when closedAt is present and summary is null", () => {
      render(
        <ClinicalRecordBadge
          record={{
            ...baseRecord,
            closedAt: "2025-06-02T08:00:00.000Z",
            summary: null,
          }}
        />,
      );
      const article = screen.getByRole("article");
      expect(article.textContent).toContain("Đã lưu");
      expect(article.textContent).toContain("chưa tóm tắt");
    });

    it("shows Đã lưu — chưa tóm tắt when closedAt is present and summary is undefined", () => {
      render(
        <ClinicalRecordBadge
          record={{
            ...baseRecord,
            closedAt: "2025-06-02T08:00:00.000Z",
            summary: undefined,
          }}
        />,
      );
      const article = screen.getByRole("article");
      expect(article.textContent).toContain("Đã lưu");
      expect(article.textContent).toContain("chưa tóm tắt");
    });
  });
});
