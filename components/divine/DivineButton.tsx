import type { ButtonHTMLAttributes } from "react";

type DivineButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: "primary" | "ghost";
  /**
   * Full-bleed by default — right for a standalone page CTA (Sign In,
   * Reset Password). A Cancel/Save pair inside a modal footer is a
   * different shape entirely: two buttons stretching to fill a row each
   * reads as oversized and, worse, as *equally weighted* actions when one
   * of them is destructive or primary and the other isn't. Pass `false`
   * there for an intrinsically-sized button the footer can right-align.
   */
  fullWidth?: boolean;
};

/**
 * The gold ceremonial button — no shadow at rest; hovering raises it with a
 * symmetric, all-sides glow (box-shadow with a 0,0 offset, not a directional
 * drop shadow) plus a shimmer sweep. Spinner while a request is in flight.
 */
export default function DivineButton({
  loading,
  variant = "primary",
  fullWidth = true,
  children,
  className = "",
  disabled,
  ...rest
}: DivineButtonProps) {
  // Standalone page CTAs (Sign In, Reset Password) keep their original
  // roomier size; a modal footer's Cancel/Save pair gets a visibly smaller
  // button to match — that size difference is what makes fullWidth read as
  // "the one big action on this screen" versus "one of two footer controls".
  const sizing = fullWidth ? "px-5 py-3 text-[15px]" : "px-4 py-2 text-[13.5px]";

  if (variant === "ghost") {
    return (
      <button
        className={`relative ${fullWidth ? "w-full" : "w-auto"} rounded-xl border border-gold-500/30 bg-transparent ${sizing} font-accent tracking-wide text-amber-600 transition-[color,border-color,background-color,box-shadow] duration-300 hover:border-gold-400/60 hover:bg-gold-500/5 hover:shadow-[0_0_20px_-4px_rgba(212,175,55,0.55)] disabled:opacity-50 disabled:hover:shadow-none ${className}`}
        disabled={disabled || loading}
        {...rest}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      className={`group relative ${fullWidth ? "w-full" : "w-auto"} overflow-hidden rounded-xl border border-gold-600/25 bg-gradient-to-b from-gold-300 via-gold-500 to-gold-600 ${sizing} font-accent font-semibold tracking-wide text-navy-950 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.08)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-6px_rgba(184,137,42,0.55)] active:translate-y-0 active:shadow-[0_2px_6px_-1px_rgba(0,0,0,0.08)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-[0_2px_6px_-1px_rgba(0,0,0,0.08)] ${className}`}
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
