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
