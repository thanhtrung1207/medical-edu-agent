import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const replaceMock = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsValue,
}));

import AuthCallbackPage from "./page";

afterEach(() => {
  replaceMock.mockClear();
});

describe("AuthCallbackPage", () => {
  it("redirects home immediately on success (?ok=1)", async () => {
    searchParamsValue = new URLSearchParams({ ok: "1" });

    render(<AuthCallbackPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });

  it("shows the Vietnamese message for a known error code", async () => {
    searchParamsValue = new URLSearchParams({ error: "AUTH_GOOGLE_DENIED" });

    render(<AuthCallbackPage />);

    expect(
      await screen.findByText("Bạn đã huỷ đăng nhập Google."),
    ).toBeDefined();
  });

  it("falls back to a generic message for an unknown error code", async () => {
    searchParamsValue = new URLSearchParams({ error: "SOMETHING_NEW" });

    render(<AuthCallbackPage />);

    expect(
      await screen.findByText("Đăng nhập không thành công, vui lòng thử lại."),
    ).toBeDefined();
  });
});
