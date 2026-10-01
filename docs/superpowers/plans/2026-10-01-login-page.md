# Dedicated /login Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Header's inline Google-only login button with a dedicated `/login` page (split-screen layout) that hosts a working Google sign-in button alongside disabled placeholders for email/password and Facebook/Apple sign-in.

**Architecture:** Four small presentational/behavioral components in `frontend/src/components/auth/` (`GoogleSignInButton`, `DisabledProviderButton`, `EmailPasswordForm`, `LoginBrandPanel`) get composed into a new `frontend/src/app/login/page.tsx` route. `Header.tsx`'s existing inline Google button is replaced with a generic "Đăng nhập" button that navigates to `/login` via `next/navigation`'s `useRouter`. No backend changes.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Vitest + @testing-library/react.

---

### Task 1: `GoogleSignInButton` component

**Files:**
- Create: `frontend/src/components/auth/GoogleSignInButton.tsx`
- Create: `frontend/src/components/auth/GoogleSignInButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/auth/GoogleSignInButton.test.tsx`:

```tsx
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
  it("renders a 44px-tall button labelled for Google sign-in", async () => {
    render(
      <AuthProvider>
        <GoogleSignInButton />
      </AuthProvider>,
    );

    const button = await screen.findByRole("button", {
      name: "Đăng nhập với Google",
    });
    expect(button.className).toContain("min-h-[44px]");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/auth/GoogleSignInButton.test.tsx`
Expected: FAIL — `./GoogleSignInButton` does not exist yet.

- [ ] **Step 3: Create `frontend/src/components/auth/GoogleSignInButton.tsx`**

```tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";

export function GoogleSignInButton() {
  const { login } = useAuth();

  return (
    <button
      type="button"
      onClick={login}
      aria-label="Đăng nhập với Google"
      className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-white transition hover:bg-primary-700"
    >
      Đăng nhập với Google
    </button>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/auth/GoogleSignInButton.test.tsx`
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/auth/GoogleSignInButton.tsx src/components/auth/GoogleSignInButton.test.tsx
git commit -m "feat(frontend): add standalone GoogleSignInButton component"
```

---

### Task 2: `DisabledProviderButton` component

**Files:**
- Create: `frontend/src/components/auth/DisabledProviderButton.tsx`
- Create: `frontend/src/components/auth/DisabledProviderButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/auth/DisabledProviderButton.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/auth/DisabledProviderButton.test.tsx`
Expected: FAIL — `./DisabledProviderButton` does not exist yet.

- [ ] **Step 3: Create `frontend/src/components/auth/DisabledProviderButton.tsx`**

```tsx
interface DisabledProviderButtonProps {
  provider: "facebook" | "apple";
}

const PROVIDER_LABELS: Record<DisabledProviderButtonProps["provider"], string> = {
  facebook: "Facebook",
  apple: "Apple",
};

export function DisabledProviderButton({
  provider,
}: DisabledProviderButtonProps) {
  return (
    <button
      type="button"
      disabled
      title="Sắp ra mắt"
      className="flex min-h-[44px] w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
    >
      {PROVIDER_LABELS[provider]}
    </button>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/auth/DisabledProviderButton.test.tsx`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/auth/DisabledProviderButton.tsx src/components/auth/DisabledProviderButton.test.tsx
git commit -m "feat(frontend): add disabled Facebook/Apple provider button placeholder"
```

---

### Task 3: `EmailPasswordForm` component

**Files:**
- Create: `frontend/src/components/auth/EmailPasswordForm.tsx`
- Create: `frontend/src/components/auth/EmailPasswordForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/auth/EmailPasswordForm.test.tsx`:

```tsx
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
      name: "Đăng nhập",
    }) as HTMLButtonElement;

    expect(emailInput.disabled).toBe(true);
    expect(passwordInput.disabled).toBe(true);
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.getAttribute("title")).toBe(
      "Chức năng đăng nhập bằng email đang được phát triển",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/auth/EmailPasswordForm.test.tsx`
Expected: FAIL — `./EmailPasswordForm` does not exist yet.

- [ ] **Step 3: Create `frontend/src/components/auth/EmailPasswordForm.tsx`**

```tsx
export function EmailPasswordForm() {
  return (
    <form className="w-full" onSubmit={(event) => event.preventDefault()}>
      <fieldset disabled className="flex flex-col gap-2">
        <input
          type="email"
          placeholder="Email"
          aria-label="Email"
          className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
        <input
          type="password"
          placeholder="Mật khẩu"
          aria-label="Mật khẩu"
          className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
        <button
          type="submit"
          title="Chức năng đăng nhập bằng email đang được phát triển"
          className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-slate-200 px-3 text-sm font-medium text-slate-400 dark:bg-slate-700 dark:text-slate-500"
        >
          Đăng nhập
        </button>
      </fieldset>
    </form>
  );
}
```

Note: a `disabled` `<fieldset>` disables every form control nested inside it (inputs and the submit button), so no `disabled` attribute needs repeating on each one individually.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/auth/EmailPasswordForm.test.tsx`
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/auth/EmailPasswordForm.tsx src/components/auth/EmailPasswordForm.test.tsx
git commit -m "feat(frontend): add disabled EmailPasswordForm placeholder"
```

---

### Task 4: `LoginBrandPanel` component

**Files:**
- Create: `frontend/src/components/auth/LoginBrandPanel.tsx`
- Create: `frontend/src/components/auth/LoginBrandPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/auth/LoginBrandPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginBrandPanel } from "./LoginBrandPanel";

describe("LoginBrandPanel", () => {
  it("renders the UniDent brand and slogan, hidden below the md breakpoint", () => {
    const { container } = render(<LoginBrandPanel />);

    expect(screen.getByText("UniDent")).toBeDefined();
    expect(
      screen.getByText(
        "Học nha khoa cùng AI — hỏi đáp, case study, quiz có trích dẫn",
      ),
    ).toBeDefined();

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("hidden");
    expect(root.className).toContain("md:flex");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/auth/LoginBrandPanel.test.tsx`
Expected: FAIL — `./LoginBrandPanel` does not exist yet.

- [ ] **Step 3: Create `frontend/src/components/auth/LoginBrandPanel.tsx`**

```tsx
import { Stethoscope } from "lucide-react";

export function LoginBrandPanel() {
  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary to-primary-900 p-10 text-center text-white md:flex">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
        <Stethoscope className="h-8 w-8" />
      </div>
      <div className="text-2xl font-bold">UniDent</div>
      <p className="max-w-xs text-sm text-white/80">
        Học nha khoa cùng AI — hỏi đáp, case study, quiz có trích dẫn
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/auth/LoginBrandPanel.test.tsx`
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/auth/LoginBrandPanel.tsx src/components/auth/LoginBrandPanel.test.tsx
git commit -m "feat(frontend): add LoginBrandPanel for the split-screen login layout"
```

---

### Task 5: `Header` navigates to `/login` instead of calling Google directly

**Files:**
- Modify: `frontend/src/components/layout/Header.tsx`
- Modify: `frontend/src/components/layout/Header.test.tsx`

- [ ] **Step 1: Replace the full contents of `frontend/src/components/layout/Header.test.tsx` with:**

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
}));

import { Header } from "./Header";
import { AuthProvider } from "@/contexts/AuthContext";

vi.mock("@/components/case/SettingsModal", () => ({
  SettingsModal: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Dữ liệu học tập</div> : null,
}));

// jsdom does not implement window.matchMedia, which Header reads on mount.
function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderHeader(props: Parameters<typeof Header>[0] = {}) {
  return render(
    <AuthProvider>
      <Header {...props} />
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  navigation.push.mockClear();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  stubMatchMedia(false);
  // Default to logged-out so existing assertions (no avatar/logout button)
  // keep holding; individual tests override this to simulate a logged-in user.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
});

describe("Header", () => {
  it("renders the UniDent wordmark and drops legacy brand text", () => {
    renderHeader();

    expect(screen.getByText("UniDent")).toBeDefined();
    expect(screen.queryByText("Phục hình AI")).toBeNull();
    expect(screen.queryByText("Trợ lý Phục hình")).toBeNull();
  });

  it("keeps the brand as plain text so each route keeps its own top-level heading", () => {
    renderHeader();

    expect(screen.queryByRole("heading")).toBeNull();
    const brand = screen.getByText("UniDent");
    expect(brand.tagName).toBe("SPAN");
  });

  it("hamburger is a 44px mobile-only control wired to onToggleDrawer", () => {
    const onToggleDrawer = vi.fn();
    renderHeader({ onToggleDrawer });

    const hamburger = screen.getByRole("button", {
      name: "Mở menu điều hướng",
    });
    expect(hamburger.getAttribute("aria-controls")).toBe("nav-drawer");
    expect(hamburger.className).toContain("h-11");
    expect(hamburger.className).toContain("w-11");
    expect(hamburger.className).toContain("md:hidden");

    fireEvent.click(hamburger);
    expect(onToggleDrawer).toHaveBeenCalledTimes(1);
  });

  it("hamburger aria-expanded reflects the drawerOpen prop", () => {
    const { rerender } = renderHeader({ onToggleDrawer: () => {} });

    const hamburger = screen.getByRole("button", {
      name: "Mở menu điều hướng",
    });
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");

    rerender(
      <AuthProvider>
        <Header onToggleDrawer={() => {}} drawerOpen />
      </AuthProvider>,
    );
    expect(
      screen
        .getByRole("button", { name: "Mở menu điều hướng" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("tolerates a missing onToggleDrawer while the AppShell wiring is pending", () => {
    renderHeader();

    fireEvent.click(
      screen.getByRole("button", { name: "Mở menu điều hướng" }),
    );
  });

  it("toggles dark mode from a 44px target and persists the choice", () => {
    renderHeader();

    const themeButton = screen.getByRole("button", {
      name: "Chuyển sang chế độ tối",
    });
    expect(themeButton.className).toContain("h-11");
    expect(themeButton.className).toContain("w-11");

    fireEvent.click(themeButton);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: "Chuyển sang chế độ sáng" }),
    ).toBeDefined();
  });

  it("applies the stored dark preference on mount", () => {
    localStorage.setItem("theme", "dark");
    renderHeader();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Chuyển sang chế độ sáng" }),
    ).toBeDefined();
  });

  it("opens the settings modal from a 44px target", () => {
    renderHeader();

    const settingsButton = screen.getByRole("button", {
      name: "Quản lý dữ liệu học tập",
    });
    expect(settingsButton.className).toContain("h-11");
    expect(settingsButton.className).toContain("w-11");

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(settingsButton);
    expect(screen.getByRole("dialog")).toBeDefined();
  });
});

describe("Header auth controls", () => {
  it("shows a 44px-tall login control that navigates to /login when logged out", async () => {
    renderHeader();

    const loginButton = await screen.findByRole("button", {
      name: "Đăng nhập",
    });
    expect(loginButton.className).toContain("min-h-[44px]");

    fireEvent.click(loginButton);
    expect(navigation.push).toHaveBeenCalledWith("/login");
  });

  it("shows the avatar and a 44px sign-out control when logged in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "u1",
            email: "a@example.com",
            name: "Nguyễn A",
            avatar_url: null,
          }),
          { status: 200 },
        ),
      ),
    );

    renderHeader();

    expect(await screen.findByText("Nguyễn A")).toBeDefined();
    const logoutButton = screen.getByRole("button", { name: "Đăng xuất" });
    expect(logoutButton.className).toContain("min-h-[44px]");

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(logoutButton);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeDefined(),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/layout/Header.test.tsx`
Expected: FAIL — `Header` still renders a button labelled "Đăng nhập với Google" that calls `login` directly; the two "Header auth controls" tests now look for "Đăng nhập" and `navigation.push`.

- [ ] **Step 3: Modify `frontend/src/components/layout/Header.tsx`**

Replace the full contents with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Menu, Moon, Settings, Stethoscope, Sun } from "lucide-react";
import { SettingsModal } from "@/components/case/SettingsModal";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  onToggleDrawer?: () => void;
  /** Mirrors the AppShell drawer state so the launcher reports it correctly. */
  drawerOpen?: boolean;
}

export function Header({ onToggleDrawer, drawerOpen }: HeaderProps) {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { user, logout } = useAuth();

  // Initialise theme from system / stored preference.
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark =
      stored === "dark" ||
      (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(prefersDark);
    document.documentElement.classList.toggle("dark", prefersDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleDrawer}
          aria-label="Mở menu điều hướng"
          aria-expanded={drawerOpen ?? false}
          aria-controls="nav-drawer"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white md:hidden">
          <Stethoscope className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
          UniDent
        </span>
      </div>

      <div className="flex items-center gap-1">
        {user ? (
          <div className="flex items-center gap-2 pr-1">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name ?? user.email}
                className="h-7 w-7 rounded-full"
              />
            ) : null}
            <span className="hidden text-xs font-medium text-slate-700 dark:text-slate-200 sm:inline">
              {user.name ?? user.email}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="Đăng xuất"
              className="flex min-h-[44px] items-center rounded-lg px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => router.push("/login")}
            aria-label="Đăng nhập"
            className="flex min-h-[44px] items-center rounded-lg bg-primary px-3 text-xs font-medium text-white transition hover:bg-primary-700"
          >
            Đăng nhập
          </button>
        )}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Quản lý dữ liệu học tập"
          aria-label="Quản lý dữ liệu học tập"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/layout/Header.test.tsx`
Expected: 10 passed

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/layout/Header.tsx src/components/layout/Header.test.tsx
git commit -m "feat(frontend): Header login control navigates to /login instead of Google directly"
```

---

### Task 6: `/login` page

**Files:**
- Create: `frontend/src/app/login/page.tsx`
- Create: `frontend/src/app/login/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/login/page.test.tsx`:

```tsx
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
  it("renders the brand panel and a working Google sign-in button when logged out", async () => {
    renderLoginPage();

    expect(screen.getByText("UniDent")).toBeDefined();
    const googleButton = await screen.findByRole("button", {
      name: "Đăng nhập với Google",
    });
    expect(googleButton.className).toContain("min-h-[44px]");
  });

  it("renders disabled Facebook/Apple buttons and a disabled email/password form", async () => {
    renderLoginPage();

    await screen.findByRole("button", { name: "Đăng nhập với Google" });

    const facebookButton = screen.getByRole("button", {
      name: "Facebook",
    }) as HTMLButtonElement;
    const appleButton = screen.getByRole("button", {
      name: "Apple",
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/login/page.test.tsx`
Expected: FAIL — `./page` does not exist yet.

- [ ] **Step 3: Create `frontend/src/app/login/page.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { LoginBrandPanel } from "@/components/auth/LoginBrandPanel";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { DisabledProviderButton } from "@/components/auth/DisabledProviderButton";
import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";

export default function LoginPage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  if (user) return null;

  return (
    <div className="flex h-full w-full">
      <LoginBrandPanel />
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-full max-w-xs flex-col gap-3">
          <h1 className="text-center text-lg font-bold text-slate-800 dark:text-slate-100">
            Đăng nhập
          </h1>
          <GoogleSignInButton />
          <div className="flex gap-2">
            <DisabledProviderButton provider="facebook" />
            <DisabledProviderButton provider="apple" />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            <span>hoặc</span>
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>
          <EmailPasswordForm />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/login/page.test.tsx`
Expected: 3 passed

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all passing, with the new `GoogleSignInButton.test.tsx` (1), `DisabledProviderButton.test.tsx` (2), `EmailPasswordForm.test.tsx` (1), `LoginBrandPanel.test.tsx` (1), `Header.test.tsx` (10, unchanged count from before this plan), and `page.test.tsx` (3) all included, with 0 failures.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/app/login/page.tsx src/app/login/page.test.tsx
git commit -m "feat(frontend): add dedicated /login page with Google, disabled email/password, and disabled Facebook/Apple"
```

---
