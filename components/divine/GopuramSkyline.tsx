/** A faint tiered-tower silhouette along the bottom edge — suggests the gopuram without being literal. */
export default function GopuramSkyline() {
  const tower = (x: number, w: number, h: number, tiers: number) => {
    const parts: string[] = [];
    const tierH = h / tiers;
    for (let i = 0; i < tiers; i++) {
      const shrink = (i / tiers) * 0.7;
      const tw = w * (1 - shrink);
      const tx = x + (w - tw) / 2;
      const ty = h - tierH * (i + 1);
      parts.push(`M${tx} ${h} L${tx} ${ty} L${tx + tw} ${ty} L${tx + tw} ${h} Z`);
    }
    const tipW = w * 0.12;
    parts.push(`M${x + w / 2 - tipW / 2} ${h - tierH * tiers} L${x + w / 2} ${h - tierH * tiers - h * 0.12} L${x + w / 2 + tipW / 2} ${h - tierH * tiers} Z`);
    return parts.join(" ");
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[26vh] overflow-hidden" aria-hidden="true">
      <svg viewBox="0 0 1200 220" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="skyline-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8590c" stopOpacity="0" />
            <stop offset="100%" stopColor="#c0341f" stopOpacity="1" />
          </linearGradient>
          {/* light-catches-the-top, shadow-pools-at-the-base — now a vivid
              gold-to-crimson read (was pale gold-to-bronze) to match the
              saturated sunset backdrop instead of a pale cream page. */}
          <linearGradient id="towerGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe9a8" />
            <stop offset="40%" stopColor="#ff9d42" />
            <stop offset="75%" stopColor="#e8590c" />
            <stop offset="100%" stopColor="#8f1c30" />
          </linearGradient>
        </defs>
        <path d={tower(40, 140, 190, 5)} fill="url(#towerGold)" stroke="#8f1c30" strokeWidth="0.75" strokeOpacity="0.6" opacity="0.92" />
        <path d={tower(210, 90, 130, 4)} fill="url(#towerGold)" stroke="#8f1c30" strokeWidth="0.75" strokeOpacity="0.6" opacity="0.85" />
        <path d={tower(330, 60, 90, 3)} fill="url(#towerGold)" stroke="#8f1c30" strokeWidth="0.75" strokeOpacity="0.6" opacity="0.75" />
        <path d={tower(520, 180, 220, 6)} fill="url(#towerGold)" stroke="#8f1c30" strokeWidth="0.9" strokeOpacity="0.65" opacity="1" />
        <path d={tower(740, 60, 90, 3)} fill="url(#towerGold)" stroke="#8f1c30" strokeWidth="0.75" strokeOpacity="0.6" opacity="0.75" />
        <path d={tower(830, 90, 130, 4)} fill="url(#towerGold)" stroke="#8f1c30" strokeWidth="0.75" strokeOpacity="0.6" opacity="0.85" />
        <path d={tower(980, 140, 190, 5)} fill="url(#towerGold)" stroke="#8f1c30" strokeWidth="0.75" strokeOpacity="0.6" opacity="0.92" />
        <rect x="0" y="0" width="1200" height="220" fill="url(#skyline-fade)" />
      </svg>
    </div>
  );
}
