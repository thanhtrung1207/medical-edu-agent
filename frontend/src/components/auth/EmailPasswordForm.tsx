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
