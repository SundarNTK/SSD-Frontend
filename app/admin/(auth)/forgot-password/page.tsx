"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import AuthShell from "../../../../components/divine/AuthShell";
import DivineInput from "../../../../components/divine/DivineInput";
import DivineButton from "../../../../components/divine/DivineButton";
import StatusBanner from "../../../../components/divine/StatusBanner";
import SuccessState from "../../../../components/divine/SuccessState";
import { MailIcon } from "../../../../components/divine/icons";
import { authApi } from "../../../../lib/api";
import { useAsyncAction } from "../../../../lib/useAsyncAction";
import { identifierField } from "../../../../lib/validation";

const schema = z.object({ identifier: identifierField });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const { run, submitting, error } = useAsyncAction(async (values: FormValues) => {
    await authApi.post("/auth/forgot-password", values);
    setSent(true);
  });

  return (
    <AuthShell
      eyebrow="Sri Siva Durga Temple"
      title="Forgot Your Password?"
      subtitle="Enter your registered email or mobile number and we'll email you a reset link."
      footer={
        <Link href="/admin/login" className="text-amber-600 underline-offset-2 hover:underline">
          ← Back to sign in
        </Link>
      }
    >
      {sent ? (
        <SuccessState
          icon={<MailIcon />}
          title="Check your email"
          subtitle="If that account exists, a reset link is on its way to the registered email address."
        />
      ) : (
        <form onSubmit={handleSubmit(run)} noValidate>
          {error && <StatusBanner tone="error">{error}</StatusBanner>}
          <DivineInput
            label="Email or mobile number"
            autoComplete="email"
            icon={<MailIcon />}
            error={errors.identifier?.message}
            {...register("identifier")}
          />
          <div className="mt-8">
            <DivineButton type="submit" loading={submitting}>
              Send Reset Link
            </DivineButton>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
