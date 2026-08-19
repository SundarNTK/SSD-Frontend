import { z } from "zod";

/**
 * Shared zod building blocks — every form on this project reaches for
 * "an email field", "a password-confirmation pair", etc. Define the rule
 * once here and compose it into each page's schema, instead of retyping
 * the same `.min().email()` chain on every form.
 */

export const emailField = z
  .string()
  .min(1, "Email is required")
  .pipe(z.email("Enter a valid email address"));

export const identifierField = z.string().min(3, "Enter your registered email or mobile number");

export const requiredPasswordField = z.string().min(1, "Password is required");

/** Attach to any schema with `newPassword`/`confirmPassword` fields to enforce they match. */
export function withMatchingPasswords<
  T extends z.ZodObject<{ newPassword: z.ZodString; confirmPassword: z.ZodString }>
>(schema: T) {
  return schema.refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
}

export const newPasswordPairSchema = withMatchingPasswords(
  z.object({
    newPassword: requiredPasswordField,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
);
