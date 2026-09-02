"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "../divine/AuthShell";
import DivineInput from "../divine/DivineInput";
import DivineButton from "../divine/DivineButton";
import StatusBanner from "../divine/StatusBanner";
import PasswordStrengthMeter from "../divine/PasswordStrengthMeter";
import SuccessState, { CheckIcon } from "../divine/SuccessState";
import { LockIcon } from "../divine/icons";
import { EmblemLoader } from "../divine/EmblemLoader";
import { authApi, extractErrorMessage, unwrap, type ApiEnvelope } from "../../lib/api";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { newPasswordPairSchema } from "../../lib/validation";
import { checkPasswordStrength } from "../../lib/password";

type FormValues = { newPassword: string; confirmPassword: string };
type TokenInfo = { name: string; email: string; mobileNumber: string | null };

const SUCCESS_REDIRECT_DELAY_MS = 2200;

/**
 * Same shape as HEB's activation flow — reached from the "set your password"
 * email link, and doubles as the reset-password screen.
 *
 * `token` comes in as a prop rather than being read here: Next's dynamic
 * route params ([token]) are only available in the server page component,
 * which unwraps them and passes the plain string down to this client view.
 */
export default function SetPasswordView({ mode, token }: { mode: "activate" | "reset"; token: string }) {
  const router = useRouter();
  const [success, setSuccess] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [checkingToken, setCheckingToken] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const endpoint = mode === "activate" ? `/auth/activation/${token}` : `/auth/reset-password/${token}`;

    authApi
      .get<ApiEnvelope<TokenInfo>>(endpoint)
      .then((response) => {
        if (!cancelled) setTokenInfo(unwrap(response));
      })
      .catch((err) => {
        if (!cancelled) setTokenError(extractErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setCheckingToken(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, mode]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(newPasswordPairSchema) });

  const password = watch("newPassword") ?? "";
  const personalTerms = useMemo(
    () => [tokenInfo?.name, tokenInfo?.email, tokenInfo?.mobileNumber ?? undefined],
    [tokenInfo]
  );
  const strength = useMemo(() => checkPasswordStrength(password, personalTerms), [password, personalTerms]);

  const { run, submitting, error, setError } = useAsyncAction(async (values: FormValues) => {
    if (!strength.ok) {
      setError("Please meet all password requirements below before continuing.");
      return;
    }
    const endpoint = mode === "activate" ? "/auth/activate" : "/auth/reset-password";
    await authApi.post(endpoint, { token, ...values });
    setSuccess(true);
    setTimeout(() => router.push("/admin/login"), SUCCESS_REDIRECT_DELAY_MS);
  });

  const copy =
    mode === "activate"
      ? {
          eyebrow: "Welcome to the Temple",
          title: "Create Your Password",
          subtitle: tokenInfo ? `Namaste ${tokenInfo.name.split(" ")[0]} — set a password only you know.` : "This is your first step inside — set a password only you know.",
        }
      : {
          eyebrow: "Sri Siva Durga Temple",
          title: "Reset Your Password",
          subtitle: tokenInfo ? `Namaste ${tokenInfo.name.split(" ")[0]} — choose a new password to continue.` : "Choose a new password to continue your seva.",
        };

  return (
    <AuthShell eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle}>
      {checkingToken ? (
        <div className="flex justify-center py-6">
          <EmblemLoader size="sm" label="Checking link…" />
        </div>
      ) : tokenError ? (
        <div className="py-2 text-center">
          <StatusBanner tone="error">{tokenError}</StatusBanner>
          <Link href="/admin/login" className="text-[13px] text-[#e8590c] underline-offset-2 hover:underline">
            ← Back to sign in
          </Link>
        </div>
      ) : success ? (
        <SuccessState
          icon={<CheckIcon />}
          title="Password set successfully"
          subtitle="Taking you to sign in…"
        />
      ) : (
        <form onSubmit={handleSubmit(run)} noValidate>
          {error && <StatusBanner tone="error">{error}</StatusBanner>}

          <div className="space-y-5">
            <div>
              <DivineInput
                label="New password"
                type="password"
                revealable
                autoComplete="new-password"
                icon={<LockIcon />}
                error={errors.newPassword?.message}
                {...register("newPassword")}
              />
              <PasswordStrengthMeter check={strength} show={password.length > 0} />
            </div>

            <DivineInput
              label="Confirm new password"
              type="password"
              revealable
              autoComplete="new-password"
              icon={<LockIcon />}
              error={errors.confirmPassword?.message}
              {...register("confirmPassword")}
            />
          </div>

          <div className="mt-6">
            <DivineButton type="submit" variant="flame" loading={submitting}>
              {mode === "activate" ? "Set Password & Continue" : "Reset Password"}
            </DivineButton>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
