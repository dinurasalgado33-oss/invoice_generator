// Renders the four menu PDFs from Node, using the very same generator the
// app runs in the browser — so what lands on disk here is what a manager
// gets from the Menu PDFs panel. Only the two browser-only bits are
// shimmed: window.jspdf, and fetch() for the artwork.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { jsPDF } from "jspdf";

const root = process.cwd();

globalThis.window = { jspdf: { jsPDF } };

// The generator fetches artwork by repo-relative path and reads it with a
// FileReader; both are replaced with a straight file read here.
globalThis.fetch = async (p) => {
  const file = path.join(root, String(p));
  if (!fs.existsSync(file)) return { ok: false };
  const buf = fs.readFileSync(file);
  return { ok: true, blob: async () => ({ buf, type: p.endsWith(".jpg") ? "image/jpeg" : "image/png" }) };
};
globalThis.FileReader = class {
  readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,${blob.buf.toString("base64")}`;
    this.onload && this.onload();
  }
};

const mod = await import(pathToFileURL(path.join(root, "js/menu-pdf.js")).href);
const outDir = path.join(root, "dev", "menu-preview");
fs.mkdirSync(outDir, { recursive: true });

for (const key of Object.keys(mod.MENU_DOCS)) {
  const { pdf, doc } = await mod.buildMenuPdf(key);
  const file = path.join(outDir, `${key}.pdf`);
  fs.writeFileSync(file, Buffer.from(pdf.output("arraybuffer")));
  console.log(`${key.padEnd(12)} ${String(pdf.getNumberOfPages()).padStart(2)}pp  ${(fs.statSync(file).size / 1024).toFixed(0).padStart(5)}KB  ${doc.file}`);
}
