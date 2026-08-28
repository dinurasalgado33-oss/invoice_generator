// Demo mode — the app with no backend behind it.
//
// The manager needs to open a link and use the whole system: check a
// guest in, raise a bill, print a card. Handing him a Firebase account
// to do that is a barrier for no benefit — he is testing whether the
// screens make sense, not whether the database holds.
//
// So on GitHub Pages the app runs exactly as it did before there was a
// backend: no sign-in, and every write goes to the in-memory store that
// store.js already falls back to. Nothing reaches Firestore, because
// nothing ever connects to it.
//
// Chosen by hostname, like the project config, rather than a flag
// somebody has to remember to unset. The dangerous mistake would be real
// guest data going into a throwaway demo, and hostname makes that
// impossible: the live app is never served from github.io.

const DEMO_HOSTS = [".github.io"];

export function isDemoMode() {
  if (typeof location === "undefined") return false;
  // An explicit ?demo=1 for trying it locally, without having to deploy
  // to Pages just to see what the manager will see.
  const params = new URLSearchParams(location.search || "");
  if (params.get("demo") === "1") return true;
  return DEMO_HOSTS.some(suffix => location.hostname.endsWith(suffix));
}

// Says so on screen, permanently. A demo that looks identical to the real
// thing is how somebody ends up checking a real guest into a browser tab
// and wondering where the booking went.
export function showDemoBanner() {
  if (document.getElementById("demo-banner")) return;
  const bar = document.createElement("div");
  bar.id = "demo-banner";
  bar.className = "demo-banner";
  bar.textContent = "Demo — nothing is saved. Refreshing clears everything.";
  document.body.appendChild(bar);
  document.body.classList.add("has-demo-banner");
}
