export default function VisibilityPills({ pos, portal }: { pos?: boolean; portal?: boolean }) {
  const showPos = pos !== false;
  const showPortal = portal !== false;
  if (!showPos && !showPortal) {
    return <span className="text-ink-500">Hidden</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {showPos && (
        <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11.5px] font-medium text-amber-800">
          POS
        </span>
      )}
      {showPortal && (
        <span className="inline-flex items-center rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11.5px] font-medium text-sky-800">
          Portal
        </span>
      )}
    </span>
  );
}
