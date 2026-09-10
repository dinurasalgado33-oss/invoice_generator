// The four printed booklets, and everything about them a manager may
// change: the cover wording, the notes under it, the closing line, and
// which categories the menu carries.
//
// Lives here rather than in menu-pdf.js for the same reason BOARD_MENU
// does — it is data, and hydrateConfig has to reach it. menu-pdf.js is a
// screen module that pulls in jsPDF and a 163KB font, and importing that
// from the data layer would put the PDF engine on the startup path of
// every reception phone that never builds a menu.
//
// Not configurable, deliberately: the layout, the artwork and the palette.
// Those are the hotel's Canva design, not a setting, and HARDCODED-AUDIT
// §8 argues they should stay that way. `file` is not configurable either —
// it is the download's filename, not something a guest ever sees.
import { BOARD_MENU } from "./menu.js";

export const MENU_DOCS = {
  "ab-main": {
    branch: "Arugam Bay",
    title: "Main Menu",
    file: "Leopard-Inn-Arugam-Bay-Main-Menu.pdf",
    exclude: ["Cocktails", "Mocktails"],
    cover: { title: "MENU", sub: "Arugam Bay Beachfront Hotel" },
    notes: [
      "All prices are in Sri Lankan Rupees (LKR)",
      "Our seafood is sourced fresh on the day — kindly place seafood orders at least 4 hours in advance.",
    ],
    foot: "Thank you — we hope you enjoy your stay by the sea.",
  },
  "ab-cocktail": {
    branch: "Arugam Bay",
    title: "Cocktail Menu",
    file: "Leopard-Inn-Arugam-Bay-Cocktail-Menu.pdf",
    only: ["Cocktails", "Mocktails"],
    cover: { title: "COCKTAILS", sub: "Arugam Bay Beachfront Hotel" },
    notes: ["All prices are in Sri Lankan Rupees (LKR)"],
    foot: "",
  },
  "wp-main": {
    branch: "Wilpattu",
    title: "Full Menu",
    file: "Leopard-Inn-Wilpattu-Menu.pdf",
    cover: { title: "MENU", sub: "Wilpattu Forest Retreat" },
    notes: ["All prices are in Sri Lankan Rupees (LKR)"],
    foot: "Thank you — we hope you enjoy your stay in the forest.",
  },
  "wp-board": {
    branch: "Wilpattu",
    title: "Full / Half Board Menu",
    file: "Leopard-Inn-Wilpattu-Board-Menu.pdf",
    board: BOARD_MENU,
    cover: { title: "FULL / HALF BOARD", sub: "Wilpattu Forest Retreat" },
    notes: [],
    foot: "",
  },
};

// The board sheet has no dish categories — it is courses and inclusions,
// edited on its own screen. Asking which categories it carries would be a
// question with no meaning.
export function carriesDishes(doc) {
  return !doc.board;
}

// Categories actually in use at a property, in printed order. MENU_CATEGORIES
// is shared across both hotels, so offering the raw list would show Wilpattu
// a Cocktails box it has no cocktails for. Ordered by dish number, which is
// the order the printed menu runs in — the same reason dishesFor sorts that
// way rather than by the shared category list.
export function branchCategories(menuItems, branch) {
  const seen = new Map();
  menuItems
    .filter(d => d.branch === branch)
    .slice()
    .sort((a, b) => a.number - b.number)
    .forEach(d => { if (!seen.has(d.category)) seen.set(d.category, d.number); });
  return [...seen.keys()];
}

// One explicit list of what a menu carries, whatever it was expressed as.
//
// The code ships two mechanisms for one idea — `only` whitelists, `exclude`
// blacklists — which is fine to *write* and hopeless to *edit*: a checkbox
// grid cannot be half whitelist. So both collapse to a single list here,
// and a saved list replaces it outright. Defaults keep working untouched,
// and nothing needed migrating.
export function categoriesFor(doc, menuItems) {
  const all = branchCategories(menuItems, doc.branch);
  if (Array.isArray(doc.categories)) {
    // Intersected with what the branch actually serves, so a category that
    // was ticked and later renamed or emptied cannot leave a heading with
    // no dishes under it.
    return all.filter(c => doc.categories.includes(c));
  }
  if (doc.only) return all.filter(c => doc.only.includes(c));
  if (doc.exclude) return all.filter(c => !doc.exclude.includes(c));
  return all;
}

// Categories a property serves that no menu prints. Worth saying out loud:
// an explicit tick-list means a category added next month is on nothing
// until somebody ticks it, and a dish that exists but appears on no menu
// is exactly the sort of quiet wrongness this app keeps having to hunt.
export function orphanCategories(menuItems, branch) {
  const printed = new Set();
  Object.values(MENU_DOCS)
    .filter(d => d.branch === branch && carriesDishes(d))
    .forEach(d => categoriesFor(d, menuItems).forEach(c => printed.add(c)));
  return branchCategories(menuItems, branch).filter(c => !printed.has(c));
}

// What a manager may change, and nothing else. Applied onto the shipped
// object rather than replacing it, so `branch`, `file` and `board` survive
// a saved row that knows nothing about them.
export function applyMenuDocConfig(saved) {
  if (!saved || typeof saved !== "object") return false;
  let touched = false;
  for (const [key, value] of Object.entries(saved)) {
    const doc = MENU_DOCS[key];
    if (!doc || !value || typeof value !== "object") continue;
    if (value.cover && typeof value.cover === "object") {
      doc.cover = {
        title: String(value.cover.title ?? doc.cover.title ?? ""),
        sub: String(value.cover.sub ?? doc.cover.sub ?? ""),
      };
    }
    if (Array.isArray(value.notes)) doc.notes = value.notes.map(String);
    if (typeof value.foot === "string") doc.foot = value.foot;
    if (Array.isArray(value.categories)) doc.categories = value.categories.map(String);
    touched = true;
  }
  return touched;
}

// The inverse: only the editable fields, ready to store. Kept beside
// applyMenuDocConfig so the two cannot drift into disagreeing about which
// fields are a manager's to set.
export function menuDocConfigFor(branch, menuItems) {
  const out = {};
  Object.entries(MENU_DOCS)
    .filter(([, doc]) => doc.branch === branch)
    .forEach(([key, doc]) => {
      out[key] = {
        cover: { title: doc.cover.title || "", sub: doc.cover.sub || "" },
        notes: (doc.notes || []).map(String),
        foot: doc.foot || "",
      };
      if (carriesDishes(doc)) out[key].categories = categoriesFor(doc, menuItems);
    });
  return out;
}
