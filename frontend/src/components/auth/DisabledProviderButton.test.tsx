import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DisabledProviderButton } from "./DisabledProviderButton";

describe("DisabledProviderButton", () => {
  it("renders a disabled Facebook button with a coming-soon tooltip", () => {
    render(<DisabledProviderButton provider="facebook" />);

    const button = screen.getByRole("button", {
      name: "Facebook",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBe("Sắp ra mắt");
  });

  it("renders a disabled Apple button with a coming-soon tooltip", () => {
    render(<DisabledProviderButton provider="apple" />);

    const button = screen.getByRole("button", {
      name: "Apple",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBe("Sắp ra mắt");
  });
});
