import SetPasswordView from "../../../../components/admin/SetPasswordView";

export default async function CustomerActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SetPasswordView mode="activate" token={token} loginHref="/customer/login" backdrop="divine" />;
}
