export default function VisibilityPills({
  pos,
  portal,
  adminBooking,
}: {
  pos?: boolean;
  portal?: boolean;
  adminBooking?: boolean;
}) {
  const showPos = pos !== false;
  const showPortal = portal !== false;
  // Unlike pos/portal, this pill only applies to masters that actually carry
  // adminBookingVisibility (Category/SubCategory/Item/Service/GeneralItem) —
  // a caller that never passes this prop (e.g. PaymentModePage, which has no
  // such concept) gets no pill at all, rather than one that's always "on".
  const showAdminBooking = adminBooking !== undefined && adminBooking !== false;
  if (!showPos && !showPortal && !showAdminBooking) {
    return <span className="text-ink-500">Hidden</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {showPos && (
        <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11.5px] font-medium text-amber-800">
          Temple POS
        </span>
      )}
      {showPortal && (
        <span className="inline-flex items-center rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11.5px] font-medium text-sky-800">
          Customer POS
        </span>
      )}
      {showAdminBooking && (
        <span className="inline-flex items-center rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11.5px] font-medium text-violet-800">
          Admin Booking
        </span>
      )}
    </span>
  );
}
