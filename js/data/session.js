// Who is signed in, according to Firebase.
//
// Two separate facts, and the app needs both before it can show anything:
//
//   1. Firebase Auth says which account this is — that is what the security
//      rules check on every read and write.
//   2. users/{uid} says what that account may do — manager or staff, and
//      for staff, the one property they work at.
//
// The second is a document the app deliberately cannot write, so a
// receptionist cannot promote themselves by editing their own row. It also
// means a brand-new account can sign in successfully and still be able to
// read nothing at all, which is the correct failure direction: access is
// granted deliberately, never by default.

import { connect, getDb, fsApi, getAuthInstance, authApiRef } from "./firebase.js";

let profile = null;
let account = null;

export function currentProfile() {
  return profile;
}

export function currentAccount() {
  return account;
}

export function isSignedIn() {
  return Boolean(account && profile && profile.active);
}

// Staff read only their own property; managers read both. Returned as null
// for a manager because that is what the query builder wants — no filter.
export function scopedBranch() {
  if (!profile) return null;
  return profile.role === "staff" ? (profile.branch || null) : null;
}

export async function signIn(email, password) {
  await connect();
  const auth = getAuthInstance();
  const { signInWithEmailAndPassword } = authApiRef();

  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  account = credential.user;

  const loaded = await loadProfile(account.uid);
  if (!loaded) {
    // Signed in, but nobody has said what they are allowed to do. Sign
    // straight back out rather than leaving them in an app where every
    // screen is empty and nothing explains why.
    await signOutNow();
    const err = new Error("This account has no role set. Ask a manager to set one up.");
    err.code = "app/no-profile";
    throw err;
  }
  if (!loaded.active) {
    await signOutNow();
    const err = new Error("This account has been disabled.");
    err.code = "app/disabled";
    throw err;
  }
  return loaded;
}

export async function loadProfile(uid) {
  await connect();
  const fs = fsApi();
  const snap = await fs.getDoc(fs.doc(getDb(), "users", uid));
  profile = snap.exists() ? { uid, ...snap.data() } : null;
  return profile;
}

export async function signOutNow() {
  await connect();
  const { signOut } = authApiRef();
  await signOut(getAuthInstance());
  account = null;
  profile = null;
}

// Fires whenever Firebase decides the session changed — including on load,
// when it restores a session from the last visit, and when a token expires
// or is revoked because the account was disabled.
export async function watchSession(onChange) {
  await connect();
  const { onAuthStateChanged } = authApiRef();
  return onAuthStateChanged(getAuthInstance(), async (user) => {
    account = user || null;
    if (!user) {
      profile = null;
      onChange(null);
      return;
    }
    try {
      const loaded = await loadProfile(user.uid);
      onChange(loaded && loaded.active ? loaded : null);
    } catch {
      // Offline on a cold start with no cached profile: treated as signed
      // out rather than guessed at, because guessing here would mean
      // guessing what someone is allowed to see.
      onChange(null);
    }
  });
}

// Human-readable reasons. Firebase's own messages name internal codes and
// leak whether an address exists, which is both unhelpful at a reception
// desk and a small information disclosure.
export function describeAuthError(err) {
  const code = (err && err.code) || "";
  if (code === "app/no-profile" || code === "app/disabled") return err.message;
  if (code === "auth/invalid-email") return "That doesn't look like an e-mail address.";
  if (code === "auth/network-request-failed") return "No connection — check the signal and try again.";
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a minute and try again.";
  // Wrong password, unknown account and disabled user all land here on
  // purpose: which one it was is not something a login screen should say.
  return "E-mail or password is wrong.";
}
