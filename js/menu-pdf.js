import { MENU_ITEMS, BOARD_MENU } from "./data/menu.js";
// The font is imported lazily inside buildMenuPdf(), not here.
//
// It is 163KB of base64 — 66KB over the wire, and about a fifth of all the
// JavaScript this app ships. A static import put it on the startup path of
// every single page load, including every reception phone that never
// builds a PDF in its life, because main.js reaches this file through
// menu-publish.js. Loading it at the point of use costs a few hundred
// milliseconds the first time somebody actually presses Publish or Open
// PDF, and nothing at all the rest of the time.

// Builds the hotel's menus as real PDF files, from the live menu config.
//
// The design is not invented here. The linen ground, the palm fronds, the
// dunes and the crest are the artwork lifted straight out of the hotel's
// own Canva export, and headings are set in Cinzel, the face that menu
// actually uses. Only dish names and prices come from the app.
//
// Both properties share the layout. Wilpattu runs the same sheet in its
// own colours — the fronds and dunes hue-rotated from Arugam Bay's
// sea-teal to forest green, and its own crest — so the two read as one
// hotel with two properties rather than two unrelated documents.
//
// Four documents, matching the four printed booklets:
//   Arugam Bay — Main Menu, Cocktail Menu
//   Wilpattu   — Full Menu, Full/Half Board Menu

const A4 = { w: 210, h: 297 };

// Arugam Bay: the sea. Wilpattu: the forest. Same roles, same structure.
const PALETTES = {
  "Arugam Bay": {
    ground: [248, 240, 218],
    heading: [39, 80, 94],     // deep teal
    accent: [77, 132, 150],    // teal, for italic subheads
    rule: [194, 160, 60],      // gold
    ink: [31, 61, 71],
    muted: [130, 144, 154],
    crest: "assets/menu/crest.png",
    art: {
      linen: "assets/menu/ab-linen.png",
      frond1: "assets/menu/ab-frond-1.png",
      frond2: "assets/menu/ab-frond-2.png",
      frond3: "assets/menu/ab-frond-3.png",
      waveA: "assets/menu/ab-wave-a.png",
      waveB: "assets/menu/ab-wave-b.png",
    },
  },
  "Wilpattu": {
    ground: [248, 240, 218],
    heading: [45, 74, 42],     // forest green
    accent: [92, 124, 78],
    rule: [194, 160, 60],
    ink: [38, 52, 36],
    muted: [132, 138, 120],
    crest: "assets/menu/crest-wilpattu.png",
    art: {
      linen: "assets/menu/ab-linen.png",
      frond1: "assets/menu/wp-frond-1.png",
      frond2: "assets/menu/wp-frond-2.png",
      frond3: "assets/menu/wp-frond-3.png",
      waveA: "assets/menu/wp-wave-a.png",
      waveB: "assets/menu/wp-wave-b.png",
    },
  },
};

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

function engineReady() {
  return typeof window !== "undefined" && window.jspdf && typeof window.jspdf.jsPDF === "function";
}

const artCache = new Map();
async function loadArt(path) {
  if (artCache.has(path)) return artCache.get(path);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`missing artwork: ${path}`);
  const blob = await res.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
  artCache.set(path, dataUrl);
  return dataUrl;
}

function splitCategory(category) {
  const at = category.indexOf(" - ");
  return at === -1
    ? { section: category, group: "" }
    : { section: category.slice(0, at), group: category.slice(at + 3) };
}

// Ordered by dish number, not by MENU_CATEGORIES. The number is the order
// the printed menu runs in, and it is per branch — whereas the category
// list is shared, so "Side Dishes" and "Breakfast" exist on both menus at
// Arugam Bay's position. Ordering by the shared list put Wilpattu's side
// dishes (51-60) ahead of its fresh juices (1-9).
function dishesFor(doc) {
  return MENU_ITEMS
    .filter(d => d.branch === doc.branch)
    .filter(d => (doc.only ? doc.only.includes(d.category) : true))
    .filter(d => (doc.exclude ? !doc.exclude.includes(d.category) : true))
    .sort((a, b) => a.number - b.number);
}

function groupSections(dishes) {
  const sections = [];
  const byName = new Map();
  dishes.forEach(d => {
    const { section, group } = splitCategory(d.category);
    if (!byName.has(section)) {
      const entry = { name: section, groups: [] };
      byName.set(section, entry);
      sections.push(entry);
    }
    const entry = byName.get(section);
    let g = entry.groups.find(x => x.name === group);
    if (!g) { g = { name: group, dishes: [] }; entry.groups.push(g); }
    g.dishes.push(d);
  });
  return sections;
}

async function drawFrame(pdf, pal) {
  pdf.setFillColor(...pal.ground);
  pdf.rect(0, 0, A4.w, A4.h, "F");
  pdf.addImage(await loadArt(pal.art.linen), "PNG", 0, 0, A4.w, A4.h, undefined, "FAST");
  pdf.addImage(await loadArt(pal.art.frond3), "PNG", -8, -6, 62, 40, undefined, "FAST");
  pdf.addImage(await loadArt(pal.art.frond1), "PNG", 152, -8, 48, 72, undefined, "FAST");
  pdf.addImage(await loadArt(pal.art.frond2), "PNG", 188, -3, 30, 72, undefined, "FAST");
  pdf.addImage(await loadArt(pal.art.waveA), "PNG", -6, A4.h - 36, 132, 23, undefined, "FAST");
  pdf.addImage(await loadArt(pal.art.waveB), "PNG", 58, A4.h - 27, 158, 27, undefined, "FAST");
}

async function build(pdf, doc) {
  const pal = PALETTES[doc.branch];
  const margin = 26;
  const right = A4.w - margin;
  const FOOT = A4.h - 42;   // clear of the dunes

  // ---------------------------------------------------------- cover ----
  await drawFrame(pdf, pal);
  try {
    pdf.addImage(await loadArt(pal.crest), "PNG", A4.w / 2 - 23, 40, 46, 46, undefined, "FAST");
  } catch { /* the crest is decorative — a missing file must not stop the menu */ }

  pdf.setFont("Cinzel", "normal");
  // A long cover title has to come down in size or it runs into the fronds.
  pdf.setFontSize(doc.cover.title.length > 12 ? 26 : doc.cover.title.length > 6 ? 34 : 52);
  pdf.setTextColor(...pal.heading);
  pdf.text(doc.cover.title, A4.w / 2, 138, { align: "center" });

  pdf.setFont("times", "italic");
  pdf.setFontSize(19);
  pdf.setTextColor(...pal.accent);
  pdf.text(doc.cover.sub, A4.w / 2, 154, { align: "center" });

  pdf.setDrawColor(...pal.rule);
  pdf.setLineWidth(0.6);
  pdf.line(A4.w / 2 - 24, 163, A4.w / 2 + 24, 163);

  pdf.setFont("times", "italic");
  pdf.setFontSize(10);
  pdf.setTextColor(...pal.heading);
  let ny = 178;
  doc.notes.forEach(note => {
    pdf.splitTextToSize(note, 118).forEach(line => {
      pdf.text(line, A4.w / 2, ny, { align: "center" });
      ny += 5.6;
    });
    ny += 2;
  });

  // -------------------------------------------------------- contents ----
  let page = 1;
  let y = 0;

  const newPage = async () => {
    pdf.addPage();
    await drawFrame(pdf, pal);
    page++;
    pdf.setFont("Cinzel", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...pal.rule);
    pdf.text(String(page), A4.w / 2, A4.h - 16, { align: "center" });
    y = 56;
  };
  const room = async need => { if (y + need > FOOT) await newPage(); };

  await newPage();

  if (doc.board) {
    for (const block of doc.board) {
      await room(40);
      pdf.setFont("Cinzel", "normal");
      pdf.setFontSize(19);
      pdf.setTextColor(...pal.heading);
      pdf.text(block.heading, A4.w / 2, y, { align: "center" });
      y += 4;
      pdf.setDrawColor(...pal.rule);
      pdf.setLineWidth(0.5);
      pdf.line(A4.w / 2 - 20, y, A4.w / 2 + 20, y);
      y += 6;
      if (block.note) {
        pdf.setFont("times", "italic");
        pdf.setFontSize(10);
        pdf.setTextColor(...pal.accent);
        pdf.text(block.note, A4.w / 2, y, { align: "center" });
        y += 10;
      }

      // The closing note belongs with the block it explains. Measured up
      // front and reserved against the last option, so it can never be
      // pushed onto a page of its own.
      pdf.setFont("times", "italic");
      pdf.setFontSize(8.5);
      const footLines = block.foot ? pdf.splitTextToSize(block.foot, right - margin) : [];

      for (const [i, opt] of block.options.entries()) {
        const last = i === block.options.length - 1;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.5);
        const detail = pdf.splitTextToSize(opt.detail, right - margin);
        await room(10 + detail.length * 4.6 + (last ? footLines.length * 4 + 6 : 0));
        pdf.setFont("times", "italic");
        pdf.setFontSize(13);
        pdf.setTextColor(...pal.accent);
        pdf.text(opt.name, A4.w / 2, y, { align: "center" });
        y += 6;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.5);
        pdf.setTextColor(...pal.ink);
        detail.forEach(line => { pdf.text(line, A4.w / 2, y, { align: "center" }); y += 4.6; });
        y += 6;
      }
      if (footLines.length) {
        pdf.setFont("times", "italic");
        pdf.setFontSize(8.5);
        pdf.setTextColor(...pal.muted);
        footLines.forEach(line => { pdf.text(line, A4.w / 2, y, { align: "center" }); y += 4; });
      }
      y += 10;
    }
  } else {
    for (const section of groupSections(dishesFor(doc))) {
      await room(36);
      pdf.setFont("Cinzel", "normal");
      pdf.setFontSize(19);
      pdf.setTextColor(...pal.heading);
      pdf.text(section.name, A4.w / 2, y, { align: "center" });
      y += 4;
      pdf.setDrawColor(...pal.rule);
      pdf.setLineWidth(0.5);
      pdf.line(A4.w / 2 - 20, y, A4.w / 2 + 20, y);
      y += 12;

      for (const group of section.groups) {
        if (group.name) {
          await room(18);
          pdf.setFont("times", "italic");
          pdf.setFontSize(13);
          pdf.setTextColor(...pal.accent);
          pdf.text(group.name, A4.w / 2, y, { align: "center" });
          y += 9;
        }
        for (const d of group.dishes) {
          // Measure in the font the text will actually be set in.
          // splitTextToSize and getTextWidth both use whatever font is
          // current, so measuring before setting it wrapped the first dish
          // under each heading against the heading's size.
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(11);
          const priceText = d.price > 0 ? Number(d.price).toLocaleString("en-US") : "";
          const priceW = pdf.getTextWidth(priceText || "—");
          const nameLines = pdf.splitTextToSize(d.name, Math.max(30, right - (margin + 11) - priceW - 6));

          pdf.setFont("times", "italic");
          pdf.setFontSize(8.5);
          const desc = d.description ? pdf.splitTextToSize(d.description, right - margin - 11) : [];
          await room(nameLines.length * 5 + desc.length * 4 + 4);

          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(11);
          pdf.setTextColor(...pal.heading);
          pdf.text(`${d.number}.`, margin, y);
          pdf.setTextColor(...pal.ink);
          nameLines.forEach((line, i) => pdf.text(line, margin + 11, y + i * 5));

          pdf.setTextColor(...pal.heading);
          pdf.text(priceText || "—", right, y, { align: "right" });
          y += nameLines.length * 5;

          if (desc.length) {
            pdf.setFont("times", "italic");
            pdf.setFontSize(8.5);
            pdf.setTextColor(...pal.muted);
            desc.forEach(line => { pdf.text(line, margin + 11, y); y += 4; });
            y += 1;
          }
          y += 3;
        }
        y += 4;
      }
      y += 6;
    }
  }

  if (doc.foot) {
    await room(16);
    pdf.setFont("times", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(...pal.accent);
    pdf.text(doc.foot, A4.w / 2, y + 6, { align: "center" });
  }
}

// Built fresh on every call, so the PDF is always the menu as it stands
// right now rather than whatever it looked like when the app loaded.
export async function buildMenuPdf(key) {
  if (!engineReady()) throw new Error("The PDF engine didn't load — check the connection and reload.");
  const doc = MENU_DOCS[key];
  if (!doc) throw new Error(`Unknown menu: ${key}`);

  const { CINZEL_REGULAR_B64 } = await import("./data/font-cinzel.js");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.addFileToVFS("Cinzel-Regular.ttf", CINZEL_REGULAR_B64);
  pdf.addFont("Cinzel-Regular.ttf", "Cinzel", "normal");
  pdf.setProperties({
    title: `${doc.title} — Leopard Inn ${doc.branch}`,
    author: "Leopard Inn",
    subject: doc.title,
  });

  await build(pdf, doc);
  return { pdf, doc };
}

export async function openMenuPdf(key) {
  const { pdf } = await buildMenuPdf(key);
  // A blob URL rather than a download: the link opens the PDF in the
  // browser's own viewer, which is what someone handed a link expects.
  const url = URL.createObjectURL(pdf.output("blob"));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return url;
}

export async function downloadMenuPdf(key) {
  const { pdf, doc } = await buildMenuPdf(key);
  pdf.save(doc.file);
}
