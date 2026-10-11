// admin/aerofindex-admin.js — Aerofindex platform tab for the Volant Admin app.
// Lists everyone who signed up for Aerofindex and lets admins grant (or revoke)
// complimentary Pro/Business access — forever or for a limited time.
//
// This tab reuses the admin app's EXISTING sign-in (the silent-depth session).
// It calls the Aerofindex admin API (aerofindex.vercel.app/api/admin/*) with the
// current admin's ID token; the API verifies the token and does every Firestore
// read/write server-side. No second Firebase project is needed here, so there is
// no extra Google sign-in — just the normal admin login.

const AERO_ORIGIN = "https://aerofindex.vercel.app";

let podInitialized = false;
let users = [];
let selected = new Set();
let statusTimer = null;

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function status(el, msg) {
  if (!el) return;
  el.textContent = msg;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    if (el.textContent === msg) el.textContent = "";
  }, 6000);
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function grantInfo(g) {
  if (!g || !g.tier) return null;
  const endsAt = g.expiresAt ? new Date(g.expiresAt) : null;
  const active = !endsAt || endsAt.getTime() > Date.now();
  return { tier: g.tier, endsAt, active };
}

function root() {
  return document.getElementById("tab-aerofindex");
}

function adminAuth() {
  const fb = window.firebase;
  return fb && fb.auth ? fb.auth() : null;
}

// ---------------------------------------------------------------- API calls --

async function afApi(path, options) {
  const auth = adminAuth();
  if (!auth) throw Object.assign(new Error("No admin session."), { code: 401 });
  const token = await auth.currentUser.getIdToken(false);
  const res = await fetch(AERO_ORIGIN + path, {
    method: (options && options.method) || "GET",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
      ...((options && options.headers) || {}),
    },
    body: options && options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    data = {};
  }
  if (!res.ok) {
    throw Object.assign(new Error(data.error || "Request failed (" + res.status + ")."), {
      code: res.status,
    });
  }
  return data;
}

// ---------------------------------------------------------------- rendering --

function showLoading() {
  const r = root();
  if (!r) return;
  r.innerHTML = `
    <div style="max-width:1100px; margin:0 auto; padding:1.2rem 0; text-align:center; color:#8a7b6a;">
      <i class="fas fa-circle-notch fa-spin" style="color:#4b2aad;"></i> Loading Aerofindex…
    </div>`;
}

function showSession() {
  const r = root();
  if (!r) return;
  r.innerHTML = `
    <div style="max-width:1100px; margin:0 auto; padding:1.2rem 0;">
      <div class="manage-table-wrap" style="background:#fff; border:1px solid #ede7df; border-radius:16px; padding:2.5rem 2rem; text-align:center; color:#6b5f52;">
        <i class="fas fa-sign-in-alt" style="font-size:2rem; color:#4b2aad;"></i>
        <p style="margin:0.8rem 0 0; font-weight:600; color:#2d2a24;">Sign in to the admin app</p>
        <p style="margin:0.3rem 0 1.2rem; font-size:0.85rem;">This tab uses your normal Volant Admin login.</p>
        <a class="btn-admin" href="admin-login.html" style="background:#4b2aad; color:#fff; text-decoration:none;">
          <i class="fas fa-lock"></i> Go to admin login
        </a>
      </div>
    </div>`;
}

function showNotAdmin(email) {
  const r = root();
  if (!r) return;
  r.innerHTML = `
    <div style="max-width:1100px; margin:0 auto; padding:1.2rem 0;">
      <div class="manage-table-wrap" style="background:#fff; border:1px solid #ede7df; border-radius:16px; padding:2.5rem 2rem; color:#6b5f52;">
        <div style="text-align:center;">
          <i class="fas fa-shield-alt" style="font-size:2rem; color:#b76e4b;"></i>
          <p style="margin:0.8rem 0 0; font-weight:600; color:#2d2a24;">Signed in as ${escapeHtml(email || "you")}</p>
          <p style="margin:0.3rem 0 0; font-size:0.85rem;">
            This account is not an Aerofindex admin yet. Create the first (founding) Aerofindex
            admin below — its own login for the Aerofindex project. Use your own address
            (${escapeHtml(email || "your email")}) to become an admin yourself right away.
          </p>
        </div>
        <div style="max-width:420px; margin:1.4rem auto 0;">
          <label style="font-size:0.78rem; color:#8a7b6a; display:flex; flex-direction:column; gap:0.25rem; margin-bottom:0.7rem;">
            Admin email
            <input id="afNaEmail" type="email" placeholder="admin@example.com" value="${escapeHtml(email || "")}"
              style="padding:0.55rem 0.75rem; border:1px solid #dfd5ee; border-radius:9px; font-family:inherit;" />
          </label>
          <label style="font-size:0.78rem; color:#8a7b6a; display:flex; flex-direction:column; gap:0.25rem; margin-bottom:0.9rem;">
            Password (at least 6 characters)
            <input id="afNaPassword" type="password" placeholder="••••••"
              style="padding:0.55rem 0.75rem; border:1px solid #dfd5ee; border-radius:9px; font-family:inherit;" />
          </label>
          <button class="btn-admin" id="afNaBtn" style="width:100%; background:#4b2aad; color:#fff;">
            <i class="fas fa-user-plus"></i> Create Aerofindex admin
          </button>
          <div class="coupon-msg" id="afNaMsg" style="margin-top:0.6rem; font-size:0.82rem; text-align:center; min-height:1em;"></div>
          <p style="text-align:center; margin-top:0.9rem; font-size:0.78rem;">
            <a href="aerofindex-admins.html" style="color:#4b2aad;">Open the standalone admin page →</a>
          </p>
        </div>
      </div>
    </div>`;

  const btn = document.getElementById("afNaBtn");
  const msg = document.getElementById("afNaMsg");
  const submit = async () => {
    const em = (document.getElementById("afNaEmail").value || "").trim();
    const pw = document.getElementById("afNaPassword").value || "";
    if (!em || pw.length < 6) {
      status(msg, "Enter an email and a password (6+ characters).");
      return;
    }
    btn.disabled = true;
    status(msg, "Creating…");
    try {
      await afApi("/api/admin/admins", { method: "POST", body: { email: em, password: pw } });
      status(msg, "✅ Admin created. Reloading…");
      renderReady();
    } catch (e) {
      status(msg, "❌ " + (e.message || "Could not create the admin."));
    } finally {
      btn.disabled = false;
    }
  };
  btn.addEventListener("click", submit);
  document.getElementById("afNaPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

function renderReady() {
  const r = root();
  if (!r) return;

  r.innerHTML = `
    <div style="max-width:1100px; margin:0 auto; padding:1.2rem 0;">
      <div class="header" style="padding-bottom:1rem; margin-bottom:1.2rem;">
        <div class="left">
          <h1 style="color:#2d2a24;"><i class="fas fa-book-open" style="color:#4b2aad;"></i> Aerofindex · Platform Access</h1>
          <p style="font-size:0.85rem; color:#8a7b6a;">Free access for people who signed up — forever or until a date.</p>
        </div>
      </div>

      <div class="summary-grid" id="afSummary">
        <div class="summary-card"><div class="number purple">0</div><div class="label">Total sign-ups</div></div>
        <div class="summary-card"><div class="number green">0</div><div class="label">Active access</div></div>
        <div class="summary-card"><div class="number" style="color:#4b2aad;">0</div><div class="label">Forever access</div></div>
        <div class="summary-card"><div class="number orange">0</div><div class="label">Expiring 30 days</div></div>
      </div>

      <div class="manage-table-wrap" style="margin-top:1.1rem;">
        <h3 style="font-weight:600; color:#2d2a24; margin:0 0 0.5rem;"><i class="fas fa-gift" style="color:#4b2aad;"></i> Grant complimentary access</h3>
        <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:flex-end; margin-bottom:0.6rem;">
          <label style="font-size:0.78rem; color:#8a7b6a; display:flex; flex-direction:column; gap:0.2rem;">
            Access level
            <select id="afTier" style="padding:0.45rem 0.7rem; border:1px solid #dfd5ee; border-radius:8px; background:#fff; font-family:inherit;">
              <option value="business">Business — everything</option>
              <option value="pro">Pro</option>
            </select>
          </label>
          <label style="font-size:0.78rem; color:#8a7b6a; display:flex; flex-direction:column; gap:0.2rem;">
            Duration
            <select id="afDuration" style="padding:0.45rem 0.7rem; border:1px solid #dfd5ee; border-radius:8px; background:#fff; font-family:inherit;">
              <option value="forever">Forever</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="custom">Until a date…</option>
            </select>
          </label>
          <label id="afCustomWrap" style="font-size:0.78rem; color:#8a7b6a; display:none; flex-direction:column; gap:0.2rem;">
            Until
            <input type="date" id="afCustomDate" style="padding:0.4rem 0.7rem; border:1px solid #dfd5ee; border-radius:8px; font-family:inherit;" />
          </label>
          <label style="font-size:0.78rem; color:#8a7b6a; display:flex; flex-direction:column; gap:0.2rem; flex:1; min-width:160px;">
            Note (optional)
            <input type="text" id="afNote" placeholder="e.g. Sponsor — 3 months" style="padding:0.45rem 0.7rem; border:1px solid #dfd5ee; border-radius:8px; font-family:inherit;" />
          </label>
        </div>
        <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
          <button class="btn-admin" id="afGrantBtn" style="background:#4b2aad; color:#fff;"><i class="fas fa-gift"></i> Grant access to selected</button>
          <button class="btn-admin btn-reset" id="afRevokeBtn"><i class="fas fa-undo"></i> Revoke selected</button>
          <button class="btn-admin" id="afSelectAll"><i class="fas fa-check-double"></i> Select all</button>
          <button class="btn-admin" id="afSelectNone"><i class="fas fa-undo"></i> Clear selection</button>
          <button class="btn-admin" id="afRefresh">⟳ Refresh</button>
          <span id="afSelCount" style="font-size:0.78rem; color:#8a7b6a; align-self:center;">0 selected</span>
        </div>
        <div class="coupon-msg" id="afMsg" style="margin-top:0.4rem; font-size:0.82rem; min-height:1em;"></div>
      </div>

      <div class="email-table-scroll" style="margin-top:1rem;">
        <table class="admin-table">
          <thead><tr><th></th><th>User</th><th>Email</th><th>Signed up</th><th>Plan</th><th>Access</th></tr></thead>
          <tbody id="afTbody"><tr><td colspan="6" style="text-align:center; color:#8a7b6a;">Loading users…</td></tr></tbody>
        </table>
      </div>
    </div>`;

  document.getElementById("afDuration").addEventListener("change", (e) => {
    const wrap = document.getElementById("afCustomWrap");
    if (wrap) wrap.style.display = e.target.value === "custom" ? "flex" : "none";
  });
  document.getElementById("afGrantBtn").addEventListener("click", applyGrant);
  document.getElementById("afRevokeBtn").addEventListener("click", revokeGrant);
  document.getElementById("afSelectAll").addEventListener("click", selectAll);
  document.getElementById("afSelectNone").addEventListener("click", selectNone);
  document.getElementById("afRefresh").addEventListener("click", loadUsers);
  loadUsers();
}

async function loadUsers() {
  const msg = document.getElementById("afMsg");
  const tbody = document.getElementById("afTbody");
  if (msg) status(msg, "Loading users…");
  try {
    const data = await afApi("/api/admin/users");
    users = (data.users || []).slice();
    renderSummary();
    renderRows();
    if (msg) status(msg, "✅ " + users.length + " user(s) loaded.");
  } catch (e) {
    if (e.code === 401) {
      showSession();
      return;
    }
    if (e.code === 403) {
      const auth = adminAuth();
      showNotAdmin(auth && auth.currentUser ? auth.currentUser.email : null);
      return;
    }
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#c62828;">${escapeHtml(e.message || "Could not load users.")}</td></tr>`;
    if (msg) status(msg, "❌ " + (e.message || "Could not load users."));
  }
}

function renderSummary() {
  const now = Date.now();
  let active = 0;
  let forever = 0;
  let expiring30 = 0;
  users.forEach((u) => {
    const g = grantInfo(u.grant);
    if (g && g.active) {
      active++;
      if (!g.endsAt) forever++;
      else if (g.endsAt.getTime() - now <= 30 * 24 * 60 * 60 * 1000) expiring30++;
    }
  });
  const set = (i, v) => {
    const el = document.querySelector(`#afSummary .summary-card:nth-child(${i}) .number`);
    if (el) el.textContent = v;
  };
  set(1, users.length);
  set(2, active);
  set(3, forever);
  set(4, expiring30);
}

function renderRows() {
  const tbody = document.getElementById("afTbody");
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#8a7b6a;">No sign-ups yet.</td></tr>';
    return;
  }
  tbody.innerHTML = users
    .map((u) => {
      const g = grantInfo(u.grant);
      let chip = '<span style="color:#b0a493; font-size:0.78rem;">—</span>';
      if (g) {
        if (g.active) {
          chip = g.endsAt
            ? `<span class="chip" style="background:#e3ecf9; color:#1f4e9c; font-size:0.72rem; padding:0.15rem 0.55rem; border-radius:30px;">${escapeHtml(g.tier)} · until ${fmtDate(g.endsAt)}</span>`
            : `<span class="chip" style="background:#e6f4ea; color:#1e7e34; font-size:0.72rem; padding:0.15rem 0.55rem; border-radius:30px;">${escapeHtml(g.tier)} · forever</span>`;
        } else {
          chip = `<span class="chip" style="background:#f7e9e9; color:#a33; font-size:0.72rem; padding:0.15rem 0.55rem; border-radius:30px;">${escapeHtml(g.tier)} · expired ${fmtDate(g.endsAt)}</span>`;
        }
      }
      const checked = selected.has(u.uid) ? "checked" : "";
      return `<tr>
        <td><input type="checkbox" class="af-check" data-uid="${escapeHtml(u.uid)}" ${checked} /></td>
        <td style="font-weight:600;">${escapeHtml(u.displayName || "—")}</td>
        <td style="font-size:0.85rem; color:#6b5f52;">${escapeHtml(u.email || "—")}</td>
        <td style="font-size:0.8rem; color:#8a7b6a;">${fmtDate(u.createdAt)}</td>
        <td style="text-transform:capitalize;">${escapeHtml(u.plan || "free")}</td>
        <td>${chip}</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".af-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(cb.dataset.uid);
      else selected.delete(cb.dataset.uid);
      const el = document.getElementById("afSelCount");
      if (el) el.textContent = selected.size + " selected";
    });
  });
}

function selectAll() {
  users.forEach((u) => selected.add(u.uid));
  syncSelection();
}
function selectNone() {
  selected.clear();
  syncSelection();
}
function syncSelection() {
  const el = document.getElementById("afSelCount");
  if (el) el.textContent = selected.size + " selected";
  document.querySelectorAll(".af-check").forEach((cb) => {
    cb.checked = selected.has(cb.dataset.uid);
  });
}

function issuedExpiry() {
  const dur = document.getElementById("afDuration").value;
  if (dur === "forever") return null;
  if (dur === "custom") {
    const v = document.getElementById("afCustomDate").value;
    if (!v) return null;
    return new Date(v + "T23:59:59").getTime();
  }
  const days = parseInt(dur, 10) || 30;
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

async function applyGrant() {
  const uids = [...selected];
  const msg = document.getElementById("afMsg");
  if (!uids.length) {
    status(msg, "Select at least one user.");
    return;
  }
  const tier = document.getElementById("afTier").value;
  const expiresAt = issuedExpiry();
  const note = document.getElementById("afNote").value.trim();
  if (document.getElementById("afDuration").value === "custom" && !expiresAt) {
    status(msg, "Pick a date, or choose a different duration.");
    return;
  }
  const btn = document.getElementById("afGrantBtn");
  btn.disabled = true;
  try {
    await afApi("/api/admin/grant", {
      method: "POST",
      body: { uids, tier, expiresAt, note },
    });
    status(msg, "✅ Grant applied to " + uids.length + " user(s).");
    loadUsers();
  } catch (e) {
    status(msg, "❌ " + (e.message || "Could not grant access."));
  } finally {
    btn.disabled = false;
  }
}

async function revokeGrant() {
  const uids = [...selected];
  const msg = document.getElementById("afMsg");
  if (!uids.length) {
    status(msg, "Select at least one user.");
    return;
  }
  const btn = document.getElementById("afRevokeBtn");
  btn.disabled = true;
  try {
    await afApi("/api/admin/revoke", { method: "POST", body: { uids } });
    status(msg, "✅ Access revoked for " + uids.length + " user(s).");
    loadUsers();
  } catch (e) {
    status(msg, "❌ " + (e.message || "Could not revoke access."));
  } finally {
    btn.disabled = false;
  }
}

// ------------------------------------------------------------- auth + wiring --

function start() {
  if (podInitialized) return;
  podInitialized = true;

  const auth = adminAuth();
  if (!auth) {
    showLoading();
    return;
  }

  auth.onAuthStateChanged((u) => {
    if (!u) {
      showSession();
      return;
    }
    showLoading();
    renderReady();
  });
}

window.__loadAerofindexDashboard = function () {
  start();
};