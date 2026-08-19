import SetPasswordView from "../../../../../components/admin/SetPasswordView";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SetPasswordView mode="reset" token={token} />;
}
