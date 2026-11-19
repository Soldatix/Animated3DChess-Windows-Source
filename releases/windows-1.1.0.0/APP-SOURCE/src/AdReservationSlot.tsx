// P3-C9A: visual reservation only; never loads an ad SDK or third-party script.
// Disabled by default for Web, PWA and Windows; preview is opt-in per build.
import './adReservationSlot.css';

const PREVIEW = import.meta.env.VITE_CHESS_AD_SLOT_PREVIEW === '1';

export function AdReservationSlot() {
  if (!PREVIEW) return null;
  return (
    <aside className="wc-ad-reservation" role="note" aria-label="Future advertisement placement">
      <span className="wc-ad-reservation-label">Ad placement preview — no advertising</span>
      <span className="wc-ad-reservation-size wc-ad-reservation-desktop">728 × 90</span>
      <span className="wc-ad-reservation-size wc-ad-reservation-mobile">320 × 50</span>
    </aside>
  );
}
