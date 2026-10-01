import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
}));

import LoginPage from "./page";
import { AuthProvider } from "@/contexts/AuthContext";

function renderLoginPage() {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  navigation.push.mockClear();
  navigation.replace.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
});

describe("LoginPage", () => {
  it("renders the premium brand panel and auth card when logged out", async () => {
    renderLoginPage();

    expect(screen.getByText("UniDent")).toBeDefined();
    expect(screen.getByText("Welcome to UniDent")).toBeDefined();
    expect(
      screen.getByText("Tiếp tục học nha khoa với AI tutor cá nhân hóa theo lịch sử học của bạn."),
    ).toBeDefined();

    const googleButton = await screen.findByRole("button", {
      name: "Đăng nhập với Google",
    });
    expect(googleButton.className).toContain("min-h-[48px]");
  });

  it("renders disabled Facebook/Apple buttons and a disabled email/password form", async () => {
    renderLoginPage();

    await screen.findByRole("button", { name: "Đăng nhập với Google" });

    const facebookButton = screen.getByRole("button", {
      name: "Facebook Sắp ra mắt",
    }) as HTMLButtonElement;
    const appleButton = screen.getByRole("button", {
      name: "Apple Sắp ra mắt",
    }) as HTMLButtonElement;
    expect(facebookButton.disabled).toBe(true);
    expect(facebookButton.getAttribute("title")).toBe("Sắp ra mắt");
    expect(appleButton.disabled).toBe(true);

    const emailInput = screen.getByPlaceholderText("Email") as HTMLInputElement;
    expect(emailInput.disabled).toBe(true);
  });

  it("redirects to / when the user is already authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "u1",
            email: "a@example.com",
            name: "A",
            avatar_url: null,
          }),
          { status: 200 },
        ),
      ),
    );

    renderLoginPage();

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/"));
  });
});
