import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Separator } from "./Separator";


describe("Separator", () => {
  it("renders a centered label", () => {
    render(<Separator label="hoặc" />);

    expect(screen.getByText("hoặc")).toBeDefined();
  });
});
