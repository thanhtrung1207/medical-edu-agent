export function EmailPasswordForm() {
  return (
    <form className="w-full" onSubmit={(event) => event.preventDefault()}>
      {/* disabled repeated per-control: jsdom doesn't propagate fieldset[disabled] to descendants (real browsers do) */}
      <fieldset disabled className="flex flex-col gap-2">
        <input
          type="email"
          placeholder="Email"
          aria-label="Email"
          disabled
          className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
        <input
          type="password"
          placeholder="Mật khẩu"
          aria-label="Mật khẩu"
          disabled
          className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
        <button
          type="submit"
          disabled
          title="Chức năng đăng nhập bằng email đang được phát triển"
          className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-slate-200 px-3 text-sm font-medium text-slate-400 dark:bg-slate-700 dark:text-slate-500"
        >
          Đăng nhập
        </button>
      </fieldset>
    </form>
  );
}
