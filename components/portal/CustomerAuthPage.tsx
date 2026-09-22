"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DivineInput from "../divine/DivineInput";
import StatusBanner from "../divine/StatusBanner";
import { LockIcon, MailIcon, UserIcon } from "../divine/icons";
import { authApi, extractErrorMessage, unwrap, type ApiEnvelope } from "../../lib/api";
import { emailField, requiredPasswordField } from "../../lib/validation";
import { sanitizeMobileInput, isValidSgMobile, SG_MOBILE_ERROR } from "../../lib/mobileNumber";
import { useAuthStore, type SessionUser } from "../../lib/authStore";
import { USER_TYPES } from "../../lib/userTypes";

type Tab = "login" | "register";

const TABS: { key: Tab; label: string }[] = [
  { key: "login", label: "Login" },
  { key: "register", label: "Register" },
];

const COPY: Record<Tab, { title: string; subtitle: string }> = {
  login: { title: "Welcome back, devotee", subtitle: "Sign in to book poojas and manage your bookings." },
  register: { title: "Join our temple family", subtitle: "Create your devotee account in under a minute." },
};

/** Only ever send someone back to a page inside the portal — never an off-site or protocol-relative URL. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/customer") && !next.startsWith("//") ? next : "/customer";
}

const loginSchema = z.object({ email: emailField, password: requiredPasswordField });
const registerSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(100),
  email: emailField,
  mobileNumber: z.string().trim().refine((v) => isValidSgMobile(v), SG_MOBILE_ERROR),
});
type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

// Frosted fields for the glass card (the `!` beats DivineInput's own solid white).
const GLASS_FIELD = "!bg-white/55 !border-white/80 backdrop-blur-md";

const submitClass =
  "relative w-full overflow-hidden rounded-xl bg-gradient-to-b from-[#9b1c33] to-maroon py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_28px_-12px_rgba(124,21,39,0.95),inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_32px_-12px_rgba(124,21,39,1),inset_0_1px_0_rgba(255,255,255,0.3)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70";

export default function CustomerAuthPage({ initialTab, next, logo }: { initialTab: Tab; next?: string; logo?: string }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>(initialTab);
  // +1 when moving to the right-hand tab, -1 back — drives the slide direction.
  const [direction, setDirection] = useState(1);
  const target = safeNext(next);

  // Already signed in as a devotee — nothing to do here.
  useEffect(() => {
    if (user?.userType === USER_TYPES.CUSTOMER) router.replace(target);
  }, [user, router, target]);

  function switchTab(nextTab: Tab) {
    if (nextTab === tab) return;
    setDirection(nextTab === "register" ? 1 : -1);
    setTab(nextTab);
    // Keep the URL shareable/bookmarkable without adding history entries.
    window.history.replaceState(null, "", nextTab === "register" ? "?tab=register" : window.location.pathname);
  }

  return (
    <div className="relative isolate flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#fff6e0] via-[#fde9c4] to-[#f8d3ad] px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
      {/* A plain, warm backdrop — just two soft colour washes so the glass card
          has something gentle to frost over. */}
      <div className="pointer-events-none absolute -left-32 -top-32 -z-10 h-[28rem] w-[28rem] rounded-full bg-gold-400/35 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 -z-10 h-[30rem] w-[30rem] rounded-full bg-crimson-500/20 blur-3xl" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[440px]"
      >
        {/* Breathing golden halo behind the card — pointer-events-none is load-bearing here:
            its -inset-1.5 is sized against this whole wrapper (card + the "Back to the temple
            website" link below it), so without it the halo silently swallows clicks on that link. */}
        <div className="pointer-events-none animate-soft-pulse absolute -inset-1.5 rounded-[30px] bg-gradient-to-br from-gold-300/50 via-flame-400/25 to-gold-500/40 blur-lg" aria-hidden="true" />

        {/* Frosted glass: heavy blur + a little saturation lifts the painting's
            colours through the card; the diagonal sheen and bright hairline
            border give it an edge. */}
        <div className="relative overflow-hidden rounded-[26px] border border-white/60 bg-white/25 p-6 shadow-[0_30px_70px_-24px_rgba(42,20,8,0.55),inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-1px_0_rgba(255,255,255,0.25)] backdrop-blur-2xl backdrop-saturate-150 sm:p-8">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-white/45 via-white/5 to-white/20" aria-hidden="true" />
          {/* corner filigree */}
          <span className="pointer-events-none absolute left-3 top-3 h-6 w-6 rounded-tl-xl border-l-2 border-t-2 border-gold-500/70" aria-hidden="true" />
          <span className="pointer-events-none absolute right-3 top-3 h-6 w-6 rounded-tr-xl border-r-2 border-t-2 border-gold-500/70" aria-hidden="true" />

          <div className="flex flex-col items-center text-center">
            <motion.img
              initial={{ opacity: 0, scale: 0.8, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              src={logo || "/SSD_Full_Logo-Transparant.webp"}
              alt="Sri Siva Durga Temple"
              className="h-[84px] w-auto object-contain drop-shadow-[0_6px_14px_rgba(255,255,255,0.7)]"
            />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
              >
                <h1 className="mt-1 font-portal text-[30px] font-bold leading-tight text-maroon">{COPY[tab].title}</h1>
                <p className="mt-1 text-[13px] font-medium text-ink-300">{COPY[tab].subtitle}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Tab switcher — the pill glides between the two options. */}
          <div role="tablist" aria-label="Sign in or create an account" className="relative mt-6 grid grid-cols-2 rounded-xl border border-white/50 bg-white/30 p-1 shadow-inner backdrop-blur-md">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  id={`auth-tab-${t.key}`}
                  aria-selected={active}
                  aria-controls={`auth-panel-${t.key}`}
                  onClick={() => switchTab(t.key)}
                  className={`relative z-10 rounded-lg py-2.5 text-[14px] font-semibold transition-colors ${active ? "text-white" : "text-ink-300 hover:text-maroon"}`}
                >
                  {active && (
                    <motion.span
                      layoutId="auth-tab-pill"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-b from-[#9b1c33] to-maroon shadow-[0_8px_16px_-6px_rgba(124,21,39,0.7),inset_0_1px_0_rgba(255,255,255,0.25)]"
                    />
                  )}
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="relative mt-6">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={tab}
                role="tabpanel"
                id={`auth-panel-${tab}`}
                aria-labelledby={`auth-tab-${tab}`}
                custom={direction}
                variants={{
                  enter: (d: number) => ({ opacity: 0, x: 28 * d }),
                  center: { opacity: 1, x: 0 },
                  exit: (d: number) => ({ opacity: 0, x: -28 * d }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.26, ease: "easeOut" }}
              >
                {tab === "login" ? <LoginForm target={target} onSwitch={() => switchTab("register")} /> : <RegisterForm onSwitch={() => switchTab("login")} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-5 text-center text-[13px] font-medium text-maroon">
          <Link href="/customer" className="underline-offset-4 hover:underline">
            ← Back to the temple website
          </Link>
        </motion.p>
      </motion.div>
    </div>
  );
}

function LoginForm({ target, onSwitch }: { target: string; onSwitch: () => void }) {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await authApi.post<ApiEnvelope<{ token: string; user: SessionUser }>>("/auth/login", values);
      const { token, user } = unwrap(res);
      // Staff accounts share this login API but have their own screens — don't
      // let a staff sign-in here overwrite an Admin/POS session in this browser.
      if (user.userType !== USER_TYPES.CUSTOMER) {
        setError("This sign-in is for devotees. Temple staff, please use the Admin Panel.");
        return;
      }
      setSession(token, user);
      router.replace(target);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      {error && <StatusBanner tone="error">{error}</StatusBanner>}
      <div className="space-y-5">
        <DivineInput containerClassName={GLASS_FIELD} label="Email address" type="email" autoComplete="email" icon={<MailIcon />} error={errors.email?.message} {...register("email")} />
        <DivineInput containerClassName={GLASS_FIELD} label="Password" type="password" revealable autoComplete="current-password" icon={<LockIcon />} error={errors.password?.message} {...register("password")} />
      </div>
      <div className="mt-3 text-right">
        <Link href="/customer/forgot-password" className="text-[12.5px] font-medium text-[#e8590c] underline-offset-2 hover:underline">
          Forgot password?
        </Link>
      </div>
      <button type="submit" disabled={isSubmitting} className={`${submitClass} mt-5`}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
      <p className="mt-5 text-center text-[13px] font-medium text-ink-300">
        New devotee?{" "}
        <button type="button" onClick={onSwitch} className="font-semibold text-maroon underline-offset-2 hover:underline">
          Create an account
        </button>
      </p>
    </form>
  );
}

function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await authApi.post<ApiEnvelope<unknown>>("/auth/register", values);
      setDone(res.data.message);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  });

  if (done) {
    return (
      <div className="py-2 text-center" role="status">
        <motion.svg
          viewBox="0 0 52 52"
          className="mx-auto h-16 w-16"
          initial="hidden"
          animate="visible"
          aria-hidden="true"
        >
          <motion.circle
            cx="26"
            cy="26"
            r="23"
            fill="none"
            stroke="#16a34a"
            strokeWidth="3"
            variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
            transition={{ duration: 0.6 }}
          />
          <motion.path
            d="m15 27 8 8 15-16"
            fill="none"
            stroke="#16a34a"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
            transition={{ duration: 0.45, delay: 0.5 }}
          />
        </motion.svg>
        <h2 className="mt-3 font-portal text-[24px] font-bold text-maroon">Registration received</h2>
        <p className="mx-auto mt-1.5 max-w-xs text-[13.5px] text-ink-500">{done}</p>
        <button type="button" onClick={onSwitch} className={`${submitClass} mt-6`}>
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && <StatusBanner tone="error">{error}</StatusBanner>}
      <div className="space-y-5">
        <DivineInput containerClassName={GLASS_FIELD} label="Full name" autoComplete="name" icon={<UserIcon />} error={errors.name?.message} {...register("name")} />
        <DivineInput containerClassName={GLASS_FIELD} label="Email address" type="email" autoComplete="email" icon={<MailIcon />} error={errors.email?.message} {...register("email")} />
        <DivineInput
          containerClassName={GLASS_FIELD}
          label="Mobile number"
          type="tel"
          autoComplete="tel"
          icon={<span className="text-[13.5px] font-semibold text-ink-500">+65</span>}
          error={errors.mobileNumber?.message}
          {...register("mobileNumber", { onChange: (e) => { e.target.value = sanitizeMobileInput(e.target.value); } })}
        />
      </div>
      <p className="mt-3 text-[12px] font-medium text-ink-300">We&apos;ll email you a link to set your password and activate your account.</p>
      <button type="submit" disabled={isSubmitting} className={`${submitClass} mt-5`}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </button>
      <p className="mt-5 text-center text-[13px] font-medium text-ink-300">
        Already registered?{" "}
        <button type="button" onClick={onSwitch} className="font-semibold text-maroon underline-offset-2 hover:underline">
          Sign in
        </button>
      </p>
    </form>
  );
}
