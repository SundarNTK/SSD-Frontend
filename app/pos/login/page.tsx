"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import AuthShell from "../../../components/divine/AuthShell";
import DivineInput from "../../../components/divine/DivineInput";
import DivineButton from "../../../components/divine/DivineButton";
import StatusBanner from "../../../components/divine/StatusBanner";
import { LockIcon, MailIcon } from "../../../components/divine/icons";
import { authApi, unwrap, type ApiEnvelope } from "../../../lib/api";
import { useAsyncAction } from "../../../lib/useAsyncAction";
import { emailField, requiredPasswordField } from "../../../lib/validation";
import { useAuthStore, takeSessionEndReason, type SessionUser } from "../../../lib/authStore";
import { isAdminPanelType, USER_TYPES } from "../../../lib/userTypes";

const schema = z.object({
  email: emailField,
  password: requiredPasswordField,
});

type FormValues = z.infer<typeof schema>;

/**
 * Dedicated sign-in for the POS counter terminal — deliberately separate
 * from /admin/login even though both hit the same POST /auth/login.
 * Two extra gates beyond a valid password: the account has to be an
 * admin-panel user type (Customers are refused, same as the admin login),
 * AND it has to carry posAccess — a per-user flag set on the User Master,
 * independent of role permissions, for "is this person allowed to actually
 * work the counter." A login that fails either check never reaches /pos:
 * the session is torn down immediately rather than left sitting around for
 * someone to retry navigating past the guard.
 */
export default function PosLoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const reason = takeSessionEndReason();
    if (!reason) return;
    setNotice(
      reason === "expired"
        ? "Your session ended. This happens when it expires, or when an administrator changes your access. Please sign in again."
        : "You've been signed out."
    );
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const { run, submitting, error } = useAsyncAction(async (values: FormValues) => {
    const response = await authApi.post<ApiEnvelope<{ token: string; user: SessionUser }>>("/auth/login", values);
    const { token, user } = unwrap(response);

    // Neither check calls setSession — a refused login never touches
    // localStorage, so there's nothing to unwind and no reload needed to
    // show the error on this same screen. System Admin bypasses the
    // posAccess check the same way it bypasses every other permission in
    // this app — it's never gated by a per-user flag.
    if (!isAdminPanelType(user.userType)) {
      throw new Error("This account doesn't have POS access.");
    }
    if (user.userType !== USER_TYPES.SUPER_ADMIN && !user.posAccess) {
      throw new Error("This account doesn't have POS access. Contact your administrator to enable it.");
    }

    setNotice(null);
    setSession(token, user);
    router.replace("/pos");
  });

  return (
    <AuthShell
      eyebrow="Sri Siva Durga Temple"
      title="POS Counter"
      subtitle="Sign in to open the counter terminal."
      variant="marigold"
    >
      <form onSubmit={handleSubmit(run)} noValidate>
        {error ? (
          <StatusBanner tone="error">{error}</StatusBanner>
        ) : notice ? (
          <StatusBanner tone="success">{notice}</StatusBanner>
        ) : null}

        <div className="space-y-5">
          <DivineInput
            label="Email address"
            type="email"
            autoComplete="email"
            icon={<MailIcon />}
            error={errors.email?.message}
            {...register("email")}
          />

          <DivineInput
            label="Password"
            type="password"
            revealable
            autoComplete="current-password"
            icon={<LockIcon />}
            error={errors.password?.message}
            {...register("password")}
          />
        </div>

        <div className="mt-8">
          <DivineButton type="submit" variant="marigold" loading={submitting}>
            Open Counter
          </DivineButton>
        </div>
      </form>
    </AuthShell>
  );
}
