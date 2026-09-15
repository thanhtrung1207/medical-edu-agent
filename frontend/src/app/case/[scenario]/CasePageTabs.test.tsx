import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mutable navigation state lets tests simulate scenario changes (e.g.
// /case/fracture -> /case/missing) without pulling in the Next.js router
// context.
const navigation = vi.hoisted(() => ({
  params: { scenario: "fracture" },
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => navigation.params,
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
}));

interface CaseFormProps {
  scenario: string;
  submitted: boolean;
  onCaseSubmit: (caseText: string, selectedTeeth: number[]) => void;
  onBack?: () => void;
}

// The mocked CaseForm keeps the real callback contract and renders an
// uncontrolled input: if the panel ever unmounted on a tab switch, the typed
// value would reset, so it doubles as a state-persistence probe.
vi.mock("@/components/case/CaseForm", () => ({
  CaseForm: ({ scenario, submitted, onCaseSubmit }: CaseFormProps) => (
    <div data-testid="case-form" data-scenario={scenario}>
      <span data-testid="form-submitted">{String(submitted)}</span>
      <input data-testid="form-input" type="text" />
      <button type="button" onClick={() => onCaseSubmit("test case", [16])}>
        Submit
      </button>
    </div>
  ),
}));

interface CaseChatPanelProps {
  initialMessage: string;
  onSessionCreated?: (sessionId: string) => void;
  onFinishCase?: (summary: string) => void;
}

// The mocked CaseChatPanel mirrors the real prop surface; rendering
// initialMessage verifies the submit -> chat data flow.
vi.mock("@/components/case/CaseChatPanel", () => ({
  CaseChatPanel: ({ initialMessage }: CaseChatPanelProps) => (
    <div data-testid="case-chat-panel">{initialMessage}</div>
  ),
}));

import CasePage from "./page";

const formTab = () => screen.getByRole("tab", { name: "Thông tin ca" });
const chatTab = () => screen.getByRole("tab", { name: "Trợ lý AI" });
const panelForm = () => document.getElementById("panel-form") as HTMLElement;
const panelChat = () => document.getElementById("panel-chat") as HTMLElement;

/** Panels currently visible: mounted without the `hidden` attribute. */
const visiblePanels = () =>
  ["panel-form", "panel-chat"]
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null && !el.hasAttribute("hidden"));

describe("CasePage mobile tabs", () => {
  beforeEach(() => {
    navigation.params = { scenario: "fracture" };
    navigation.push.mockClear();
    navigation.replace.mockClear();
  });

  afterEach(cleanup);

  it("renders an accessible tab bar that disappears from md up", () => {
    render(<CasePage />);

    const tablist = screen.getByRole("tablist", {
      name: "Điều hướng ca lâm sàng",
    });
    expect(tablist.className).toContain("md:hidden");

    expect(formTab()).toBeDefined();
    expect(chatTab()).toBeDefined();
  });

  it("activates the form tab by default and hides the chat panel", () => {
    render(<CasePage />);

    expect(formTab().getAttribute("aria-selected")).toBe("true");
    expect(chatTab().getAttribute("aria-selected")).toBe("false");

    // Roving tabindex: only the active tab participates in the tab order.
    expect(formTab().tabIndex).toBe(0);
    expect(chatTab().tabIndex).toBe(-1);

    // Only the active panel is visible; the inactive panel stays mounted
    // (state persists) but is removed from the accessibility tree via the
    // hidden attribute.
    expect(panelForm().hasAttribute("hidden")).toBe(false);
    expect(panelChat().hasAttribute("hidden")).toBe(true);
    expect(visiblePanels()).toEqual([panelForm()]);
  });

  it("wires ids, aria-controls and aria-labelledby between tabs and panels", () => {
    render(<CasePage />);

    expect(formTab().id).toBe("tab-form");
    expect(formTab().getAttribute("aria-controls")).toBe("panel-form");
    expect(panelForm().getAttribute("role")).toBe("tabpanel");
    expect(panelForm().getAttribute("aria-labelledby")).toBe("tab-form");

    expect(chatTab().id).toBe("tab-chat");
    expect(chatTab().getAttribute("aria-controls")).toBe("panel-chat");
    expect(panelChat().getAttribute("role")).toBe("tabpanel");
    expect(panelChat().getAttribute("aria-labelledby")).toBe("tab-chat");
  });

  it("switches the visible panel when a tab is clicked", () => {
    render(<CasePage />);

    fireEvent.click(chatTab());

    expect(chatTab().getAttribute("aria-selected")).toBe("true");
    expect(formTab().getAttribute("aria-selected")).toBe("false");
    expect(panelChat().hasAttribute("hidden")).toBe(false);
    expect(panelForm().hasAttribute("hidden")).toBe(true);
    expect(visiblePanels()).toEqual([panelChat()]);

    fireEvent.click(formTab());

    expect(formTab().getAttribute("aria-selected")).toBe("true");
    expect(visiblePanels()).toEqual([panelForm()]);
  });

  it("auto-switches to the chat tab when the case is submitted", () => {
    render(<CasePage />);

    fireEvent.click(screen.getByText("Submit"));

    expect(chatTab().getAttribute("aria-selected")).toBe("true");
    expect(visiblePanels()).toEqual([panelChat()]);

    // The submitted case text flows into the chat panel through
    // initialMessage, and the form receives the submitted flag.
    expect(screen.getByTestId("case-chat-panel").textContent).toBe(
      "test case",
    );
    expect(screen.getByTestId("form-submitted").textContent).toBe("true");
  });

  it("keeps both panels mounted so state survives tab switches", () => {
    render(<CasePage />);

    fireEvent.change(screen.getByTestId("form-input"), {
      target: { value: "persisted value" },
    });
    fireEvent.click(screen.getByText("Submit"));

    // Switching back to the form tab hides the chat panel but keeps it
    // mounted, and the form input keeps its typed value because the form
    // panel was never unmounted.
    fireEvent.click(formTab());
    expect(panelChat().hasAttribute("hidden")).toBe(true);
    expect(screen.getByTestId("case-chat-panel")).toBeDefined();
    expect(
      (screen.getByTestId("form-input") as HTMLInputElement).value,
    ).toBe("persisted value");

    // Returning to the chat tab re-shows the same mounted chat.
    fireEvent.click(chatTab());
    expect(screen.getByTestId("case-chat-panel").textContent).toBe(
      "test case",
    );
  });

  it("activates and focuses the chat tab on ArrowRight", () => {
    render(<CasePage />);

    formTab().focus();
    fireEvent.keyDown(formTab(), { key: "ArrowRight" });

    expect(chatTab().getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(chatTab());
    expect(chatTab().tabIndex).toBe(0);
    expect(formTab().tabIndex).toBe(-1);
  });

  it("activates and focuses the form tab on ArrowLeft", () => {
    render(<CasePage />);

    fireEvent.click(chatTab());
    fireEvent.keyDown(chatTab(), { key: "ArrowLeft" });

    expect(formTab().getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(formTab());
    expect(visiblePanels()).toEqual([panelForm()]);
  });

  it("clamps arrow navigation at the first and last tab", () => {
    render(<CasePage />);

    // ArrowLeft on the first tab stays on the form tab.
    fireEvent.keyDown(formTab(), { key: "ArrowLeft" });
    expect(formTab().getAttribute("aria-selected")).toBe("true");

    // ArrowRight on the last tab stays on the chat tab.
    fireEvent.click(chatTab());
    fireEvent.keyDown(chatTab(), { key: "ArrowRight" });
    expect(chatTab().getAttribute("aria-selected")).toBe("true");
  });

  it("resets to the form tab when the scenario changes", () => {
    const { rerender } = render(<CasePage />);

    fireEvent.change(screen.getByTestId("form-input"), {
      target: { value: "old scenario value" },
    });
    fireEvent.click(screen.getByText("Submit"));
    expect(chatTab().getAttribute("aria-selected")).toBe("true");

    navigation.params = { scenario: "missing" };
    rerender(<CasePage />);

    expect(formTab().getAttribute("aria-selected")).toBe("true");
    expect(visiblePanels()).toEqual([panelForm()]);

    // The submission state is reset for the new scenario and the previous
    // chat is unmounted.
    expect(screen.getByTestId("form-submitted").textContent).toBe("false");
    expect(screen.queryByTestId("case-chat-panel")).toBeNull();

    // The form remounts for the new scenario (key={scenario}) with fresh
    // fields.
    expect(screen.getByTestId("case-form").dataset.scenario).toBe("missing");
    expect(
      (screen.getByTestId("form-input") as HTMLInputElement).value,
    ).toBe("");
  });

  it("applies responsive layout classes for mobile tabs and md+ split", () => {
    render(<CasePage />);

    // Below md the tab bar is the only header; from md up it disappears and
    // the panels split horizontally.
    expect(screen.getByRole("tablist").className).toContain("md:hidden");

    const panelsContainer = panelForm().parentElement as HTMLElement;
    expect(panelsContainer.className).toContain("md:flex-row");

    // Form pane widths: 320px at md, 400px from lg up.
    expect(panelForm().className).toContain("md:w-80");
    expect(panelForm().className).toContain("lg:w-[400px]");

    // Chat pane fills the remaining width.
    expect(panelChat().className).toContain("flex-1");
    expect(panelChat().className).toContain("min-w-0");
  });
});
