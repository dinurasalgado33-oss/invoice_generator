import { appState } from "./state.js";
import { escapeHtml, showToast } from "./utils.js";
import { logError } from "./data/error-log.js";
import { MENU_ITEMS } from "./data/menu.js";
import { MENU_DOCS, openMenuPdf, downloadMenuPdf, buildMenuPdf } from "./menu-pdf.js";
import { publishMenuPdf, publishedMenuUrl, publishManifest } from "./data/menu-hosting.js";
import { BRANCH_INFO } from "./data/branches.js";

// The Menu PDFs panel on the Menu Config screen. Two menus per property,
// matching the printed booklets, each with a link that opens the PDF and a
// button that saves it. Both are built at the moment they are pressed, so
// they always carry the menu as it stands rather than a stale export.

function docsForBranch(branch) {
  return Object.entries(MENU_DOCS).filter(([, d]) => d.branch === branch);
}

function countFor(doc) {
  return MENU_ITEMS.filter(d =>
    d.branch === doc.branch &&
    (doc.only ? doc.only.includes(d.category) : true) &&
    (doc.exclude ? !doc.exclude.includes(d.category) : true)
  ).length;
}

async function withBusy(btn, label, fn) {
  if (!btn) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    await fn();
  } catch (err) {
    console.error("Menu PDF failed:", err);
    showToast(err.message || "Couldn't build the menu PDF");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// Shows the public address, and offers to copy it — a QR code is
// generated from this string, and retyping a Firebase download URL by
// hand is not something anybody should be asked to do.
function showLink(key, url) {
  const el = document.querySelector(`.menu-pdf-link[data-link="${key}"]`);
  if (!el) return;
  // One button, not a blue link beside a button doing half the job each.
  // "Copy link" says what it does; "Guest link" named a thing without
  // saying what pressing it was for.
  el.innerHTML = `<button type="button" class="menu-pdf-copy">Copy link</button>`;
  const copy = el.querySelector(".menu-pdf-copy");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
    } catch {
      // Clipboard access is refused often enough on mobile browsers that
      // failing silently would look like a dead button. There is no longer
      // a link to press and hold, so open it instead — the address bar is
      // then somewhere the address can be copied from by hand.
      window.open(url, "_blank", "noopener");
      showToast("Couldn't copy — opened it instead, copy from the address bar");
    }
  });
}

// Publishes one menu and refreshes the public index.
//
// The index is rewritten every time rather than patched, because it is
// small and because a half-updated list is worse than a rebuilt one — a
// guest seeing a menu that no longer exists is a worse failure than a
// second of extra upload.
async function publishOne(key) {
  const { pdf } = await buildMenuPdf(key);
  const url = await publishMenuPdf(key, pdf.output("blob"));

  const entries = [];
  for (const [k, doc] of Object.entries(MENU_DOCS)) {
    const live = k === key ? url : await publishedMenuUrl(k);
    if (!live) continue;
    entries.push({
      key: k,
      title: doc.title,
      branch: doc.branch,
      branchLabel: (BRANCH_INFO[doc.branch] || {}).hotelName || doc.branch,
      url: live,
    });
  }
  await publishManifest(entries);
  return url;
}

// Republish after an edit, so the guest link follows the portal without
// anybody remembering to press anything.
//
// Debounced, and heavily. Each menu is about a megabyte to build and
// upload, and a manager correcting three prices in a row would otherwise
// pay for three full publishes of a menu nobody has read yet. Twelve
// seconds after the last edit is soon enough for a link nobody is
// standing over, and it collapses a burst of edits into one upload.
const REPUBLISH_DELAY_MS = 12000;
let republishTimer = null;

export function scheduleMenuRepublish(branch) {
  if (!branch) return;
  if (republishTimer) clearTimeout(republishTimer);
  republishTimer = setTimeout(async () => {
    republishTimer = null;
    // Only menus that have been published before. Publishing is still a
    // deliberate first act — this keeps an existing link current, it does
    // not decide on a manager's behalf that a menu should be public.
    for (const [key, doc] of Object.entries(MENU_DOCS)) {
      if (doc.branch !== branch) continue;
      try {
        if (!(await publishedMenuUrl(key))) continue;
        await publishOne(key);
      } catch (err) {
        logError(`Could not republish ${key}: ${err && (err.code || err.message)}`, { source: "menu-hosting" });
      }
    }
    refreshDigitalMenuPanel();
  }, REPUBLISH_DELAY_MS);
}

export function refreshDigitalMenuPanel() {
  const branch = appState.selectedBranch;
  const list = document.getElementById("menu-pdf-list");
  if (!branch || !list) return;

  const docs = docsForBranch(branch);
  list.innerHTML = docs.map(([key, doc]) => {
    // The board menu is fixed text, not dish rows — saying "68 dishes"
    // against it would be a lie.
    const count = doc.board ? "Set inclusions" : `${countFor(doc)} dishes`;
    return `
      <div class="menu-pdf-row">
        <div class="menu-pdf-meta">
          <span class="menu-pdf-name">${escapeHtml(doc.title)}</span>
          <span class="menu-pdf-count">${escapeHtml(count)}</span>
        </div>
        <div class="menu-pdf-actions">
          <button type="button" class="menu-pdf-open" data-menu="${key}">Open PDF</button>
          <button type="button" class="menu-pdf-save" data-menu="${key}" aria-label="Save ${escapeHtml(doc.title)} as PDF">Save</button>
          <button type="button" class="menu-pdf-publish" data-menu="${key}" aria-label="Publish ${escapeHtml(doc.title)} to its guest link">Publish</button>
        </div>
        <p class="menu-pdf-link" data-link="${key}"></p>
      </div>`;
  }).join("");

  list.querySelectorAll(".menu-pdf-open").forEach(btn => {
    btn.addEventListener("click", () => withBusy(btn, "Building…", async () => {
      await openMenuPdf(btn.dataset.menu);
    }));
  });
  list.querySelectorAll(".menu-pdf-save").forEach(btn => {
    btn.addEventListener("click", () => withBusy(btn, "…", async () => {
      await downloadMenuPdf(btn.dataset.menu);
      showToast("Menu saved");
    }));
  });

  list.querySelectorAll(".menu-pdf-publish").forEach(btn => {
    btn.addEventListener("click", () => withBusy(btn, "Publishing…", async () => {
      const key = btn.dataset.menu;
      // Built here, now, from the current dishes — so what goes to the
      // link is the same file Open PDF would have shown a second ago.
      const url = await publishOne(key);
      showLink(key, url);
      showToast("Menu published — the guest link now shows this version");
    }));
  });

  // Whatever is already live, so a manager can find the link without
  // republishing to get it.
  docs.forEach(([key]) => {
    publishedMenuUrl(key).then(url => { if (url) showLink(key, url); });
  });

  const mine = MENU_ITEMS.filter(d => d.branch === branch);
  const unpriced = mine.filter(d => !(d.price > 0)).length;
  const status = document.getElementById("digital-menu-status");
  if (status) {
    status.textContent = `${docs.length} menus · ${mine.length} dishes${unpriced ? ` · ${unpriced} without a price` : ""}`;
  }
  const hint = document.getElementById("digital-menu-hint");
  if (hint) {
    hint.textContent = unpriced
      ? "Built from this screen every time, so an edit shows immediately. A dish with no price prints as a dash."
      : "Built from this screen every time, so an edit shows in the PDF immediately.";
  }
}
