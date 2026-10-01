import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmailPasswordForm } from "./EmailPasswordForm";


describe("EmailPasswordForm", () => {
  it("renders a disabled email/password form with a coming-soon submit tooltip", () => {
    render(<EmailPasswordForm />);

    const emailInput = screen.getByPlaceholderText("Email") as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText(
      "Mật khẩu",
    ) as HTMLInputElement;
    const submitButton = screen.getByRole("button", {
      name: "Đăng nhập bằng email Đang phát triển",
    }) as HTMLButtonElement;

    expect(emailInput.disabled).toBe(true);
    expect(passwordInput.disabled).toBe(true);
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.getAttribute("title")).toBe(
      "Chức năng đăng nhập bằng email đang được phát triển",
    );
  });
});
