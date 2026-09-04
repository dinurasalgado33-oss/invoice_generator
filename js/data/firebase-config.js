// Which Firebase project this page talks to.
//
// Chosen by hostname, not by a flag someone has to remember to flip:
// running locally can only ever reach the test project, and the live
// project can only be reached from the real address. A mistake while
// building therefore cannot land in a real guest's records.
//
// These values are public by design. They name the project; they do not
// grant access to it. Access is decided entirely by the security rules and
// by who is signed in — which is why Firestore was created in production
// mode, locked to everyone, before any of this was written.

const DEV = {
  apiKey: "AIzaSyBTFpYX0gq3LdtSJPA6thHMq89h4Srqf2g",
  authDomain: "leopard-inn-dev.firebaseapp.com",
  projectId: "leopard-inn-dev",
  storageBucket: "leopard-inn-dev.firebasestorage.app",
  messagingSenderId: "876047759757",
  appId: "1:876047759757:web:5c4c07f4e91a35cc85a5c4",
};

// The real project. Guest passport numbers, real money, real invoices.
//
// measurementId is deliberately omitted: it belongs to Analytics, which
// this app does not load. Carrying a key for a product that is never
// initialised is just an unused secret in a public file.
const LIVE = {
  apiKey: "AIzaSyAa9LK0vI9skrSc0OU9-4Jzaq57aAa4uQA",
  authDomain: "leopard-inn.firebaseapp.com",
  projectId: "leopard-inn",
  storageBucket: "leopard-inn.firebasestorage.app",
  messagingSenderId: "473662422025",
  appId: "1:473662422025:web:a3307478a594d8b141ccd8",
};

function isLocal(host) {
  // Opening index.html straight off disk reports an empty hostname. That is
  // as local as it gets, and without this it fell through to the "no live
  // project" warning and looked like a real misconfiguration.
  if (!host) return true;
  return host === "localhost"
    || host === "127.0.0.1"
    || host === "[::1]"
    || host.endsWith(".local")
    || /^192\.168\./.test(host)
    || /^10\./.test(host);
}

// Every address that is deliberately not the live hotel.
//
// Unknown hosts still resolve to LIVE, which is the conservative choice:
// this file cannot know every domain the real portal might one day be
// served from, and sending real reception staff to a throwaway database
// would be worse than the problem being fixed. So the rule names what is
// known to be test, rather than guessing at what is known to be live.
function isTestHost(host) {
  if (isLocal(host)) return true;

  // The test project's own hosting sites. This is the case that was
  // missing, and the whole reason this function now exists.
  if (host === DEV.projectId + ".web.app") return true;
  if (host === DEV.projectId + ".firebaseapp.com") return true;

  // Firebase preview channels are <site>--<channel>-<hash>.web.app. A
  // preview is by definition not the live site, whichever project it was
  // built from — so `firebase hosting:channel:deploy` on the live project
  // is safe to open without it writing to a real guest's records.
  if (host.includes("--") && host.endsWith(".web.app")) return true;

  return false;
}

export function firebaseConfig() {
  const host = typeof location !== "undefined" ? location.hostname : "localhost";
  if (isTestHost(host)) return markTest(DEV);
  if (LIVE) return LIVE;

  // Served from a real address with no live project configured. Falling
  // back to the test database is the safe direction, but doing it quietly
  // is not: real guests would be checked into a project meant to be
  // thrown away, and nothing on screen would say so. Shout, then fall
  // back.
  console.error(
    "[Leopard Inn] Running on " + host + " but no live Firebase project is configured — " +
    "using the TEST database. Fill in LIVE in js/data/firebase-config.js before going live."
  );
  return markTest(DEV);
}

// Says so on the screen, not only in the console.
//
// This flag was already being set here and nothing ever rendered it, so
// running against the test database looked exactly like running against
// the real one. css/base.css turns it into a strip across the top of the
// page, because the failure being fixed *is* not knowing which database
// you are looking at.
function markTest(config) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.usingTestDatabase = "true";
  }
  return config;
}

export function isLiveProject() {
  return firebaseConfig().projectId === (LIVE && LIVE.projectId);
}

export function projectId() {
  return firebaseConfig().projectId;
}
