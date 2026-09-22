import SetPasswordView from "../../../../components/admin/SetPasswordView";

export default async function CustomerResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SetPasswordView mode="reset" token={token} loginHref="/customer/login" backdrop="divine" />;
}
