/* Chess — approved-domain-only Adsterra GET CODE, parser-time, menu-only.
 * Uses the shared Apps & Games advertising cookie, never analytics permission.
 * Original GET CODE is preserved; parser-time document.write awaits provider confirmation.
 * No auto-refresh, no gameplay placements, no requests on preview/local hosts.
 */
(() => {
  "use strict";
  if (location.hostname !== "chess.appsandgames.org") return;
  if (document.readyState !== "loading") return;
  if (!matchMedia("(min-width: 320px)").matches) return;
  const current = document.currentScript;
  const slot = current?.parentElement;
  if (!slot?.classList.contains("wc-chess-ad-unit")) return;
  if (!document.getElementById("wc-chess-intro")) return;
  const wide = matchMedia("(min-width: 1024px) and (min-height: 800px)").matches;
  const unit = current.dataset.unit;
  if ((wide && unit !== "desktop") || (!wide && unit !== "mobile")) return;
  let allowed = false;
  try {
    const part = document.cookie.split(";").map(s => s.trim())
      .find(s => s.startsWith("ag_privacy_choices_v1="));
    const data = part && JSON.parse(decodeURIComponent(part.slice("ag_privacy_choices_v1=".length)));
    const age = data && Date.now() - data.timestamp;
    allowed = !!data && data.version === 1 &&
      data.partnerRevision === "adsterra-2026-11" && data.advertising === true &&
      Number.isFinite(age) && age >= 0 && age <= 180 * 24 * 60 * 60 * 1000;
  } catch (_) { allowed = false; }
  if (!allowed) return;
  const snippets = {
    desktop: "<script>\n  atOptions = {\n    'key' : 'dc6aad2c9de3855a91e97b7edf378aef',\n    'format' : 'iframe',\n    'height' : 90,\n    'width' : 728,\n    'params' : {}\n  };\n</script>\n<script src=\"https://bauval.org/22/dc6aad2c9de3855a91e97b7edf378aef\"></script>",
    mobile: "<script>\n  atOptions = {\n    'key' : '00a25e04f3409afeafcd0756a0479d3c',\n    'format' : 'iframe',\n    'height' : 50,\n    'width' : 320,\n    'params' : {}\n  };\n</script>\n<script src=\"https://bauval.org/22/00a25e04f3409afeafcd0756a0479d3c\"></script>"
  };
  slot.hidden = false;
  const label = document.createElement("span");
  label.className = "wc-chess-ad-label";
  label.textContent = "Advertisement";
  slot.insertBefore(label, current);
  document.write(snippets[unit]);
})();
