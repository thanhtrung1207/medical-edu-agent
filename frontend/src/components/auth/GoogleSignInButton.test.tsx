import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { AuthProvider } from "@/contexts/AuthContext";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
});

describe("GoogleSignInButton", () => {
  it("renders a premium 48px Google sign-in button with the Google mark", async () => {
    render(
      <AuthProvider>
        <GoogleSignInButton />
      </AuthProvider>,
    );

    const button = await screen.findByRole("button", {
      name: "Đăng nhập với Google",
    });
    expect(button.className).toContain("min-h-[48px]");
    expect(screen.getByLabelText("Google")).toBeDefined();
  });
});
