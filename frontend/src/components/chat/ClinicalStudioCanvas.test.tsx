import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClinicalStudioCanvas } from "./ClinicalStudioCanvas";
import type { ClinicalRecordData } from "@/lib/clinical-record/types";

afterEach(cleanup);

describe("ClinicalStudioCanvas", () => {
  it("renders empty case state with button to create new record when activeRecord is null", () => {
    const onNewRecord = vi.fn();
    render(<ClinicalStudioCanvas activeRecord={null} onNewRecord={onNewRecord} />);

    expect(screen.getByText("Chưa có bệnh án đang mở")).toBeDefined();
    const btn = screen.getByRole("button", { name: /mở bệnh án mới/i });
    expect(btn).toBeDefined();

    fireEvent.click(btn);
    expect(onNewRecord).toHaveBeenCalledTimes(1);
  });

  it("renders active case details and dental chart badges when record is present", () => {
    const sampleRecord: ClinicalRecordData = {
      id: "rec-1",
      schemaId: "co-dinh",
      data: {
        ho_ten: "Nguyễn Văn Bệnh Nhân",
        nam_sinh: "1992",
        gioi_tinh: "Nam",
        ly_do_kham: "Đau răng hàm dưới bên trái",
        dental_chart: {
          38: { condition: "decay" },
        },
      },
      serializedText: "",
      createdAt: "2026-10-06T00:00:00.000Z",
      updatedAt: "2026-10-06T00:00:00.000Z",
    };

    render(<ClinicalStudioCanvas activeRecord={sampleRecord} />);

    expect(screen.getByText("Nguyễn Văn Bệnh Nhân")).toBeDefined();
    expect(screen.getByText(/Đau răng hàm dưới bên trái/)).toBeDefined();
    expect(screen.getByText("#38")).toBeDefined();
  });

  it("switches to knowledge cards tab and triggers onAskQuestion callback", () => {
    const onAskQuestion = vi.fn();
    render(<ClinicalStudioCanvas activeRecord={null} onAskQuestion={onAskQuestion} />);

    const cardsTab = screen.getByRole("button", { name: /thẻ tri thức/i });
    fireEvent.click(cardsTab);

    expect(screen.getByText("Phân loại Gãy Răng theo Ellis")).toBeDefined();
    expect(screen.getByText("Class I")).toBeDefined();
    expect(screen.getByText("Gãy men răng")).toBeDefined();

    const askButtons = screen.getAllByRole("button", { name: /hỏi ai về/i });
    expect(askButtons.length).toBeGreaterThan(0);
    fireEvent.click(askButtons[0]);
    expect(onAskQuestion).toHaveBeenCalledTimes(1);
  });

  it("switches to guidelines tab and shows ITI Consensus", () => {
    render(<ClinicalStudioCanvas activeRecord={null} />);

    const guidelinesTab = screen.getByRole("button", { name: /y văn iti/i });
    fireEvent.click(guidelinesTab);

    expect(screen.getByText(/ITI Consensus 2023/)).toBeDefined();
  });

  it("renders clinical mastery stepper and allows switching stages", () => {
    render(<ClinicalStudioCanvas activeRecord={null} />);

    expect(screen.getByText("Tiến trình Lâm sàng")).toBeDefined();
    expect(screen.getByText(/Bước 1\/4/)).toBeDefined();

    const stage2Btn = screen.getByTitle("Chẩn đoán PB");
    fireEvent.click(stage2Btn);
    expect(screen.getByText(/Bước 2\/4/)).toBeDefined();
  });

  it("switches to odontogram tab and allows selecting a tooth to view details", () => {
    const onAskQuestion = vi.fn();
    render(<ClinicalStudioCanvas activeRecord={null} onAskQuestion={onAskQuestion} />);

    const chartTab = screen.getByRole("button", { name: /sơ đồ răng/i });
    fireEvent.click(chartTab);

    expect(screen.getByText(/Sơ đồ 32 Răng FDI/i)).toBeDefined();
    expect(screen.getByText(/Hàm trên \(Maxillary\)/i)).toBeDefined();

    // Select tooth 16
    const tooth16Btn = screen.getByRole("button", { name: "16" });
    fireEvent.click(tooth16Btn);

    expect(screen.getByText(/FDI #16/)).toBeDefined();
    expect(screen.getByText(/Răng cối lớn 1/)).toBeDefined();

    // Click quick Socratic prompt for tooth 16
    const promptButtons = screen.getAllByRole("button", { name: /răng #16/i });
    expect(promptButtons.length).toBeGreaterThan(0);
    fireEvent.click(promptButtons[0]);
    expect(onAskQuestion).toHaveBeenCalledTimes(1);
  });
});
