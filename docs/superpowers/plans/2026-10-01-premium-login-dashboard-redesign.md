# Premium Login and Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign UniDent's `/login` page and `/` home dashboard into a premium medical SaaS experience using shadcn-style internal components while preserving existing auth and case routing behavior.

**Architecture:** Add a small internal `frontend/src/components/ui/` primitive layer (`Button`, `Card`, `Badge`, `Input`, `Separator`) built on Tailwind and the existing `cn()` helper, then update auth components and home components to compose those primitives. No backend changes, no shadcn CLI install, no Radix dependency, and no AppShell bypass.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, clsx/tailwind-merge `cn()`, lucide-react, Vitest + Testing Library.

---

### Task 1: Internal shadcn-style UI primitives

**Files:**
- Create: `frontend/src/components/ui/Button.tsx`
- Create: `frontend/src/components/ui/Button.test.tsx`
- Create: `frontend/src/components/ui/Card.tsx`
- Create: `frontend/src/components/ui/Card.test.tsx`
- Create: `frontend/src/components/ui/Badge.tsx`
- Create: `frontend/src/components/ui/Input.tsx`
- Create: `frontend/src/components/ui/Input.test.tsx`
- Create: `frontend/src/components/ui/Separator.tsx`
- Create: `frontend/src/components/ui/Separator.test.tsx`

- [ ] **Step 1: Write tests for UI primitives**

Create `frontend/src/components/ui/Button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";


describe("Button", () => {
  it("renders a primary large button and forwards native props", () => {
    const onClick = vi.fn();

    render(
      <Button type="button" variant="primary" size="lg" onClick={onClick}>
        Tiếp tục
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Tiếp tục" });
    expect(button.className).toContain("min-h-[48px]");
    expect(button.className).toContain("bg-primary");
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a disabled muted button", () => {
    render(
      <Button type="button" variant="muted" disabled>
        Đang phát triển
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Đang phát triển" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.className).toContain("bg-slate-200");
  });
});
```

Create `frontend/src/components/ui/Card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./Card";


describe("Card", () => {
  it("renders structured card sections", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Tiêu đề</CardTitle>
          <CardDescription>Mô tả</CardDescription>
        </CardHeader>
        <CardContent>Nội dung</CardContent>
      </Card>,
    );

    expect(screen.getByText("Tiêu đề")).toBeDefined();
    expect(screen.getByText("Mô tả")).toBeDefined();
    expect(screen.getByText("Nội dung")).toBeDefined();
  });
});
```

Create `frontend/src/components/ui/Input.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./Input";


describe("Input", () => {
  it("forwards disabled and placeholder props", () => {
    render(<Input placeholder="Email" disabled />);

    const input = screen.getByPlaceholderText("Email") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.className).toContain("min-h-[46px]");
  });
});
```

Create `frontend/src/components/ui/Separator.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Separator } from "./Separator";


describe("Separator", () => {
  it("renders a centered label", () => {
    render(<Separator label="hoặc" />);

    expect(screen.getByText("hoặc")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run primitive tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ui/Button.test.tsx src/components/ui/Card.test.tsx src/components/ui/Input.test.tsx src/components/ui/Separator.test.tsx`

Expected: FAIL because the UI primitive files do not exist yet.

- [ ] **Step 3: Create UI primitives**

Create `frontend/src/components/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "muted";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary-700 disabled:hover:bg-primary",
  secondary:
    "bg-secondary text-primary-900 shadow-lg shadow-secondary/20 hover:bg-secondary-600",
  outline:
    "border border-borderSoft bg-white text-slate-700 hover:border-primary/40 hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  muted:
    "bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-[40px] px-3 text-xs",
  md: "min-h-[44px] px-4 text-sm",
  lg: "min-h-[48px] px-5 text-sm",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-80",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
```

Create `frontend/src/components/ui/Card.tsx`:

```tsx
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-borderSoft bg-white shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-2 p-6 pb-3", className)} {...props} />;
}

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: "h1" | "h2" | "h3";
}

export function CardTitle({
  as: Comp = "h2",
  className,
  ...props
}: CardTitleProps) {
  return (
    <Comp
      className={cn("text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm leading-relaxed text-slate-500 dark:text-slate-400", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-3", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}
```

Create `frontend/src/components/ui/Badge.tsx`:

```tsx
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "primary" | "secondary" | "muted";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  primary: "border-primary/20 bg-primary-50 text-primary",
  secondary: "border-secondary/30 bg-secondary-50 text-secondary-900",
  muted: "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function Badge({ className, variant = "primary", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
```

Create `frontend/src/components/ui/Input.tsx`:

```tsx
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-[46px] w-full rounded-2xl border border-borderSoft bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800",
        className,
      )}
      {...props}
    />
  );
}
```

Create `frontend/src/components/ui/Separator.tsx`:

```tsx
import { cn } from "@/lib/utils";

interface SeparatorProps {
  label?: string;
  className?: string;
}

export function Separator({ label, className }: SeparatorProps) {
  if (!label) {
    return <div aria-hidden="true" className={cn("h-px w-full bg-borderSoft dark:bg-slate-700", className)} />;
  }

  return (
    <div className={cn("flex items-center gap-3 text-xs text-slate-400", className)}>
      <span aria-hidden="true" className="h-px flex-1 bg-borderSoft dark:bg-slate-700" />
      <span>{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-borderSoft dark:bg-slate-700" />
    </div>
  );
}
```

- [ ] **Step 4: Run primitive tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ui/Button.test.tsx src/components/ui/Card.test.tsx src/components/ui/Input.test.tsx src/components/ui/Separator.test.tsx`

Expected: 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/Button.tsx frontend/src/components/ui/Button.test.tsx frontend/src/components/ui/Card.tsx frontend/src/components/ui/Card.test.tsx frontend/src/components/ui/Badge.tsx frontend/src/components/ui/Input.tsx frontend/src/components/ui/Input.test.tsx frontend/src/components/ui/Separator.tsx frontend/src/components/ui/Separator.test.tsx
git commit -m "feat(frontend): add shadcn-style UI primitives"
```

---

### Task 2: Premium auth components

**Files:**
- Modify: `frontend/src/components/auth/GoogleSignInButton.tsx`
- Modify: `frontend/src/components/auth/DisabledProviderButton.tsx`
- Modify: `frontend/src/components/auth/EmailPasswordForm.tsx`
- Modify: `frontend/src/components/auth/LoginBrandPanel.tsx`
- Modify: `frontend/src/components/auth/GoogleSignInButton.test.tsx`
- Modify: `frontend/src/components/auth/DisabledProviderButton.test.tsx`
- Modify: `frontend/src/components/auth/EmailPasswordForm.test.tsx`
- Modify: `frontend/src/components/auth/LoginBrandPanel.test.tsx`

- [ ] **Step 1: Update auth component tests first**

Replace `frontend/src/components/auth/GoogleSignInButton.test.tsx` with:

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
  it("renders a premium 48px Google sign-in button", async () => {
    render(
      <AuthProvider>
        <GoogleSignInButton />
      </AuthProvider>,
    );

    const button = await screen.findByRole("button", {
      name: "Đăng nhập với Google",
    });
    expect(button.className).toContain("min-h-[48px]");
    expect(screen.getByText("G")).toBeDefined();
  });
});
```

Replace `frontend/src/components/auth/DisabledProviderButton.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DisabledProviderButton } from "./DisabledProviderButton";


describe("DisabledProviderButton", () => {
  it("renders a disabled Facebook button with a coming-soon tooltip", () => {
    render(<DisabledProviderButton provider="facebook" />);

    const button = screen.getByRole("button", {
      name: "Facebook Sắp ra mắt",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBe("Sắp ra mắt");
  });

  it("renders a disabled Apple button with a coming-soon tooltip", () => {
    render(<DisabledProviderButton provider="apple" />);

    const button = screen.getByRole("button", {
      name: "Apple Sắp ra mắt",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBe("Sắp ra mắt");
  });
});
```

Replace `frontend/src/components/auth/EmailPasswordForm.test.tsx` with:

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
```

Replace `frontend/src/components/auth/LoginBrandPanel.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginBrandPanel } from "./LoginBrandPanel";


describe("LoginBrandPanel", () => {
  it("renders the premium UniDent brand panel, hidden below the md breakpoint", () => {
    const { container } = render(<LoginBrandPanel />);

    expect(screen.getByText("UniDent")).toBeDefined();
    expect(
      screen.getByText("Học nha khoa với trợ lý AI có trích dẫn."),
    ).toBeDefined();
    expect(screen.getByText("Case study theo ca lâm sàng")).toBeDefined();
    expect(screen.getByText("Quiz luyện thi & spaced repetition")).toBeDefined();
    expect(screen.getByText("Câu trả lời có nguồn tham khảo")).toBeDefined();

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("hidden");
    expect(root.className).toContain("md:flex");
  });
});
```

- [ ] **Step 2: Run auth tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/auth/GoogleSignInButton.test.tsx src/components/auth/DisabledProviderButton.test.tsx src/components/auth/EmailPasswordForm.test.tsx src/components/auth/LoginBrandPanel.test.tsx`

Expected: FAIL because the components still use the old simpler markup.

- [ ] **Step 3: Update auth components**

Replace `frontend/src/components/auth/GoogleSignInButton.tsx` with:

```tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";

export function GoogleSignInButton() {
  const { login } = useAuth();

  return (
    <Button type="button" onClick={login} aria-label="Đăng nhập với Google" size="lg">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-primary">
        G
      </span>
      Đăng nhập với Google
    </Button>
  );
}
```

Replace `frontend/src/components/auth/DisabledProviderButton.tsx` with:

```tsx
import { Button } from "@/components/ui/Button";

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
    <Button type="button" variant="outline" disabled title="Sắp ra mắt">
      <span>{PROVIDER_LABELS[provider]}</span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        Sắp ra mắt
      </span>
    </Button>
  );
}
```

Replace `frontend/src/components/auth/EmailPasswordForm.tsx` with:

```tsx
import { Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function EmailPasswordForm() {
  return (
    <form className="w-full" onSubmit={(event) => event.preventDefault()}>
      {/* disabled repeated per-control: jsdom doesn't propagate fieldset[disabled] to descendants (real browsers do) */}
      <fieldset disabled className="flex flex-col gap-3">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="email"
            placeholder="Email"
            aria-label="Email"
            disabled
            className="pl-11"
          />
        </div>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="password"
            placeholder="Mật khẩu"
            aria-label="Mật khẩu"
            disabled
            className="pl-11"
          />
        </div>
        <Button
          type="submit"
          variant="muted"
          size="lg"
          disabled
          title="Chức năng đăng nhập bằng email đang được phát triển"
        >
          <span>Đăng nhập bằng email</span>
          <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-semibold text-slate-400 dark:bg-slate-800/70">
            Đang phát triển
          </span>
        </Button>
      </fieldset>
    </form>
  );
}
```

Replace `frontend/src/components/auth/LoginBrandPanel.tsx` with:

```tsx
import { BookOpenCheck, FileText, GraduationCap, Stethoscope } from "lucide-react";

const features = [
  { icon: FileText, label: "Case study theo ca lâm sàng" },
  { icon: GraduationCap, label: "Quiz luyện thi & spaced repetition" },
  { icon: BookOpenCheck, label: "Câu trả lời có nguồn tham khảo" },
];

export function LoginBrandPanel() {
  return (
    <section className="relative hidden flex-1 overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary-900 via-primary to-primary-700 p-8 text-white shadow-2xl shadow-primary/25 md:flex md:flex-col md:justify-between">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-secondary/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-10 h-64 w-64 rounded-full border border-white/10" />

      <div className="relative">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <Stethoscope className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xl font-bold">UniDent</div>
            <div className="text-xs text-white/70">AI Dental Education</div>
          </div>
        </div>

        <h2 className="mt-10 max-w-sm text-4xl font-extrabold leading-tight tracking-tight">
          Học nha khoa với trợ lý AI có trích dẫn.
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-6 text-white/75">
          Một không gian học tập cao cấp cho case study, quiz luyện thi và câu trả lời có nguồn rõ ràng.
        </p>
      </div>

      <div className="relative space-y-3">
        {features.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-3 text-sm text-white/90"
          >
            <Icon className="h-4 w-4 text-secondary-100" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run auth tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/auth/GoogleSignInButton.test.tsx src/components/auth/DisabledProviderButton.test.tsx src/components/auth/EmailPasswordForm.test.tsx src/components/auth/LoginBrandPanel.test.tsx`

Expected: 4 test files passed, 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/auth/GoogleSignInButton.tsx frontend/src/components/auth/GoogleSignInButton.test.tsx frontend/src/components/auth/DisabledProviderButton.tsx frontend/src/components/auth/DisabledProviderButton.test.tsx frontend/src/components/auth/EmailPasswordForm.tsx frontend/src/components/auth/EmailPasswordForm.test.tsx frontend/src/components/auth/LoginBrandPanel.tsx frontend/src/components/auth/LoginBrandPanel.test.tsx
git commit -m "feat(frontend): polish auth components with premium UI primitives"
```

---

### Task 3: Premium `/login` page layout

**Files:**
- Modify: `frontend/src/app/login/page.tsx`
- Modify: `frontend/src/app/login/page.test.tsx`

- [ ] **Step 1: Update `/login` page tests**

Replace `frontend/src/app/login/page.test.tsx` with:

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
```

- [ ] **Step 2: Run `/login` tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/login/page.test.tsx`

Expected: FAIL because the page still uses the old simple layout and microcopy.

- [ ] **Step 3: Update `/login` page**

Replace `frontend/src/app/login/page.tsx` with:

```tsx
"use client";

import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Separator } from "@/components/ui/Separator";
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
    <div className="min-h-full overflow-y-auto bg-gradient-to-br from-cream via-white to-secondary-50 p-4 dark:from-slate-950 dark:via-slate-950 dark:to-primary-900/20 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-8rem)] w-full max-w-6xl gap-6 md:grid-cols-[0.95fr_1fr]">
        <LoginBrandPanel />

        <div className="flex items-center justify-center">
          <Card className="w-full max-w-md border-white/80 bg-white/90 shadow-2xl shadow-primary/10 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/90">
            <CardHeader className="text-center">
              <div className="flex justify-center">
                <Badge variant="primary">Welcome to UniDent</Badge>
              </div>
              <CardTitle as="h1">Đăng nhập</CardTitle>
              <CardDescription>
                Tiếp tục học nha khoa với AI tutor cá nhân hóa theo lịch sử học của bạn.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <GoogleSignInButton />
              <div className="grid grid-cols-2 gap-3">
                <DisabledProviderButton provider="facebook" />
                <DisabledProviderButton provider="apple" />
              </div>
              <Separator label="hoặc" />
              <EmailPasswordForm />
              <div className="flex items-center justify-center gap-2 text-center text-xs text-slate-400">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>Bảo mật bởi Google OAuth · lịch sử học được đồng bộ sau đăng nhập</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run `/login` tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ui/Card.test.tsx src/app/login/page.test.tsx`

Expected: 2 test files passed, 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/login/page.tsx frontend/src/app/login/page.test.tsx frontend/src/components/ui/Card.tsx
git commit -m "feat(frontend): redesign login page with premium auth card"
```

---

### Task 4: Premium `ScenarioCard`

**Files:**
- Modify: `frontend/src/components/home/ScenarioCard.tsx`
- Create: `frontend/src/components/home/ScenarioCard.test.tsx`

- [ ] **Step 1: Write `ScenarioCard` tests**

Create `frontend/src/components/home/ScenarioCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ScenarioCard from "./ScenarioCard";


describe("ScenarioCard", () => {
  it("renders a premium scenario link with tags and a 44px CTA", () => {
    render(
      <ScenarioCard
        href="/case/fracture"
        icon="🦷"
        title="Răng vỡ / Sâu nặng"
        description="Đánh giá khả năng phục hồi"
        tags={["Composite", "Mão răng"]}
      />,
    );

    const link = screen.getByRole("link", { name: /Răng vỡ \/ Sâu nặng/ });
    expect(link.getAttribute("href")).toBe("/case/fracture");
    expect(screen.getByText("Composite")).toBeDefined();
    expect(screen.getByText("Mão răng")).toBeDefined();
    const cta = screen.getByText("Bắt đầu phân tích");
    expect(cta.className).toContain("min-h-[44px]");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/home/ScenarioCard.test.tsx`

Expected: FAIL because the current CTA does not contain the new `min-h-[44px]` class.

- [ ] **Step 3: Update `ScenarioCard`**

Replace `frontend/src/components/home/ScenarioCard.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";

interface ScenarioCardProps {
  href: string;
  icon: string;
  title: string;
  description: string;
  tags: string[];
}

export default function ScenarioCard({
  href,
  icon,
  title,
  description,
  tags,
}: ScenarioCardProps) {
  return (
    <Link href={href} className="group block h-full focus:outline-none">
      <Card className="h-full overflow-hidden transition duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 group-focus-visible:ring-4 group-focus-visible:ring-primary/20">
        <CardContent className="flex h-full flex-col p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cream text-3xl shadow-inner shadow-white dark:bg-slate-800">
              {icon}
            </div>
            <Badge variant="secondary">Case study</Badge>
          </div>
          <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {title}
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="muted">
                {tag}
              </Badge>
            ))}
          </div>
          <div className="mt-6 flex min-h-[44px] items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white transition group-hover:bg-primary-700">
            Bắt đầu phân tích
            <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/home/ScenarioCard.test.tsx`

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/home/ScenarioCard.tsx frontend/src/components/home/ScenarioCard.test.tsx
git commit -m "feat(frontend): polish scenario cards for premium dashboard"
```

---

### Task 5: Premium dashboard home page

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Create: `frontend/src/app/page.test.tsx`

- [ ] **Step 1: Write home page tests**

Create `frontend/src/app/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";


describe("HomePage", () => {
  it("renders the premium dashboard greeting and hero", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Chào mừng quay lại" })).toBeDefined();
    expect(screen.getByText("AI Dental Education")).toBeDefined();
    expect(screen.getByText("Case Study: Phục hình răng sau")).toBeDefined();
    expect(screen.getByRole("link", { name: "Tiếp tục học" }).getAttribute("href")).toBe("/case/fracture");
  });

  it("keeps both existing case routes available", () => {
    render(<HomePage />);

    expect(screen.getByRole("link", { name: /Răng vỡ \/ Sâu nặng/ }).getAttribute("href")).toBe("/case/fracture");
    expect(screen.getByRole("link", { name: /Mất răng đơn lẻ/ }).getAttribute("href")).toBe("/case/missing");
  });
});
```

- [ ] **Step 2: Run home tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/page.test.tsx`

Expected: FAIL because the current home page does not render the premium dashboard greeting/hero.

- [ ] **Step 3: Update home page**

Replace `frontend/src/app/page.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { ArrowRight, BookOpenCheck, Sparkles, Target } from "lucide-react";
import ScenarioCard from "@/components/home/ScenarioCard";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";

const metrics = [
  { label: "Cases done", value: "12", helper: "case luyện tập" },
  { label: "Quiz streak", value: "7 ngày", helper: "duy trì học đều" },
  { label: "Citations", value: "98%", helper: "câu trả lời có nguồn" },
];

export default function HomePage() {
  return (
    <div className="min-h-full overflow-y-auto bg-gradient-to-br from-cream via-white to-secondary-50 p-4 dark:from-slate-950 dark:via-slate-950 dark:to-primary-900/20 sm:p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="primary">AI Dental Education</Badge>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
              Chào mừng quay lại
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Tiếp tục ca lâm sàng và luyện quiz hôm nay với trải nghiệm học nha khoa có cấu trúc, thân thiện và có trích dẫn.
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <Card className="overflow-hidden border-primary/10 bg-gradient-to-br from-primary via-primary-700 to-primary-900 text-white shadow-2xl shadow-primary/20">
            <CardContent className="grid gap-6 p-6 md:grid-cols-[1fr_220px] md:p-8">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-secondary-100">
                  <Sparkles className="h-4 w-4" />
                  Gợi ý tiếp theo
                </div>
                <h2 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">
                  Case Study: Phục hình răng sau
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">
                  AI sẽ dẫn dắt bằng câu hỏi Socratic, gợi ý chẩn đoán, kế hoạch điều trị và trích dẫn kiến thức liên quan.
                </p>
                <Link
                  href="/case/fracture"
                  className="mt-6 inline-flex min-h-[44px] items-center rounded-2xl bg-white px-5 text-sm font-bold text-primary transition hover:bg-secondary-50"
                >
                  Tiếp tục học
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
              <div className="hidden rounded-3xl border border-white/10 bg-white/10 p-4 md:block">
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-white/70">
                  FDI quick map
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-10 rounded-xl bg-white/80 shadow-inner shadow-primary/10"
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary-50 text-secondary-900">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-50">Learning plan</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">3 bước học gợi ý hôm nay</div>
                </div>
              </div>
              <div className="mt-5 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="rounded-2xl bg-cream p-3 dark:bg-slate-800">1. Ôn chỉ định phục hình</div>
                <div className="rounded-2xl bg-cream p-3 dark:bg-slate-800">2. Làm một case study</div>
                <div className="rounded-2xl bg-cream p-3 dark:bg-slate-800">3. Tự kiểm tra bằng quiz</div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {metrics.map((metric) => (
            <Card key={metric.label}>
              <CardContent className="p-5">
                <div className="text-sm text-slate-500 dark:text-slate-400">{metric.label}</div>
                <div className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">{metric.value}</div>
                <div className="mt-1 text-xs text-slate-400">{metric.helper}</div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">Chọn case để bắt đầu</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <ScenarioCard
              href="/case/fracture"
              icon="🦷"
              title="Răng vỡ / Sâu nặng"
              description="Đánh giá khả năng phục hồi và lựa chọn loại phục hình tối ưu cho răng tổn thương lớn"
              tags={[
                "Composite · Inlay · Onlay",
                "Mão răng (toàn sứ / PFM / kim loại)",
                "Trụ nội + Core + Mão",
                "Tiên lượng và chỉ định nhổ",
              ]}
            />
            <ScenarioCard
              href="/case/missing"
              icon="🔬"
              title="Mất răng đơn lẻ"
              description="Phân tích chỉ định và lựa chọn phương pháp phục hình mất răng phù hợp nhất"
              tags={[
                "Implant nha khoa (tiêu chuẩn vàng)",
                "Cầu răng cố định (FPD)",
                "Hàm tháo lắp một phần (RPD)",
                "So sánh ưu / nhược điểm",
              ]}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run home tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/home/ScenarioCard.test.tsx src/app/page.test.tsx`

Expected: 2 test files passed, 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/app/page.test.tsx
git commit -m "feat(frontend): redesign home page as premium study dashboard"
```

---

### Task 6: Full verification

**Files:**
- No code changes expected unless verification fails.

- [ ] **Step 1: Run all relevant frontend tests**

Run: `cd frontend && npx vitest run`

Expected: all frontend test files pass with 0 failures.

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`

Expected: Next.js production build completes successfully.

- [ ] **Step 3: If build or tests fail, fix the smallest failing issue and rerun**

Use the exact failing file/error to fix only the broken code. Do not introduce new UI scope.

- [ ] **Step 4: Commit verification fixes if any**

If Step 3 changed files:

```bash
git add <changed-files>
git commit -m "fix(frontend): resolve premium redesign verification issues"
```

If Step 3 changed no files, do not create a commit.

---
