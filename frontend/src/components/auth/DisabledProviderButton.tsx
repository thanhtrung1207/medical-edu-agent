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
