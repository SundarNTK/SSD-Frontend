import ManageHallBookingPage from "../../../../../../components/admin/hall-meal/ManageHallBookingPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ManageHallBookingPage bookingId={id} />;
}
