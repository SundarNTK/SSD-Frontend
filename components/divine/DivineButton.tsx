import type { ButtonHTMLAttributes } from "react";

type DivineButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: "primary" | "ghost";
};

/**
 * The gold ceremonial button — no shadow at rest; hovering raises it with a
 * symmetric, all-sides glow (box-shadow with a 0,0 offset, not a directional
 * drop shadow) plus a shimmer sweep. Spinner while a request is in flight.
 */
export default function DivineButton({
  loading,
  variant = "primary",
  children,
  className = "",
  disabled,
  ...rest
}: DivineButtonProps) {
  if (variant === "ghost") {
    return (
      <button
        className={`relative w-full rounded-xl border border-gold-500/30 bg-transparent px-5 py-3 font-accent text-sm tracking-wide text-amber-600 transition-[color,border-color,background-color,box-shadow] duration-300 hover:border-gold-400/60 hover:bg-gold-500/5 hover:shadow-[0_0_20px_-4px_rgba(212,175,55,0.55)] disabled:opacity-50 disabled:hover:shadow-none ${className}`}
        disabled={disabled || loading}
        {...rest}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      className={`group relative w-full overflow-hidden rounded-xl bg-gradient-to-b from-gold-300 via-gold-500 to-gold-600 px-5 py-3 font-accent text-[15px] font-semibold tracking-wide text-navy-950 transition-[transform,box-shadow] duration-200 hover:scale-[1.015] hover:shadow-[0_0_22px_2px_rgba(212,175,55,0.75)] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        {loading && (
          <svg className="h-4 w-4 animate-spin text-navy-950" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
            />
          </svg>
        )}
        {children}
      </span>
      {!disabled && !loading && (
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-0 animate-[shimmer-sweep_2.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 group-hover:opacity-100"
        />
      )}
    </button>
  );
}
