"use client";

import DivineListbox from "./DivineListbox";
import { FORM_MUTED } from "./formFieldStyles";

type DivineStatusSelectProps = {
  label?: string;
  /** 1 = active, 0 = inactive — matches the `status` field convention used across every master form. */
  value: number;
  onChange: (value: number) => void | Promise<void>;
  onLabel?: string;
  offLabel?: string;
  className?: string;
  disabled?: boolean;
  /** Peach-border field without a floating label — for table list rows. */
  compact?: boolean;
};

function StatusDot({ active, size = "md" }: { active: boolean; size?: "sm" | "md" }) {
  const dim = size === "md" ? "h-2.5 w-2.5" : "h-2 w-2";
  return (
    <span
      className={`${dim} shrink-0 rounded-full ring-2 ring-white ${active ? "bg-emerald-500" : "bg-crimson-500"}`}
      aria-hidden
    />
  );
}

const STATUS_OPTIONS = (onLabel: string, offLabel: string) => [
  { value: "1", label: onLabel },
  { value: "0", label: offLabel },
];

/**
 * Active/Inactive select with a green/red dot in the closed field and in
 * each menu row, so the current status is visible without opening.
 */
export default function DivineStatusSelect({
  label = "Status",
  value,
  onChange,
  onLabel = "Active",
  offLabel = "Inactive",
  className,
  disabled,
  compact = false,
}: DivineStatusSelectProps) {
  return (
    <DivineListbox
      label={compact ? undefined : label}
      formChrome={compact}
      clearable={false}
      disabled={disabled}
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
      options={STATUS_OPTIONS(onLabel, offLabel)}
      className={className}
      renderValue={(opt) => {
        const active = (opt?.value ?? String(value)) === "1";
        return (
          <>
            <StatusDot active={active} />
            <span className={`min-w-0 truncate font-body text-[14px] leading-5 ${opt ? "text-ink-100" : FORM_MUTED}`}>
              {opt?.label ?? (value === 1 ? onLabel : offLabel)}
            </span>
          </>
        );
      }}
      renderOption={(opt) => (
        <span className="flex min-w-0 items-center gap-2">
          <StatusDot active={opt.value === "1"} size="sm" />
          <span className="truncate">{opt.label}</span>
        </span>
      )}
    />
  );
}
