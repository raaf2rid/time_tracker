const state = {
  screen: "home",
  focusDate: null,
  mode: "day"
};

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

function labelForDay(dayString) {
  return new Date(`${dayString}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function shortDay(dayString) {
  return new Date(`${dayString}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short"
  });
}

function shiftDay(dayString, offsetDays) {
  const d = new Date(`${dayString}T00:00:00`);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setScreen(name) {
  state.screen = name;
  document.getElementById("homeScreen").classList.toggle("active", name === "home");
  document.getElementById("detailsScreen").classList.toggle("active", name === "details");
}

function renderHome(view) {
  document.getElementById("homeDate").textContent = labelForDay(view.day);
  document.getElementById("homeUp").textContent = formatDuration(view.upSeconds);
  document.getElementById("homeActive").textContent = formatDuration(view.activeSeconds);
  document.getElementById("homeIdle").textContent = formatDuration(view.idleSeconds);
  const activePct = Math.round((view.activeRatio || 0) * 100);
  const idlePct = Math.max(0, 100 - activePct);
  document.getElementById("homeActivePct").textContent = `${activePct}%`;
  document.getElementById("homeIdlePct").textContent = `${idlePct}%`;

  const deg = Math.max(0, Math.min(360, Math.round((view.activeRatio || 0) * 360)));
  document.getElementById("donut").style.setProperty("--activeDeg", `${deg}deg`);
}

function renderModes() {
  for (const btn of document.querySelectorAll(".mode-btn")) {
    btn.classList.toggle("active", btn.dataset.mode === state.mode);
  }
}

function renderChart(details) {
  const chart = document.getElementById("barChart");
  chart.innerHTML = "";

  const max = details.bars.reduce((acc, x) => Math.max(acc, x.upSeconds), 0);
  if (!details.bars.length || max <= 0) {
    chart.innerHTML = "<p class=\"sub\">No graph data yet for this range.</p>";
    return;
  }

  for (const row of details.bars) {
    const idlePct = (row.idleSeconds / max) * 100;
    const activePct = (row.activeSeconds / max) * 100;

    const col = document.createElement("div");
    col.className = `bar-col${row.selected ? " selected" : ""}`;
    col.innerHTML = `
      <div class="bar-stack">
        <div class="bar-idle" style="height:${idlePct}%;"></div>
        <div class="bar-active" style="height:${activePct}%;"></div>
      </div>
      <span>${details.granularity === "day" ? shortDay(row.key) : row.key.slice(5)}</span>
    `;
    chart.appendChild(col);
  }
}

function renderAppList(details) {
  const target = document.getElementById("appList");
  target.innerHTML = "";

  if (!details.appList || !details.appList.length) {
    target.innerHTML = "<li>Per-app tracking will appear here in the next step.</li>";
    return;
  }

  for (const app of details.appList) {
    const li = document.createElement("li");
    li.textContent = `${app.name} - ${formatDuration(app.seconds)}`;
    target.appendChild(li);
  }
}

function renderDetails(details) {
  document.getElementById("detailsDate").textContent = labelForDay(details.focusDate);
  document.getElementById("detailsUp").textContent = formatDuration(details.summary.upSeconds);
  document.getElementById("detailsActive").textContent = formatDuration(details.summary.activeSeconds);
  document.getElementById("detailsIdle").textContent = formatDuration(details.summary.idleSeconds);

  renderModes();
  renderChart(details);
  renderAppList(details);
}

async function refreshHome() {
  const view = await window.trackerApi.getHomeView(state.focusDate);
  if (!state.focusDate) {
    state.focusDate = view.day;
  }
  renderHome(view);
}

async function refreshDetails() {
  const details = await window.trackerApi.getDetailsView({
    focusDate: state.focusDate,
    granularity: state.mode
  });
  state.focusDate = details.focusDate;
  renderDetails(details);
}

function bindEvents() {
  document.getElementById("openDetailsBtn").addEventListener("click", async () => {
    setScreen("details");
    await refreshDetails();
  });

  document.getElementById("backBtn").addEventListener("click", async () => {
    setScreen("home");
    await refreshHome();
  });

  for (const btn of document.querySelectorAll(".mode-btn")) {
    btn.addEventListener("click", async () => {
      state.mode = btn.dataset.mode;
      await refreshDetails();
    });
  }

  document.getElementById("prevBtn").addEventListener("click", async () => {
    const step = state.mode === "week" ? -7 : -1;
    state.focusDate = shiftDay(state.focusDate, step);
    await refreshDetails();
  });

  document.getElementById("nextBtn").addEventListener("click", async () => {
    const step = state.mode === "week" ? 7 : 1;
    state.focusDate = shiftDay(state.focusDate, step);
    await refreshDetails();
  });
}

async function init() {
  bindEvents();
  await refreshHome();

  setInterval(() => {
    if (state.screen === "home") {
      refreshHome();
    } else {
      refreshDetails();
    }
  }, 15000);
}

init();
