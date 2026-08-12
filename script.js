(() => {
  let selectedBranch = "";
  let selectedBranchLabel = "";
  let selectedBranchLogo = "";
  let invoiceCounter = Number(localStorage.getItem("leopardinn-invoice-counter") || "1");

  const screens = {
    login: document.getElementById("screen-login"),
    branch: document.getElementById("screen-branch"),
    home: document.getElementById("screen-home"),
    rooms: document.getElementById("screen-rooms"),
    dashboard: document.getElementById("screen-dashboard"),
    form: document.getElementById("screen-form"),
    preview: document.getElementById("screen-preview"),
  };

  function setLogoSrc(id, src) {
    const img = document.getElementById(id);
    img.style.display = "";
    img.src = src;
  }

  const screenOrder = ["screen-login", "screen-branch", "screen-home", "screen-rooms", "screen-dashboard", "screen-form", "screen-preview"];

  function showScreen(id) {
    const currentEl = document.querySelector(".screen.active");
    const fromIdx = currentEl ? screenOrder.indexOf(currentEl.id) : -1;
    const toIdx = screenOrder.indexOf(id);
    const direction = toIdx >= fromIdx ? "enter-forward" : "enter-back";

    Object.values(screens).forEach(s => s.classList.remove("active", "enter-forward", "enter-back"));

    const target = document.getElementById(id);
    target.classList.add("active");
    void target.offsetWidth; // restart animation
    target.classList.add(direction);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Staff login — client-side gate only (no backend), just keeps casual
  // visitors out. Credentials live in this file, in plain view, so treat
  // it as a light deterrent, not real security.
  const LOGIN_KEY = "leopardinn-logged-in";
  const ROLE_KEY = "leopardinn-role";
  const LOCKED_BRANCH_KEY = "leopardinn-locked-branch";

  const ACCOUNTS = [
    { username: "ashen", password: "1234", role: "manager", branch: null },
    { username: "staff", password: "1234", role: "staff", branch: "Wilpattu" },
  ];

  let currentRole = localStorage.getItem(ROLE_KEY) || "manager";

  function selectBranch(branchKey) {
    const btn = document.querySelector('.branch-btn[data-branch="' + branchKey + '"]');
    if (!btn) return;

    selectedBranch = btn.dataset.branch;
    selectedBranchLabel = btn.dataset.label;
    selectedBranchLogo = btn.dataset.logo;

    document.getElementById("home-branch-label").textContent = selectedBranchLabel;
    document.getElementById("form-branch-label").textContent = selectedBranchLabel;
    document.getElementById("rooms-branch-label").textContent = selectedBranchLabel;
    document.getElementById("dashboard-branch-label").textContent = selectedBranchLabel;
    setLogoSrc("home-logo", selectedBranchLogo);
    setLogoSrc("form-logo", selectedBranchLogo);
    setLogoSrc("rooms-logo", selectedBranchLogo);
    setLogoSrc("dashboard-logo", selectedBranchLogo);

    updateRoomsCardAvailability();
  }

  function applyRoleGates() {
    const isStaff = currentRole === "staff";

    document.querySelectorAll('.launch-card[data-role="manager"]').forEach(card => {
      card.style.display = isStaff ? "none" : "";
    });

    // Staff are locked to one branch — the "Change branch" entry point
    // is the only way back to screen-branch, so hide it for them.
    const changeBranchBtn = document.querySelector("#screen-home .back-btn");
    if (changeBranchBtn) changeBranchBtn.style.display = isStaff ? "none" : "";

    document.getElementById("role-indicator").textContent = "Role: " + (isStaff ? "Staff" : "Manager");
  }

  function routeAfterLogin() {
    applyRoleGates();
    const lockedBranch = localStorage.getItem(LOCKED_BRANCH_KEY);
    if (lockedBranch) {
      selectBranch(lockedBranch);
      showScreen("screen-home");
    } else {
      showScreen("screen-branch");
    }
  }

  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");
    const formEl = document.getElementById("login-form");

    const account = ACCOUNTS.find(a => a.username === username && a.password === password);

    if (account) {
      localStorage.setItem(LOGIN_KEY, "true");
      localStorage.setItem(ROLE_KEY, account.role);
      localStorage.setItem(LOCKED_BRANCH_KEY, account.branch || "");
      currentRole = account.role;
      errorEl.classList.remove("show");
      routeAfterLogin();
    } else {
      errorEl.classList.add("show");
      formEl.classList.remove("shake");
      void formEl.offsetWidth; // restart animation
      formEl.classList.add("shake");
      document.getElementById("login-password").value = "";
      document.getElementById("login-password").focus();
    }
  });

  // Branch selection
  document.querySelectorAll(".branch-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectBranch(btn.dataset.branch);
      showScreen("screen-home");
    });
  });

  // Back buttons
  document.querySelectorAll(".back-btn").forEach(btn => {
    btn.addEventListener("click", () => showScreen(btn.dataset.back));
  });

  // Room map — mock data for now; the launch card only lights up for
  // branches with data wired in. Swap ROOMS_BY_BRANCH for a real data
  // source later without touching the rendering/UI code.
  //
  // status: "available" (free) | "booked" (upcoming reservation, guest not
  // yet on-site) | "occupied" (guest checked in). rate = LKR per night,
  // used to auto-calculate the room charge at checkout.
  const ROOMS_BY_BRANCH = {
    "Arugam Bay": [
      { name: "Ocean Pool Villa 01", type: "Pool Villa", rate: 11500, status: "occupied", guest: "Kasun Perera", phone: "077 221 8511", checkin: "2026-08-10", checkout: "2026-08-13" },
      { name: "Ocean Pool Villa 02", type: "Pool Villa", rate: 11500, status: "available" },
      { name: "Ocean Pool Villa 03", type: "Pool Villa", rate: 11500, status: "booked", guest: "Amanda Lee", phone: "071 456 7890", checkin: "2026-08-14", checkout: "2026-08-17" },
      { name: "Garden Villa 04", type: "Garden Villa", rate: 8500, status: "available" },
      { name: "Garden Villa 05", type: "Garden Villa", rate: 8500, status: "occupied", guest: "Mr. & Mrs. Silva", phone: "070 333 2211", checkin: "2026-08-09", checkout: "2026-08-12" },
      { name: "Garden Villa 06", type: "Garden Villa", rate: 8500, status: "booked", guest: "Priya Nair", phone: "072 555 1234", checkin: "2026-08-15", checkout: "2026-08-18" },
      { name: "Beachfront Villa 07", type: "Beachfront Villa", rate: 15000, status: "occupied", guest: "Nadeesha Fernando", phone: "076 812 4499", checkin: "2026-08-10", checkout: "2026-08-15" },
      { name: "Beachfront Villa 08", type: "Beachfront Villa", rate: 15000, status: "available" },
      { name: "Beachfront Villa 09", type: "Beachfront Villa", rate: 15000, status: "booked", guest: "John Smith", phone: "+44 7911 123456", checkin: "2026-08-12", checkout: "2026-08-13" },
    ],
    "Wilpattu": [
      { name: "Forest Villa 1", type: "Forest Chalet", rate: 9500, status: "occupied", guest: "Ruwan Jayasuriya", phone: "077 654 3210", checkin: "2026-08-10", checkout: "2026-08-12" },
      { name: "Forest Villa 2", type: "Forest Chalet", rate: 9500, status: "available" },
      { name: "Forest Villa 3", type: "Forest Chalet", rate: 9500, status: "booked", guest: "Chathurika Fernando", phone: "071 987 6543", checkin: "2026-08-14", checkout: "2026-08-19" },
      { name: "Forest Villa 4", type: "Safari Chalet", rate: 10500, status: "available" },
      { name: "Forest Villa 5", type: "Safari Chalet", rate: 10500, status: "occupied", guest: "Mr. & Mrs. Bandara", phone: "070 222 4455", checkin: "2026-08-11", checkout: "2026-08-13" },
      { name: "Forest Villa 6", type: "Safari Chalet", rate: 10500, status: "booked", guest: "Tharindu Perera", phone: "076 999 8877", checkin: "2026-08-16", checkout: "2026-08-18" },
      { name: "Forest Villa 7", type: "Riverside Chalet", rate: 12000, status: "occupied", guest: "Ishara Wickramasinghe", phone: "076 345 6789", checkin: "2026-08-10", checkout: "2026-08-15" },
      { name: "Forest Villa 8", type: "Riverside Chalet", rate: 12000, status: "available" },
      { name: "Forest Villa 9", type: "Riverside Chalet", rate: 12000, status: "booked", guest: "David Miller", phone: "+1 415 555 0182", checkin: "2026-08-12", checkout: "2026-08-14" },
    ],
  };

  const ROOM_STATUS_LABELS = { available: "Available", booked: "Booked", occupied: "Occupied" };
  let activeRoomRef = null; // { branch, index } — the villa the detail sheet is currently showing
  let checkoutRoomRef = null; // villa currently mid-checkout, reset to available once the invoice is generated

  function nightsBetween(checkin, checkout) {
    const a = new Date(checkin + "T00:00:00");
    const b = new Date(checkout + "T00:00:00");
    const diff = Math.round((b - a) / 86400000);
    return diff > 0 ? diff : 1;
  }

  function updateRoomsCardAvailability() {
    const btn = document.getElementById("open-rooms-btn");
    const badge = document.getElementById("rooms-card-badge");
    const arrow = document.getElementById("rooms-card-arrow");
    const subtext = document.getElementById("rooms-card-subtext");
    const hasData = Boolean(ROOMS_BY_BRANCH[selectedBranch]);

    btn.disabled = !hasData;
    badge.style.display = hasData ? "none" : "";
    arrow.style.display = hasData ? "" : "none";
    subtext.textContent = hasData
      ? "See which villas are booked and which are free"
      : "Check room availability and booking details";
  }

  function renderRooms() {
    const grid = document.getElementById("rooms-grid");
    const rooms = ROOMS_BY_BRANCH[selectedBranch] || [];
    grid.innerHTML = "";

    rooms.forEach((room, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "room-card " + room.status;

      const hasStay = room.status === "booked" || room.status === "occupied";
      const ribbon = hasStay
        ? `<span class="room-card-ribbon">${formatDate(room.checkin)} &rarr; ${formatDate(room.checkout)}</span>`
        : "";
      const guestLine = hasStay ? `<span class="room-card-guest">${escapeHtml(room.guest)}</span>` : "";

      card.innerHTML = `
        ${ribbon}
        <svg class="room-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
        <span class="room-card-name">${escapeHtml(room.name)}</span>
        ${guestLine}
        <span class="room-card-status"><span class="room-card-status-dot"></span>${ROOM_STATUS_LABELS[room.status]}</span>
      `;

      card.addEventListener("click", () => openRoomDetail(selectedBranch, index));
      grid.appendChild(card);
    });
  }

  function openRoomDetail(branch, index) {
    activeRoomRef = { branch, index };
    renderRoomDetailBody();
    document.getElementById("room-detail-overlay").classList.add("open");
  }

  function closeRoomDetail() {
    document.getElementById("room-detail-overlay").classList.remove("open");
  }

  function getActiveRoom() {
    return ROOMS_BY_BRANCH[activeRoomRef.branch][activeRoomRef.index];
  }

  function renderRoomDetailBody() {
    const room = getActiveRoom();

    document.getElementById("room-detail-name").textContent = room.name;
    const statusEl = document.getElementById("room-detail-status");
    statusEl.textContent = ROOM_STATUS_LABELS[room.status];
    statusEl.className = "room-detail-status " + room.status;

    const body = document.getElementById("room-detail-body");

    if (room.status === "available") {
      body.innerHTML = `
        <div class="room-detail-row"><span>Type</span><span>${escapeHtml(room.type)}</span></div>
        <div class="room-detail-row"><span>Rate</span><span>LKR ${room.rate.toLocaleString("en-US")} / night</span></div>
        <p class="room-detail-empty">This villa is free right now.</p>
        <button type="button" class="primary-btn big" id="new-booking-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
          New Booking
        </button>
      `;
      document.getElementById("new-booking-btn").addEventListener("click", showNewBookingForm);
    } else if (room.status === "booked") {
      body.innerHTML = `
        <div class="room-detail-row"><span>Type</span><span>${escapeHtml(room.type)}</span></div>
        <div class="room-detail-row"><span>Guest</span><span>${escapeHtml(room.guest)}</span></div>
        <div class="room-detail-row"><span>Contact</span><span>${escapeHtml(room.phone || "-")}</span></div>
        <div class="room-detail-row"><span>Check-in</span><span>${formatDate(room.checkin)}</span></div>
        <div class="room-detail-row"><span>Check-out</span><span>${formatDate(room.checkout)}</span></div>
        <button type="button" class="primary-btn big" id="check-in-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>
          Check In
        </button>
      `;
      document.getElementById("check-in-btn").addEventListener("click", () => {
        room.status = "occupied";
        renderRoomDetailBody();
        renderRooms();
      });
    } else {
      body.innerHTML = `
        <div class="room-detail-row"><span>Type</span><span>${escapeHtml(room.type)}</span></div>
        <div class="room-detail-row"><span>Guest</span><span>${escapeHtml(room.guest)}</span></div>
        <div class="room-detail-row"><span>Contact</span><span>${escapeHtml(room.phone || "-")}</span></div>
        <div class="room-detail-row"><span>Check-in</span><span>${formatDate(room.checkin)}</span></div>
        <div class="room-detail-row"><span>Check-out</span><span>${formatDate(room.checkout)}</span></div>
        <div class="room-detail-foodorders">
          <h4>Food Orders</h4>
          <button type="button" class="secondary-btn" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z" /><path d="M6 1v3M10 1v3M14 1v3" /></svg>
            Coming Soon
          </button>
        </div>
        <button type="button" class="primary-btn big" id="check-out-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          Check Out
        </button>
      `;
      document.getElementById("check-out-btn").addEventListener("click", startCheckout);
    }
  }

  function showNewBookingForm() {
    const room = getActiveRoom();
    const body = document.getElementById("room-detail-body");
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    body.innerHTML = `
      <form id="new-booking-form">
        <div class="field">
          <label>Guest Name</label>
          <input type="text" id="nb-guest" required autocomplete="name" autocapitalize="words" enterkeyhint="next" />
        </div>
        <div class="field">
          <label>Phone Number</label>
          <input type="tel" id="nb-phone" autocomplete="tel" inputmode="tel" enterkeyhint="next" />
        </div>
        <div class="form-grid">
          <div class="field">
            <label>Check-in</label>
            <input type="date" id="nb-checkin" required value="${today}" />
          </div>
          <div class="field">
            <label>Check-out</label>
            <input type="date" id="nb-checkout" required value="${tomorrow}" />
          </div>
        </div>
        <button type="submit" class="primary-btn big">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></svg>
          Save Booking
        </button>
      </form>
    `;

    document.getElementById("new-booking-form").addEventListener("submit", (e) => {
      e.preventDefault();
      room.guest = document.getElementById("nb-guest").value.trim();
      room.phone = document.getElementById("nb-phone").value.trim();
      room.checkin = document.getElementById("nb-checkin").value;
      room.checkout = document.getElementById("nb-checkout").value;
      room.status = "booked";
      renderRoomDetailBody();
      renderRooms();
    });
  }

  function startCheckout() {
    const room = getActiveRoom();
    checkoutRoomRef = { branch: activeRoomRef.branch, index: activeRoomRef.index };
    closeRoomDetail();
    prefillInvoiceForCheckout(room);
    showScreen("screen-form");
  }

  function prefillInvoiceForCheckout(room) {
    resetForm();
    document.getElementById("guest-name").value = room.guest || "";
    document.getElementById("guest-phone").value = room.phone || "";
    document.getElementById("checkin-date").value = room.checkin || "";
    document.getElementById("checkout-date").value = room.checkout || "";

    const nights = nightsBetween(room.checkin, room.checkout);
    const rate = room.rate || 0;
    itemsBody.innerHTML = "";
    addItemRow(room.name + " — Room Charge", String(nights), String(rate), String(nights * rate));
  }

  document.getElementById("room-detail-close").addEventListener("click", closeRoomDetail);
  document.getElementById("room-detail-overlay").addEventListener("click", (e) => {
    if (e.target.id === "room-detail-overlay") closeRoomDetail();
  });

  document.getElementById("open-rooms-btn").addEventListener("click", () => {
    renderRooms();
    showScreen("screen-rooms");
  });

  // Finance dashboard — mock data for now; swap DASHBOARD_DATA for a real
  // source later, the chart-rendering code below doesn't need to change.
  const CHART_COLORS = {
    maroon: "#4a0e1c",
    gold: "#d4af37",
    teal: "#5c8a86",
    tan: "#c99a5b",
    grid: "#e6dcc8",
    text: "#7d6a5c",
  };

  const DASHBOARD_DATA = {
    "Wilpattu": {
      kpis: { revenue: 4820000, invoices: 132, avgInvoice: 36515, occupancy: 78 },
      revenueByCategory: { "Accommodation": 3100000, "Food & Beverage": 980000, "Safari & Activities": 540000, "Other": 200000 },
      monthlyRevenue: { labels: ["Mar", "Apr", "May", "Jun", "Jul", "Aug"], values: [520000, 610000, 700000, 780000, 850000, 890000] },
    },
    "Arugam Bay": {
      kpis: { revenue: 6120000, invoices: 178, avgInvoice: 34382, occupancy: 85 },
      revenueByCategory: { "Accommodation": 3900000, "Food & Beverage": 1250000, "Water Sports & Activities": 720000, "Other": 250000 },
      monthlyRevenue: { labels: ["Mar", "Apr", "May", "Jun", "Jul", "Aug"], values: [700000, 820000, 900000, 980000, 1050000, 1120000] },
    },
  };

  let pieChart = null;
  let lineChart = null;

  function fmtLKR(n) {
    return "LKR " + Math.round(n).toLocaleString("en-US");
  }

  function renderDashboard(branch) {
    const data = DASHBOARD_DATA[branch];
    if (!data) return;

    document.getElementById("kpi-revenue").textContent = fmtLKR(data.kpis.revenue);
    document.getElementById("kpi-invoices").textContent = data.kpis.invoices.toLocaleString("en-US");
    document.getElementById("kpi-avg").textContent = fmtLKR(data.kpis.avgInvoice);
    document.getElementById("kpi-occupancy").textContent = data.kpis.occupancy + "%";
    document.getElementById("dashboard-report-date").textContent = "Generated " + new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    const categoryLabels = Object.keys(data.revenueByCategory);
    const categoryValues = Object.values(data.revenueByCategory);
    const palette = [CHART_COLORS.maroon, CHART_COLORS.gold, CHART_COLORS.teal, CHART_COLORS.tan];

    if (pieChart) pieChart.destroy();
    pieChart = new Chart(document.getElementById("revenue-pie-chart"), {
      type: "doughnut",
      data: {
        labels: categoryLabels,
        datasets: [{ data: categoryValues, backgroundColor: palette, borderColor: "#fff", borderWidth: 2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: 2,
        plugins: { legend: { display: false } },
      },
    });

    const legendEl = document.getElementById("pie-legend");
    legendEl.innerHTML = categoryLabels.map((label, i) => `
      <li><span class="legend-swatch" style="background:${palette[i]}"></span>${escapeHtml(label)}</li>
    `).join("");

    if (lineChart) lineChart.destroy();
    lineChart = new Chart(document.getElementById("revenue-line-chart"), {
      type: "line",
      data: {
        labels: data.monthlyRevenue.labels,
        datasets: [{
          label: "Revenue",
          data: data.monthlyRevenue.values,
          borderColor: CHART_COLORS.maroon,
          backgroundColor: "rgba(74, 14, 28, 0.1)",
          borderWidth: 2.5,
          pointBackgroundColor: CHART_COLORS.gold,
          pointRadius: 4,
          tension: 0.35,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: 2,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: CHART_COLORS.text } },
          y: {
            grid: { color: CHART_COLORS.grid },
            ticks: {
              color: CHART_COLORS.text,
              callback: (v) => (v >= 1000000 ? (v / 1000000) + "M" : (v / 1000) + "K"),
            },
          },
        },
      },
    });
  }

  document.getElementById("open-dashboard-btn").addEventListener("click", () => {
    showScreen("screen-dashboard");
    // Chart.js measures its container's size at construction time, so the
    // screen must already be visible (not display:none) before charts are
    // built, or they get stuck at 0x0.
    requestAnimationFrame(() => renderDashboard(selectedBranch));
  });

  document.getElementById("dashboard-export-btn").addEventListener("click", () => window.print());

  document.getElementById("open-invoice-btn").addEventListener("click", () => {
    resetForm();
    showScreen("screen-form");
  });

  document.getElementById("new-invoice-btn").addEventListener("click", () => {
    resetForm();
    showScreen("screen-form");
  });

  // Multi-step form wizard
  const TOTAL_STEPS = 4;
  const STEP_TITLES = { 1: "Reservation & Guest", 2: "Charges", 3: "Totals", 4: "Final Details" };
  let currentStep = 1;

  const formSteps = [...document.querySelectorAll(".form-step")];
  const stepperItems = [...document.querySelectorAll(".stepper-item")];
  const stepPrevBtn = document.getElementById("step-prev-btn");
  const stepNextBtn = document.getElementById("step-next-btn");
  const generateBtn = document.getElementById("generate-btn");

  function validateStep(step) {
    if (step === 1) {
      const guestName = document.getElementById("guest-name");
      const error = document.getElementById("guest-name-error");
      if (!guestName.value.trim()) {
        error.classList.add("show");
        guestName.classList.add("invalid");
        guestName.focus();
        return false;
      }
      error.classList.remove("show");
      guestName.classList.remove("invalid");
    }
    return true;
  }

  function goToStep(step) {
    if (step > currentStep && !validateStep(currentStep)) return;

    currentStep = Math.min(Math.max(step, 1), TOTAL_STEPS);

    formSteps.forEach(s => s.classList.toggle("active", Number(s.dataset.step) === currentStep));

    stepperItems.forEach(item => {
      const n = Number(item.dataset.step);
      const state = n < currentStep ? "done" : n === currentStep ? "active" : "upcoming";
      item.dataset.state = state;
      item.classList.toggle("line-filled", currentStep > n);
    });
    document.getElementById("step-announce").textContent = `Step ${currentStep} of ${TOTAL_STEPS}: ${STEP_TITLES[currentStep]}`;

    stepPrevBtn.style.display = currentStep === 1 ? "none" : "";
    stepNextBtn.style.display = currentStep === TOTAL_STEPS ? "none" : "";
    generateBtn.style.display = currentStep === TOTAL_STEPS ? "" : "none";

    document.getElementById("screen-form").scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  stepNextBtn.addEventListener("click", () => goToStep(currentStep + 1));
  stepPrevBtn.addEventListener("click", () => goToStep(currentStep - 1));

  document.getElementById("guest-name").addEventListener("input", () => {
    document.getElementById("guest-name-error").classList.remove("show");
    document.getElementById("guest-name").classList.remove("invalid");
  });

  // Enter key on steps 1-3 advances to the next step instead of doing
  // nothing (the real submit button is hidden until the last step)
  document.getElementById("invoice-form").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.tagName === "TEXTAREA") return;
    if (currentStep < TOTAL_STEPS) {
      e.preventDefault();
      goToStep(currentStep + 1);
    }
  });

  function num(id) {
    return parseFloat(document.getElementById(id).value) || 0;
  }

  function val(id) {
    return document.getElementById(id).value.trim();
  }

  // Strip anything that isn't a digit (and, for money fields, a single
  // decimal point) as the user types — blocks letters/words on fields
  // that must stay numeric, without relying on type="number" alone
  // (mobile keyboards can still let stray letters through via paste etc.)
  function sanitizeInteger(e) {
    const input = e.target;
    const cleaned = input.value.replace(/[^0-9]/g, "");
    if (cleaned !== input.value) input.value = cleaned;
  }

  function sanitizeDecimal(e) {
    const input = e.target;
    let cleaned = input.value.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
    if (cleaned !== input.value) input.value = cleaned;
  }

  // Items table
  const itemsBody = document.getElementById("items-body");

  function renumberRows() {
    [...itemsBody.querySelectorAll("tr")].forEach((row, i) => {
      row.querySelector(".col-no").textContent = i + 1;
    });
  }

  function getItems() {
    return [...itemsBody.querySelectorAll("tr")].map((row, i) => {
      const desc = row.querySelector(".item-desc").value.trim();
      const qty = row.querySelector(".item-qty").value.trim();
      const rate = parseFloat(row.querySelector(".item-rate").value) || 0;
      const value = parseFloat(row.querySelector(".item-value").value) || 0;
      return { no: i + 1, desc, qty, rate, value };
    }).filter(it => it.desc || it.qty || it.rate || it.value);
  }

  function computeTotals() {
    const billTotal = getItems().reduce((sum, it) => sum + it.value, 0);
    const serviceCharge = num("service-charge");
    const advance = num("advance");
    const grossAmount = billTotal + serviceCharge;
    const grandTotal = grossAmount - advance;
    return { billTotal, serviceCharge, advance, grossAmount, grandTotal };
  }

  function updateLiveTotals() {
    const { billTotal, serviceCharge, advance, grossAmount, grandTotal } = computeTotals();
    const currency = val("currency") || "LKR";
    document.getElementById("live-bill-total").textContent = fmt(billTotal, currency);
    document.getElementById("live-service-charge").textContent = fmt(serviceCharge, currency);
    document.getElementById("live-gross").textContent = fmt(grossAmount, currency);
    document.getElementById("live-advance").textContent = fmt(advance, currency);
    document.getElementById("live-grand").textContent = fmt(grandTotal, currency);
  }

  function addItemRow(desc = "", qty = "", rate = "", value = "") {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="col-no"></td>
      <td class="col-desc" data-label="Description"><input type="text" class="item-desc" placeholder="e.g. Luxury Chalet with private pool (FB)" value="${desc}"></td>
      <td class="col-qty" data-label="Qty"><input type="text" class="item-qty" placeholder="e.g. 2 nights" value="${qty}"></td>
      <td class="col-price" data-label="Rate (LKR)"><input type="number" class="item-rate" min="0" step="0.01" inputmode="decimal" value="${rate}"></td>
      <td class="col-total" data-label="Value"><input type="number" class="item-value" min="0" step="0.01" inputmode="decimal" value="${value}"></td>
      <td class="col-del"><button type="button" class="row-del-btn" title="Remove item">✕</button></td>
    `;
    itemsBody.appendChild(row);

    const qtyInput = row.querySelector(".item-qty");
    const rateInput = row.querySelector(".item-rate");
    const valueInput = row.querySelector(".item-value");

    rateInput.addEventListener("input", sanitizeDecimal);
    valueInput.addEventListener("input", sanitizeDecimal);

    function autoFillValue() {
      const qtyNum = parseFloat(qtyInput.value);
      const rateNum = parseFloat(rateInput.value) || 0;
      if (!isNaN(qtyNum) && qtyInput.value.trim() === String(qtyNum)) {
        valueInput.value = (qtyNum * rateNum).toFixed(2);
      }
      updateLiveTotals();
    }

    qtyInput.addEventListener("input", autoFillValue);
    rateInput.addEventListener("input", autoFillValue);
    valueInput.addEventListener("input", updateLiveTotals);

    row.querySelector(".row-del-btn").addEventListener("click", () => {
      row.remove();
      renumberRows();
      updateLiveTotals();
    });

    renumberRows();
    updateLiveTotals();
  }

  document.getElementById("add-item-btn").addEventListener("click", () => addItemRow());

  document.getElementById("guest-count").addEventListener("input", sanitizeInteger);
  ["service-charge", "advance"].forEach(id => {
    document.getElementById(id).addEventListener("input", sanitizeDecimal);
  });
  ["service-charge", "advance", "currency"].forEach(id => {
    document.getElementById(id).addEventListener("input", updateLiveTotals);
  });

  // Guest count +/- stepper
  const guestCountInput = document.getElementById("guest-count");
  document.getElementById("guest-count-minus").addEventListener("click", () => {
    guestCountInput.value = Math.max(0, (parseInt(guestCountInput.value, 10) || 0) - 1);
  });
  document.getElementById("guest-count-plus").addEventListener("click", () => {
    guestCountInput.value = (parseInt(guestCountInput.value, 10) || 0) + 1;
  });

  function resetForm() {
    document.getElementById("invoice-form").reset();
    itemsBody.innerHTML = "";
    addItemRow();
    document.getElementById("inv-number").value = String(invoiceCounter);
    document.getElementById("inv-date").value = new Date().toISOString().slice(0, 10);
    document.getElementById("currency").value = "LKR";
    document.getElementById("guest-name-error").classList.remove("show");
    document.getElementById("guest-name").classList.remove("invalid");
    updateLiveTotals();
    currentStep = 1;
    goToStep(1);
  }

  // Form submit -> build preview
  document.getElementById("invoice-form").addEventListener("submit", (e) => {
    e.preventDefault();

    const items = getItems();
    const { billTotal, serviceCharge, advance, grossAmount, grandTotal } = computeTotals();

    // Header
    document.getElementById("prev-branch").textContent = selectedBranchLabel;
    document.getElementById("prev-number").textContent = val("inv-number");
    document.getElementById("prev-date").textContent = formatDate(document.getElementById("inv-date").value);

    // Guest details
    document.getElementById("prev-guest-name").textContent = val("guest-name") || "-";
    document.getElementById("prev-guest-count").textContent = val("guest-count") || "-";
    document.getElementById("prev-guest-phone").textContent = val("guest-phone") || "-";
    document.getElementById("prev-reg-card").textContent = val("reg-card-no") || "N/A";
    document.getElementById("prev-voucher").textContent = val("voucher-no") || "N/A";
    document.getElementById("prev-checkin").textContent = formatDate(document.getElementById("checkin-date").value);
    document.getElementById("prev-checkout").textContent = formatDate(document.getElementById("checkout-date").value);

    // Items
    const itemsBodyPrev = document.getElementById("prev-items-body");
    itemsBodyPrev.innerHTML = items.map(it => `
      <tr>
        <td>${it.no}</td>
        <td>${escapeHtml(it.desc)}</td>
        <td>${escapeHtml(it.qty)}</td>
        <td>${it.rate ? it.rate.toFixed(2) : ""}</td>
        <td>${it.value ? it.value.toFixed(2) : "-"}</td>
      </tr>
    `).join("");

    // Totals
    const currency = val("currency") || "LKR";
    document.getElementById("prev-currency").textContent = currency;
    document.getElementById("prev-bill-total").textContent = fmt(billTotal, currency);
    document.getElementById("prev-service-charge").textContent = fmt(serviceCharge, currency);
    document.getElementById("prev-gross").textContent = fmt(grossAmount, currency);
    document.getElementById("prev-advance").textContent = fmt(advance, currency);
    document.getElementById("prev-total").textContent = fmt(grandTotal, currency);

    // Remark + signature
    const notes = document.getElementById("notes").value.trim();
    document.getElementById("prev-notes").textContent = notes || "-";
    document.getElementById("prev-staff").textContent = val("staff-name") || "";

    invoiceCounter++;
    localStorage.setItem("leopardinn-invoice-counter", String(invoiceCounter));

    // If this invoice came from a Room Map checkout, the villa is free again.
    if (checkoutRoomRef) {
      const room = ROOMS_BY_BRANCH[checkoutRoomRef.branch][checkoutRoomRef.index];
      room.status = "available";
      delete room.guest;
      delete room.phone;
      delete room.checkin;
      delete room.checkout;
      checkoutRoomRef = null;
    }

    showScreen("screen-preview");
  });

  function fmt(n, currency) {
    return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value + "T00:00:00");
    if (isNaN(d)) return value;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Export actions
  document.getElementById("print-btn").addEventListener("click", () => window.print());

  document.getElementById("image-btn").addEventListener("click", () => {
    const target = document.getElementById("invoice-preview");
    const hint = target.querySelector(".scroll-hint");
    if (hint) hint.style.visibility = "hidden";

    html2canvas(target, { scale: 2, backgroundColor: "#ffffff" }).then(canvas => {
      if (hint) hint.style.visibility = "";
      const link = document.createElement("a");
      const invNum = document.getElementById("prev-number").textContent || "invoice";
      link.download = `LeopardInn-${invNum}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  });

  // init
  resetForm();

  // Restore a logged-in session (skip login, and skip the branch picker
  // too if the account is locked to one branch). Runs last so every
  // const/function above it (ROOMS_BY_BRANCH, selectBranch, etc.) is
  // already initialized — calling this earlier throws a temporal-dead-
  // zone error on the later const declarations.
  if (localStorage.getItem(LOGIN_KEY) === "true") {
    applyRoleGates();
    const lockedBranch = localStorage.getItem(LOCKED_BRANCH_KEY);
    document.getElementById("screen-login").classList.remove("active");
    if (lockedBranch) {
      selectBranch(lockedBranch);
      document.getElementById("screen-home").classList.add("active");
    } else {
      document.getElementById("screen-branch").classList.add("active");
    }
  }
})();
