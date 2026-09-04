// The three CDN libraries, fetched the first time something needs them.
//
// All four used to load on every visit — 806 KB decoded, 163 KB over the
// wire — and none of them is on the screen reception opens. `defer` was
// added first, which stopped them blocking *render* and did nothing about
// them competing for *bandwidth*. Measured on a 0.15 Mbps link, close to
// what these properties actually have: chart.js and html2canvas took 28
// seconds to arrive and left a 17-second hole in the middle of startup
// where fifty application modules sat waiting behind them.
//
// A reception phone that takes a booking and never opens Finance or builds
// a PDF now downloads none of it. The trade is a pause the first time
// somebody does open Finance, on a screen where a pause is expected and
// where the alternative was making every check-in wait instead.
//
// The fourth, qrcode-generator, is simply gone: 55 KB downloaded on every
// visit for a global nothing in this project has ever called.

const pending = new Map();

function loadScript(url) {
  if (pending.has(url)) return pending.get(url);

  const p = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = url;
    el.async = true;
    el.onload = () => resolve(true);
    el.onerror = () => {
      // Dropped from the cache so a later attempt can retry. These are
      // remote properties on bad signal: failing once is not failing
      // forever, and the screens below all offer to try again.
      pending.delete(url);
      reject(new Error(`Could not load ${url}`));
    };
    document.head.appendChild(el);
  });

  pending.set(url, p);
  return p;
}

// Never throws. Every caller here is a guard that already had to answer
// "is this usable?" — the answer is just no longer decided at page load.
async function ensure(url, isReady) {
  if (isReady()) return true;
  try {
    await loadScript(url);
  } catch {
    return false;
  }
  return isReady();
}

const CHART_JS = "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js";
const HTML2CANVAS = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

export function ensureCharts() {
  return ensure(CHART_JS, () => typeof Chart === "function");
}

export function ensureHtml2Canvas() {
  return ensure(HTML2CANVAS, () => typeof html2canvas === "function");
}

export function ensureJsPdf() {
  return ensure(JSPDF, () => Boolean(window.jspdf) && typeof window.jspdf.jsPDF === "function");
}

// Building a PDF needs both, and needs them together — asking in parallel
// rather than one after the other matters most on exactly the connection
// that made this change worth doing.
export async function ensurePdfTools() {
  const [pdf, canvas] = await Promise.all([ensureJsPdf(), ensureHtml2Canvas()]);
  return pdf && canvas;
}
