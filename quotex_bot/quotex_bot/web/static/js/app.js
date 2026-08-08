"use strict";

const $ = (id) => document.getElementById(id);

/* ---------- Chart Analyst ---------- */
const dropzone = $("dropzone");
const fileInput = $("file-input");
const preview = $("preview");
const analyzeBtn = $("analyze-btn");

let currentImage = null;

function openPicker() { fileInput.click(); }
dropzone.addEventListener("click", openPicker);
fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) showImage(fileInput.files[0]);
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("drag");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag");
  if (e.dataTransfer.files && e.dataTransfer.files[0]) showImage(e.dataTransfer.files[0]);
});

function showImage(file) {
  if (!file.type.startsWith("image/")) return;
  currentImage = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.src = e.target.result;
    preview.classList.remove("hidden");
    $("dz-empty").classList.add("hidden");
    analyzeBtn.disabled = false;
    $("verdict").classList.add("hidden");
  };
  reader.readAsDataURL(file);
}

analyzeBtn.addEventListener("click", async () => {
  if (!currentImage) return;
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analyzing…";
  try {
    const fd = new FormData();
    fd.append("image", currentImage);
    const res = await fetch("/api/analyze", { method: "POST", body: fd });
    const data = await res.json();
    renderVerdict(data);
  } catch (err) {
    renderVerdict({ ok: false, error: "Network error: " + err.message });
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analyze chart";
  }
});

function renderVerdict(data) {
  const v = $("verdict");
  v.classList.remove("hidden");
  const arrow = $("v-arrow");
  const dir = $("v-dir");
  const reasons = $("v-reasons");
  $("v-disclaimer").textContent = data.disclaimer || "";

  if (!data.ok) {
    arrow.textContent = "?";
    arrow.className = "v-arrow flat";
    dir.textContent = "No read";
    $("v-conf").textContent = "";
    $("meter-fill").style.width = "0";
    reasons.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = data.error;
    reasons.appendChild(li);
    return;
  }

  const d = data.direction;
  arrow.textContent = d === "UP" ? "↑" : d === "DOWN" ? "↓" : "→";
  arrow.className = "v-arrow " + (d === "UP" ? "up" : d === "DOWN" ? "down" : "flat");
  dir.textContent = d;
  $("v-conf").textContent = data.confidence + "% confidence · " + data.candles_detected + " candles read";
  $("meter-fill").style.width = data.confidence + "%";
  reasons.innerHTML = "";
  (data.reasons || []).forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r;
    reasons.appendChild(li);
  });
}

/* ---------- Auto Trader ---------- */
$("start-btn").addEventListener("click", () => botAction("/api/bot/start"));
$("mock-btn").addEventListener("click", () => botAction("/api/bot/start", { mock: true }));
$("stop-btn").addEventListener("click", () => botAction("/api/bot/stop"));

async function botAction(url, body) {
  const msg = $("trad-msg");
  msg.textContent = "…";
  msg.className = "msg";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json();
    msg.textContent = data.message;
    msg.className = "msg " + (data.ok ? "ok" : "err");
  } catch (err) {
    msg.textContent = "Error: " + err.message;
    msg.className = "msg err";
  }
}

function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}
function fmtUptime(sec) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return (h ? h + "h " : "") + (m ? m + "m " : "") + s + "s";
}

async function pollStatus() {
  try {
    const st = await (await fetch("/api/bot/status")).json();
    const on = st.running;
    const dot = $("bot-dot");
    dot.className = "dot " + (on ? "on" : st.error ? "off" : "");
    $("bot-state").textContent = st.error ? "error" : on ? "running" : "idle";
    $("trad-dot").className = "dot " + (on ? "on" : "off");
    $("trad-state").textContent = st.error ? "error" : on ? "running" : "idle";
    $("trad-mode").textContent = st.mode + (on ? "" : "");
    $("trad-balance").textContent = st.balance != null ? st.balance.toLocaleString() : "—";
    $("trad-uptime").textContent = fmtUptime(st.uptime);
    $("balance").textContent = st.balance != null ? st.balance.toLocaleString() : "—";
    $("start-btn").disabled = on;
    $("mock-btn").disabled = on;
    $("stop-btn").disabled = !on;
    if (st.error) $("trad-msg").textContent = st.error;
  } catch (_) { /* server briefly down */ }
}

/* ---------- Stats ---------- */
function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s == null ? "" : s);
  return d.innerHTML;
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

async function pollStats() {
  let data;
  try {
    data = await (await fetch("/api/stats")).json();
  } catch (_) { return; }

  $("s-total").textContent = data.total_trades;
  $("s-wins").textContent = data.wins;
  $("s-losses").textContent = data.losses;
  $("s-rate").textContent = data.win_rate + "%";
  const pnlEl = $("s-pnl");
  pnlEl.textContent = (data.pnl >= 0 ? "+" : "") + data.pnl.toFixed(2);
  pnlEl.className = "b-num " + (data.pnl > 0 ? "win" : data.pnl < 0 ? "loss" : "");

  /* today's mini-stats */
  const tk = todayKey();
  const today = (data.daily || []).find((r) => r.day === tk) || {};
  $("m-today-trades").textContent = today.trades || 0;
  $("m-today-win").textContent = today.wins || 0;
  $("m-today-loss").textContent = today.losses || 0;
  const tp = parseFloat(today.pnl || 0);
  const tpEl = $("m-today-pnl");
  tpEl.textContent = (tp >= 0 ? "+" : "") + tp.toFixed(2);
  tpEl.className = "m-num " + (tp > 0 ? "win" : tp < 0 ? "loss" : "");

  /* recent trades table */
  const tbody = $("tbl-recent");
  tbody.innerHTML = "";
  (data.recent || []).forEach((t) => {
    const dir = t.direction || "";
    const res = t.result || "";
    const pnl = parseFloat(t.pnl || 0);
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + esc(t.time || fmtTime(parseInt(t.id || 0))) + "</td>" +
      "<td>" + esc(t.pair) + "</td>" +
      "<td class='" + (dir === "BUY" || dir === "CALL" ? "win" : dir === "SELL" || dir === "PUT" ? "loss" : "") + "'>" + esc(dir) + "</td>" +
      "<td>" + esc(t.amount) + "</td>" +
      "<td><span class='tag " + (res === "WIN" ? "win" : res === "LOSS" ? "loss" : "") + "'>" + esc(res || "…") + "</span></td>" +
      "<td class='" + (pnl > 0 ? "win" : pnl < 0 ? "loss" : "") + "'>" + (pnl > 0 ? "+" : "") + pnl.toFixed(2) + "</td>";
    tbody.appendChild(tr);
  });

  /* daily table */
  const dtbody = $("tbl-daily");
  dtbody.innerHTML = "";
  (data.daily || []).forEach((r) => {
    const pnl = parseFloat(r.pnl || 0);
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + esc(r.day) + "</td>" +
      "<td>" + esc(r.trades) + "</td>" +
      "<td class='win'>" + esc(r.wins) + "</td>" +
      "<td class='loss'>" + esc(r.losses) + "</td>" +
      "<td class='" + (pnl > 0 ? "win" : pnl < 0 ? "loss" : "") + "'>" + (pnl > 0 ? "+" : "") + pnl.toFixed(2) + "</td>";
    dtbody.appendChild(tr);
  });

  /* learned situations */
  const exp = data.experience || {};
  const slots = exp.slots || {};
  const keys = Object.keys(slots);
  const ltbody = $("tbl-learned");
  $("learned-empty").style.display = keys.length ? "none" : "block";
  ltbody.innerHTML = "";
  keys.slice(0, 25).forEach((k) => {
    const s = slots[k];
    const rate = s.trades ? Math.round(100 * s.wins / s.trades) : 0;
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + esc(k) + "</td>" +
      "<td>" + esc(s.trades) + "</td>" +
      "<td>" + rate + "%</td>" +
      "<td>" + (s.pnl >= 0 ? "+" : "") + Number(s.pnl).toFixed(2) + "</td>";
    ltbody.appendChild(tr);
  });
}

/* tabs */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $("pane-" + tab.dataset.tab).classList.add("active");
  });
});

pollStatus();
pollStats();
setInterval(pollStatus, 3000);
setInterval(pollStats, 5000);
