import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SlashCommand } from "@/lib/slash-commands/types";
import { SlashCommandMenu } from "./SlashCommandMenu";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// vi.mock factories are hoisted to the top of the file, so `mockSearch` must
// be created with vi.hoisted() to be accessible inside the factory.
const { mockSearch } = vi.hoisted(() => ({ mockSearch: vi.fn() }));

vi.mock("@/lib/slash-commands/registry", () => ({
  commandRegistry: { search: mockSearch },
}));

// Prevent side-effect registrations from commands.ts
vi.mock("@/lib/slash-commands/commands", () => ({}));

vi.mock("lucide-react", () => ({
  ClipboardPlus: () => React.createElement("span", { "data-testid": "icon-ClipboardPlus" }),
  Stethoscope: () => React.createElement("span", { "data-testid": "icon-Stethoscope" }),
  ListChecks: () => React.createElement("span", { "data-testid": "icon-ListChecks" }),
  GitCompare: () => React.createElement("span", { "data-testid": "icon-GitCompare" }),
  CheckCircle: () => React.createElement("span", { "data-testid": "icon-CheckCircle" }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CMD_CASE: SlashCommand = {
  id: "benh-an-co-dinh",
  label: "Bệnh án Cố Định",
  description: "Tạo bệnh án cố định",
  icon: "ClipboardPlus",
  category: "case",
  handler: "form-wizard",
};

const CMD_ANALYSIS: SlashCommand = {
  id: "chan-doan",
  label: "Phân tích chẩn đoán",
  description: "Phân tích dựa trên bệnh án",
  icon: "Stethoscope",
  category: "analysis",
  handler: "send-message",
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

afterEach(cleanup);
beforeEach(() => mockSearch.mockReset());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SlashCommandMenu", () => {
  // -- Rendering -------------------------------------------------------------

  describe("rendering", () => {
    it("groups commands by category with correct headings", () => {
      mockSearch.mockReturnValue([CMD_CASE, CMD_ANALYSIS]);
      render(<SlashCommandMenu query="" onSelect={vi.fn()} onClose={vi.fn()} />);

      expect(screen.getByText("Ca lâm sàng")).toBeInTheDocument();
      expect(screen.getByText("Phân tích")).toBeInTheDocument();
      expect(screen.getByText("Bệnh án Cố Định")).toBeInTheDocument();
      expect(screen.getByText("Phân tích chẩn đoán")).toBeInTheDocument();
    });

    it("shows item descriptions", () => {
      mockSearch.mockReturnValue([CMD_CASE]);
      render(<SlashCommandMenu query="" onSelect={vi.fn()} onClose={vi.fn()} />);

      expect(screen.getByText("Tạo bệnh án cố định")).toBeInTheDocument();
    });

    it("calls commandRegistry.search with the query prop", () => {
      mockSearch.mockReturnValue([]);
      render(<SlashCommandMenu query="benh" onSelect={vi.fn()} onClose={vi.fn()} />);
      expect(mockSearch).toHaveBeenCalledWith("benh");
    });

    it("calls commandRegistry.search with empty string for empty query", () => {
      mockSearch.mockReturnValue([CMD_CASE]);
      render(<SlashCommandMenu query="" onSelect={vi.fn()} onClose={vi.fn()} />);
      expect(mockSearch).toHaveBeenCalledWith("");
    });

    it("omits a category heading when that category yields no results", () => {
      mockSearch.mockReturnValue([CMD_CASE]);
      render(<SlashCommandMenu query="" onSelect={vi.fn()} onClose={vi.fn()} />);

      expect(screen.getByText("Ca lâm sàng")).toBeInTheDocument();
      expect(screen.queryByText("Phân tích")).not.toBeInTheDocument();
    });

    it("renders the Lucide icon for each command", () => {
      mockSearch.mockReturnValue([CMD_CASE]);
      render(<SlashCommandMenu query="" onSelect={vi.fn()} onClose={vi.fn()} />);

      expect(screen.getByTestId("icon-ClipboardPlus")).toBeInTheDocument();
    });

    it("shows disabled commands in the list (not hidden)", () => {
      mockSearch.mockReturnValue([CMD_CASE, CMD_ANALYSIS]);
      render(
        <SlashCommandMenu
          query=""
          onSelect={vi.fn()}
          onClose={vi.fn()}
          disabledCommandIds={new Set(["chan-doan"])}
        />,
      );

      expect(screen.getByText("Bệnh án Cố Định")).toBeInTheDocument();
      expect(screen.getByText("Phân tích chẩn đoán")).toBeInTheDocument();
    });
  });

  // -- Click interaction -----------------------------------------------------

  describe("click interaction", () => {
    it("calls onSelect when an enabled item button is clicked", () => {
      mockSearch.mockReturnValue([CMD_CASE]);
      const onSelect = vi.fn();
      render(<SlashCommandMenu query="" onSelect={onSelect} onClose={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /Bệnh án Cố Định/ }));

      expect(onSelect).toHaveBeenCalledWith(CMD_CASE);
    });

    it("does not call onSelect when a disabled item button is clicked", () => {
      mockSearch.mockReturnValue([CMD_CASE]);
      const onSelect = vi.fn();
      render(
        <SlashCommandMenu
          query=""
          onSelect={onSelect}
          onClose={vi.fn()}
          disabledCommandIds={new Set(["benh-an-co-dinh"])}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Bệnh án Cố Định/ }));

      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  // -- Keyboard navigation ---------------------------------------------------

  describe("keyboard navigation", () => {
    it("selects the first navigable command on Enter without prior navigation", () => {
      mockSearch.mockReturnValue([CMD_CASE, CMD_ANALYSIS]);
      const onSelect = vi.fn();
      render(<SlashCommandMenu query="" onSelect={onSelect} onClose={vi.fn()} />);

      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );

      expect(onSelect).toHaveBeenCalledWith(CMD_CASE);
    });

    it("moves focus to the next item on ArrowDown, then selects with Enter", () => {
      mockSearch.mockReturnValue([CMD_CASE, CMD_ANALYSIS]);
      const onSelect = vi.fn();
      render(<SlashCommandMenu query="" onSelect={onSelect} onClose={vi.fn()} />);

      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
        );
      });
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );

      expect(onSelect).toHaveBeenCalledWith(CMD_ANALYSIS);
    });

    it("wraps focus to the last item on ArrowUp from the first item", () => {
      mockSearch.mockReturnValue([CMD_CASE, CMD_ANALYSIS]);
      const onSelect = vi.fn();
      render(<SlashCommandMenu query="" onSelect={onSelect} onClose={vi.fn()} />);

      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
        );
      });
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );

      expect(onSelect).toHaveBeenCalledWith(CMD_ANALYSIS);
    });

    it("skips disabled commands so focus stays on the only navigable item", () => {
      mockSearch.mockReturnValue([CMD_CASE, CMD_ANALYSIS]);
      const onSelect = vi.fn();
      render(
        <SlashCommandMenu
          query=""
          onSelect={onSelect}
          onClose={vi.fn()}
          disabledCommandIds={new Set(["chan-doan"])}
        />,
      );

      // ArrowDown with 1 navigable item wraps to index 0 again
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );

      expect(onSelect).toHaveBeenCalledWith(CMD_CASE);
    });

    it("calls onClose on Escape", () => {
      mockSearch.mockReturnValue([CMD_CASE]);
      const onClose = vi.fn();
      render(<SlashCommandMenu query="" onSelect={vi.fn()} onClose={onClose} />);

      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );

      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  // -- IME guard (isComposing) -----------------------------------------------

  describe("IME guard — isComposing", () => {
    it("ignores ArrowDown and Enter when isComposing is true", () => {
      mockSearch.mockReturnValue([CMD_CASE, CMD_ANALYSIS]);
      const onSelect = vi.fn();
      render(<SlashCommandMenu query="" onSelect={onSelect} onClose={vi.fn()} />);

      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          isComposing: true,
          bubbles: true,
        }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
        }),
      );

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("ignores Escape when isComposing is true", () => {
      mockSearch.mockReturnValue([CMD_CASE]);
      const onClose = vi.fn();
      render(<SlashCommandMenu query="" onSelect={vi.fn()} onClose={onClose} />);

      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          isComposing: true,
          bubbles: true,
        }),
      );

      expect(onClose).not.toHaveBeenCalled();
    });

    it("still fires navigation when isComposing is false", () => {
      mockSearch.mockReturnValue([CMD_CASE, CMD_ANALYSIS]);
      const onSelect = vi.fn();
      render(<SlashCommandMenu query="" onSelect={onSelect} onClose={vi.fn()} />);

      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            isComposing: false,
            bubbles: true,
          }),
        );
      });
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: false,
          bubbles: true,
        }),
      );

      expect(onSelect).toHaveBeenCalledWith(CMD_ANALYSIS);
    });
  });
});
