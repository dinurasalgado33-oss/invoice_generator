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

// Anything that isn't localhost or a local network address is treated as
// the real thing. Erring this way round means an unrecognised host gets
// the *test* project rather than silently writing to live data.
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

export function firebaseConfig() {
  const host = typeof location !== "undefined" ? location.hostname : "localhost";
  if (isLocal(host)) return DEV;
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
  if (typeof document !== "undefined") {
    document.documentElement.dataset.usingTestDatabase = "true";
  }
  return DEV;
}

export function isLiveProject() {
  return firebaseConfig().projectId === (LIVE && LIVE.projectId);
}

export function projectId() {
  return firebaseConfig().projectId;
}
