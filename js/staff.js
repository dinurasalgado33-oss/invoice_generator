import { showScreen } from "./navigation.js";
import { escapeHtml, showToast } from "./utils.js";
import { connect, callable } from "./data/firebase.js";
import { confirmAction } from "./confirm.js";

// The staff accounts screen.
//
// Everything here is a request to a Cloud Function, never a direct write:
// `users/{uid}` is `allow write: if false` in the rules, which is what
// stops a receptionist promoting themselves. So this screen asks, and the
// server decides — and the server re-reads who is asking rather than
// believing anything sent from here.
//
// Which means the role gating below is convenience, not security. Hiding
// the button stops a mis-tap; it is the function that stops an attack.

const el = id => document.getElementById(id);

function setBusy(busy) {
  const btn = el("staff-submit-btn");
  btn.disabled = busy;
  btn.classList.toggle("is-busy", busy);
  el("staff-submit-label").textContent = busy ? "Creating…" : "Create Account";
}

function showError(message) {
  const box = el("staff-error");
  box.textContent = message;
  box.classList.toggle("show", Boolean(message));
}

function row(person) {
  // An account whose profile is missing OR malformed signs in and then
  // sees nothing, with no error saying why. Checking only for a missing
  // profile was not enough: a key saved as "role " with a trailing space
  // passed that check and still failed every rule. The server now reports
  // what is actually wrong, and it is shown here rather than hidden.
  const problems = person.problems || (person.hasProfile ? [] : ["No profile"]);
  const broken = problems.length > 0;
  const inactive = !person.active || person.disabledInAuth;
  const where = person.role === "manager" ? "Both properties" : (person.branch || "—");

  return `
    <div class="staff-row ${inactive ? "is-inactive" : ""} ${broken ? "is-broken" : ""}">
      <div class="staff-row-main">
        <span class="staff-row-name">${escapeHtml(person.name || person.email || "Unnamed")}</span>
        <span class="staff-row-email">${escapeHtml(person.email)}</span>
        <span class="staff-row-meta">
          ${broken
            ? problems.map(p => escapeHtml(p)).join(" · ")
            : `${escapeHtml(person.role || "?")} · ${escapeHtml(where)}`}
        </span>
      </div>
      <div class="staff-row-actions">
        ${inactive
          ? `<span class="staff-status off">Disabled</span>`
          : `<span class="staff-status on">Active</span>`}
        ${broken ? "" : `
        <button type="button" class="secondary-btn staff-toggle-btn"
                data-uid="${escapeHtml(person.uid)}"
                data-active="${person.active ? "1" : "0"}"
                data-name="${escapeHtml(person.name || person.email)}">
          ${person.active ? "Disable" : "Enable"}
        </button>`}
      </div>
    </div>`;
}

async function refresh() {
  const list = el("staff-list");
  list.innerHTML = `<p class="room-detail-empty">Loading…</p>`;
  try {
    await connect();
    const res = await callable("manageStaff")({ action: "list" });
    const staff = (res.data && res.data.staff) || [];
    if (!staff.length) {
      list.innerHTML = `<p class="room-detail-empty">No accounts yet.</p>`;
      return;
    }
    // Broken accounts first — they are the ones needing attention — then
    // active, then disabled.
    staff.sort((a, b) => {
      // Broken first, whether the profile is missing or malformed — those
      // are the accounts needing attention, and a malformed one used to
      // sort in with the healthy ones because it had a document.
      const rank = p => ((p.problems || []).length ? 0 : p.active ? 1 : 2);
      return rank(a) - rank(b) || (a.name || a.email).localeCompare(b.name || b.email);
    });
    list.innerHTML = staff.map(row).join("");
    wireToggles();
  } catch (err) {
    list.innerHTML = `<p class="room-detail-empty">${escapeHtml(describe(err))}</p>`;
  }
}

function describe(err) {
  const code = (err && err.code) || "";
  if (code.includes("permission-denied")) return "Managers only.";
  if (code.includes("unauthenticated")) return "Sign in again.";
  return (err && err.message) || "Something went wrong.";
}

function wireToggles() {
  document.querySelectorAll(".staff-toggle-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const wasActive = btn.dataset.active === "1";
      const ok = await confirmAction({
        title: wasActive ? "Disable this account?" : "Enable this account?",
        message: wasActive
          ? `${btn.dataset.name} will be signed out and unable to sign back in. Their records stay exactly as they are.`
          : `${btn.dataset.name} will be able to sign in again.`,
        confirmLabel: wasActive ? "Disable" : "Enable",
        tone: wasActive ? "danger" : "safe",
      });
      if (!ok) return;
      try {
        await callable("manageStaff")({ action: "setActive", uid: btn.dataset.uid, active: !wasActive });
        showToast(wasActive ? "Account disabled" : "Account enabled");
        refresh();
      } catch (err) {
        showToast(describe(err));
      }
    });
  });
}

// A manager works at both properties, so a branch would mean nothing.
function syncBranchField() {
  el("staff-branch-field").hidden = el("staff-role").value === "manager";
}

el("staff-role").addEventListener("change", syncBranchField);

el("staff-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  setBusy(true);
  try {
    await connect();
    const role = el("staff-role").value;
    await callable("manageStaff")({
      action: "create",
      name: el("staff-name").value.trim(),
      email: el("staff-email").value.trim(),
      password: el("staff-password").value,
      role,
      branch: role === "staff" ? el("staff-branch").value : "",
    });
    el("staff-form").reset();
    syncBranchField();
    showToast("Account created");
    refresh();
  } catch (err) {
    showError(describe(err));
  } finally {
    setBusy(false);
  }
});

el("open-staff-btn").addEventListener("click", () => {
  showScreen("screen-staff");
  syncBranchField();
  refresh();
});
