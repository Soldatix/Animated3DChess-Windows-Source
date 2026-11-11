// Pure, local check notification state machine: no chess legality is changed here.
// Visible toast only on entering a new check; ring remains until check is resolved.
export function createCheckAlertController({ onToast, onKingRing, getMessage, schedule = setTimeout, cancel = clearTimeout }) {
  let lastCheckedColor = null;
  let toastVisible = false;
  let timeout = null;
  let revision = 0;

  function dismiss() {
    revision += 1;
    if (timeout !== null) { cancel(timeout); timeout = null; }
    toastVisible = false;
    onToast('', false);
  }

  function reset() {
    dismiss();
    lastCheckedColor = null;
    onKingRing(null);
  }

  function update({ color, inCheck, gameOver }) {
    const checkedColor = inCheck && !gameOver ? color : null;
    onKingRing(checkedColor);
    if (!checkedColor) {
      if (lastCheckedColor !== null || toastVisible) reset();
      return;
    }
    if (lastCheckedColor !== checkedColor) {
      dismiss();
      lastCheckedColor = checkedColor;
      toastVisible = true;
      onToast(getMessage(), true);
      const token = revision;
      timeout = schedule(() => {
        if (token !== revision) return;
        timeout = null;
        toastVisible = false;
        onToast('', false);
      }, 3000);
    } else if (toastVisible) {
      // Language changes translate an already visible toast without extending it.
      onToast(getMessage(), true);
    }
  }

  return { update, reset };
}
