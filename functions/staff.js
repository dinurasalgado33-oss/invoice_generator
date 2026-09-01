// Creating and disabling staff accounts.
//
// The app cannot do this itself, by design: `users/{uid}` is
// `allow write: if false` in the rules, which is what stops a receptionist
// editing their own row to say `role: manager`. So account management has
// to run somewhere the rules do not apply — the Admin SDK — and that means
// here.
//
// Everything this function does is a privilege escalation if it is wrong,
// so the caller's role is read from Firestore on the server, every time.
// Nothing the client sends about who it is, is trusted.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const BRANCHES = ["Wilpattu", "Arugam Bay"];
const ROLES = ["staff", "manager"];

// The caller's own profile, read server-side. A client claiming to be a
// manager proves nothing; this is the only thing that decides.
async function requireManager(auth) {
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const snap = await admin.firestore().doc(`users/${auth.uid}`).get();
  const profile = snap.exists ? snap.data() : null;
  if (!profile || profile.role !== "manager" || profile.active !== true) {
    // Deliberately the same message whether the account is staff, disabled
    // or has no profile at all. A caller probing this endpoint should not
    // learn which.
    throw new HttpsError("permission-denied", "Managers only.");
  }
  return profile;
}


// What is actually wrong with a profile, if anything.
//
// "Has a document" was the only check, and it is not enough. A profile
// saved with its key as "role " — a trailing space, typed by hand into
// the console — produced an account that signed in, routed down the
// manager path because undefined is not "staff", looked entirely normal,
// and was refused by every rule. Nothing on any screen said why. That
// happened for real on the dev project and cost a working session.
//
// So the checks below are deliberately about the exact field names and
// values the rules read. Anything the rules would reject, this reports.
function profileProblems(p) {
  if (!p) return ["No profile — this account cannot use the app"];
  const problems = [];
  const keys = Object.keys(p);

  // Whitespace in a key is invisible in the console and fatal to the
  // rules, so it is named specifically rather than lumped in with
  // "missing field".
  const untidy = keys.filter(k => k !== k.trim());
  untidy.forEach(k => problems.push(`Field name "${k}" has a stray space — rename it to "${k.trim()}"`));

  if (!("role" in p)) problems.push("No 'role' field");
  else if (!ROLES.includes(p.role)) problems.push(`role is "${p.role}" — must be staff or manager`);

  // The rules compare active == true. A string "true" fails that, and
  // Firestore's console defaults new fields to string.
  if (!("active" in p)) problems.push("No 'active' field");
  else if (p.active !== true && p.active !== false) problems.push("'active' must be a boolean, not text");

  if (p.role === "staff") {
    if (!p.branch) problems.push("Staff account with no branch — it will see nothing");
    else if (!BRANCHES.includes(p.branch)) {
      problems.push(`branch is "${p.branch}" — must be exactly Wilpattu or Arugam Bay`);
    }
  }
  return problems;
}

exports.manageStaff = onCall({ region: "asia-south1" }, async (request) => {
  const caller = await requireManager(request.auth);
  const { action } = request.data || {};

  // ------------------------------------------------------------------
  // List — the screen's own data. Comes from Auth as well as Firestore so
  // an account that exists but has no profile is visible rather than
  // invisible; that combination is exactly what a half-finished manual
  // setup leaves behind, and it signs in and then sees nothing.
  // ------------------------------------------------------------------
  if (action === "list") {
    const [users, authList] = await Promise.all([
      admin.firestore().collection("users").get(),
      admin.auth().listUsers(1000),
    ]);
    const profiles = new Map();
    users.forEach(d => profiles.set(d.id, d.data()));
    return {
      staff: authList.users.map(u => {
        const p = profiles.get(u.uid) || null;
        return {
          uid: u.uid,
          email: u.email || "",
          name: p ? (p.name || "") : "",
          role: p ? (p.role || "") : "",
          branch: p ? (p.branch || "") : "",
          active: p ? p.active === true : false,
          hasProfile: Boolean(p),
          // Everything wrong with this account, in words a manager can
          // act on — not merely whether a document exists.
          problems: profileProblems(p),
          disabledInAuth: u.disabled === true,
        };
      }),
    };
  }

  // ------------------------------------------------------------------
  // Create
  // ------------------------------------------------------------------
  if (action === "create") {
    const { email, password, name, role, branch } = request.data || {};
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail) throw new HttpsError("invalid-argument", "An e-mail address is required.");
    if (!ROLES.includes(role)) throw new HttpsError("invalid-argument", "Role must be staff or manager.");
    // The branch string is compared with == in the rules and === in the
    // app. A typo here produces an account that signs in fine and then
    // silently sees nothing, with no error explaining why — so it is
    // validated against the list rather than accepted as typed.
    if (role === "staff" && !BRANCHES.includes(branch)) {
      throw new HttpsError("invalid-argument", "Staff must be assigned to Wilpattu or Arugam Bay.");
    }
    // Firebase's own floor is 6. Six characters on an account that can read
    // passport numbers is not a policy, it is an absence of one.
    if (String(password || "").length < 10) {
      throw new HttpsError("invalid-argument", "Password must be at least 10 characters.");
    }

    let user;
    try {
      user = await admin.auth().createUser({
        email: cleanEmail,
        password: String(password),
        displayName: String(name || "").trim() || undefined,
      });
    } catch (err) {
      if (err && err.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "That e-mail already has an account.");
      }
      throw new HttpsError("internal", "Could not create the account.");
    }

    // The profile is what actually grants access; without it the account
    // signs in and is refused everything. Written immediately after, and
    // if it fails the auth user is removed rather than left as an account
    // nobody can use and nobody remembers creating.
    try {
      await admin.firestore().doc(`users/${user.uid}`).set({
        email: cleanEmail,
        name: String(name || "").trim(),
        role,
        branch: role === "staff" ? branch : "",
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: caller.email || request.auth.uid,
      });
    } catch (err) {
      await admin.auth().deleteUser(user.uid).catch(() => {});
      throw new HttpsError("internal", "Could not save the profile; the account was rolled back.");
    }

    logger.info("Staff account created", { by: request.auth.uid, uid: user.uid, role, branch });
    return { uid: user.uid, email: cleanEmail };
  }

  // ------------------------------------------------------------------
  // Enable / disable. Never delete: the sign-in history in `logins` and
  // every document this person signed would lose its subject.
  // ------------------------------------------------------------------
  if (action === "setActive") {
    const { uid, active } = request.data || {};
    if (!uid) throw new HttpsError("invalid-argument", "Which account?");
    if (uid === request.auth.uid) {
      // Otherwise the last manager can lock themselves out of the only
      // screen that could let them back in.
      throw new HttpsError("failed-precondition", "You cannot disable your own account.");
    }
    const makeActive = active === true;
    await admin.firestore().doc(`users/${uid}`).set({ active: makeActive }, { merge: true });
    // Disabling in Auth too, so an existing session stops working rather
    // than continuing until its token happens to expire.
    await admin.auth().updateUser(uid, { disabled: !makeActive });
    logger.info("Staff account access changed", { by: request.auth.uid, uid, active: makeActive });
    return { uid, active: makeActive };
  }

  throw new HttpsError("invalid-argument", "Unknown action.");
});
