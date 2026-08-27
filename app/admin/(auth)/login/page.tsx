"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "../../../../components/divine/AuthShell";
import DivineInput from "../../../../components/divine/DivineInput";
import DivineButton from "../../../../components/divine/DivineButton";
import StatusBanner from "../../../../components/divine/StatusBanner";
import { LockIcon, MailIcon } from "../../../../components/divine/icons";
import { authApi, unwrap, type ApiEnvelope } from "../../../../lib/api";
import { useAsyncAction } from "../../../../lib/useAsyncAction";
import { emailField, requiredPasswordField } from "../../../../lib/validation";
import { useAuthStore, takeSessionEndReason, type SessionUser } from "../../../../lib/authStore";
import { isAdminPanelType } from "../../../../lib/userTypes";

const schema = z.object({
  email: emailField,
  password: requiredPasswordField,
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
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

    if (!isAdminPanelType(user.userType)) {
      throw new Error("This account doesn't have Admin Panel access.");
    }

    setNotice(null);
    setSession(token, user);
    router.replace("/admin/dashboard");
  });

  return (
    <AuthShell
      eyebrow="Sri Siva Durga Temple"
      title="Admin Panel"
      subtitle="Enter with devotion — sign in to continue your seva."
      footer={
        <p>
          Trouble signing in?{" "}
          <Link href="/admin/forgot-password" className="text-[#e8590c] underline-offset-2 hover:underline">
            Reset your password
          </Link>
        </p>
      }
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

        <div className="mt-6">
          <DivineButton type="submit" variant="flame" loading={submitting}>
            Enter the Panel
          </DivineButton>
        </div>
      </form>
    </AuthShell>
  );
}
