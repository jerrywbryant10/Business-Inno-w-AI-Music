// SongForge frontend. Talks only to our own Netlify Functions (/api/*);
// the SunoAPI key never reaches the browser.

const $ = (sel, root = document) => root.querySelector(sel);
const STORE_KEY = "songforge.jobs.v1";
const PW_KEY = "songforge.pw";
const POLL_MS = 6000;
const MAX_POLL_MS = 15 * 60 * 1000;
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000; // SunoAPI keeps files 14 days

const IDEAS = [
  "Lo-fi hip hop beat for late night studying, vinyl crackle, mellow keys",
  "Epic orchestral trailer music with thundering drums and choir",
  "Upbeat 80s synth-pop song about falling in love at an arcade",
  "Acoustic folk ballad about leaving your hometown, warm male vocals",
  "High-energy EDM festival anthem with a massive drop",
];
const STYLES = ["pop", "hip hop", "lo-fi", "rock", "r&b", "edm", "country", "jazz", "cinematic", "afrobeats", "synthwave", "acoustic"];
const VARIETY = ["Off", "Normal", "High", "Extra", "Max"];
const WORKING = { PENDING: "Queued", TEXT_SUCCESS: "Writing", FIRST_SUCCESS: "Rendering", GENERATING: "Generating" };

let mode = "simple";
let jobs = loadJobs();
const polling = new Set();

// ---------- storage ----------
function loadJobs() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(list) ? list.filter((j) => Date.now() - j.createdAt < RETENTION_MS) : [];
  } catch {
    return [];
  }
}
function saveJobs() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(jobs.slice(0, 100))); } catch {}
}
function getPw() { try { return localStorage.getItem(PW_KEY) || ""; } catch { return ""; } }
function setPw(v) { try { localStorage.setItem(PW_KEY, v); } catch {} }

// ---------- api ----------
async function api(path, options = {}, retried = false) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", "x-app-password": getPw(), ...(options.headers || {}) },
  });
  let body = {};
  try { body = await res.json(); } catch {}
  if (res.status === 401 && body.needsPassword && !retried) {
    await askPassword();
    return api(path, options, true);
  }
  if (!res.ok || body.error) throw new Error(body.error || `Request failed (HTTP ${res.status})`);
  return body.data;
}

function askPassword() {
  const dlg = $("#pwDialog");
  const input = $("#pwInput");
  input.value = "";
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => { setPw(input.value.trim()); resolve(); }, { once: true });
    dlg.showModal();
    input.focus();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- credits ----------
async function refreshCredits() {
  const el = $("#credits");
  try {
    const credits = await api("/api/credits");
    $("#creditsValue").textContent = Number(credits).toLocaleString();
    el.classList.toggle("ok", credits >= 50);
    el.classList.toggle("low", credits < 50);
  } catch {
    $("#creditsValue").textContent = "—";
  }
}

// ---------- form ----------
function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.mode === next;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
  });
  $(".mode.simple").classList.toggle("hidden", next !== "simple");
  $(".mode.custom").classList.toggle("hidden", next !== "custom");
}

function syncInstrumental() {
  const inst = $("#instrumental").checked;
  $("#lyrics").disabled = inst;
  $("#lyrics").placeholder = inst ? "Instrumental — no lyrics needed" : "[Verse]\nCity lights are fading slow\n\n[Chorus]\n...";
  $("#aiLyricsBtn").classList.toggle("hidden", inst);
}

function readForm() {
  const base = { customMode: mode === "custom", instrumental: $("#instrumental").checked, model: $("#model").value };
  if (mode === "simple") return { ...base, prompt: $("#prompt").value };
  return {
    ...base,
    title: $("#title").value,
    style: $("#style").value,
    lyrics: $("#lyrics").value,
    negativeTags: $("#negativeTags").value,
    vocalGender: $("#vocalGender").value,
    duration: $("#duration").value || undefined,
    styleWeight: $("#styleWeight").value,
    weirdnessConstraint: $("#weirdness").value,
    variety: $("#variety").value,
  };
}

function labelFor(input) {
  if (!input.customMode) return input.prompt.trim();
  return input.title.trim() || input.style.trim() || "Untitled song";
}

async function onSubmit(e) {
  e.preventDefault();
  const err = $("#formError");
  err.textContent = "";
  const input = readForm();

  if (!input.customMode && !input.prompt.trim()) return (err.textContent = "Describe the song you want first.");
  if (input.customMode && !input.style.trim() && !input.lyrics.trim() && !input.negativeTags.trim()) {
    return (err.textContent = "Add a style of music or some lyrics.");
  }

  const btn = $("#submitBtn");
  btn.disabled = true;
  $(".btn-label", btn).textContent = "Submitting…";
  try {
    const data = await api("/api/generate", { method: "POST", body: JSON.stringify(input) });
    const job = {
      taskId: data.taskId,
      label: labelFor(input),
      model: input.model,
      instrumental: input.instrumental,
      createdAt: Date.now(),
      status: "PENDING",
      tracks: [],
    };
    jobs.unshift(job);
    saveJobs();
    render();
    pollJob(job);
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
    $(".btn-label", btn).textContent = "Create";
  }
}

// ---------- polling ----------
const isFailed = (s) => /FAIL|ERROR|EXCEPTION/.test(s || "");

function extractTracks(data) {
  const list = data?.response?.sunoData || data?.response?.data || [];
  return list.map((t) => ({
    id: t.id,
    title: t.title,
    tags: t.tags,
    image: t.image_url || t.source_image_url || "",
    audio: t.audio_url || "",
    stream: t.stream_audio_url || t.source_stream_audio_url || "",
    duration: t.duration,
    lyrics: t.prompt,
  }));
}

async function pollJob(job) {
  if (polling.has(job.taskId)) return;
  polling.add(job.taskId);
  const started = Date.now();
  try {
    while (Date.now() - started < MAX_POLL_MS) {
      try {
        const data = await api(`/api/status?taskId=${encodeURIComponent(job.taskId)}`);
        job.status = data.status || job.status;
        const tracks = extractTracks(data);
        if (tracks.length) job.tracks = tracks;
        if (isFailed(job.status)) job.error = data.errorMessage || friendlyStatus(job.status);
        saveJobs();
        render();
        if (job.status === "SUCCESS" || isFailed(job.status)) break;
      } catch (ex) {
        // transient network/rate-limit errors: keep trying
        console.warn("poll error", ex);
      }
      await sleep(POLL_MS);
    }
    if (job.status !== "SUCCESS" && !isFailed(job.status)) {
      job.status = "TIMEOUT";
      job.error = "Took longer than expected. Refresh later to check again.";
      saveJobs();
      render();
    }
  } finally {
    polling.delete(job.taskId);
    if (job.status === "SUCCESS") refreshCredits();
  }
}

function friendlyStatus(s) {
  return {
    CREATE_TASK_FAILED: "The task could not be created.",
    GENERATE_AUDIO_FAILED: "Audio generation failed. Try a different prompt.",
    SENSITIVE_WORD_ERROR: "Your prompt contains words that aren't allowed. Please rephrase.",
    CALLBACK_EXCEPTION: "Generation hit an error. Please try again.",
  }[s] || "Generation failed.";
}

// ---------- AI lyrics ----------
async function generateLyrics() {
  const prompt = $("#lyricsPrompt").value.trim();
  const err = $("#formError");
  err.textContent = "";
  if (!prompt) return (err.textContent = "Tell the AI what the lyrics should be about.");
  const btn = $("#lyricsGo");
  btn.disabled = true;
  btn.textContent = "Writing…";
  try {
    const { taskId } = await api("/api/lyrics", { method: "POST", body: JSON.stringify({ prompt }) });
    const started = Date.now();
    while (Date.now() - started < 3 * 60 * 1000) {
      await sleep(4000);
      const data = await api(`/api/status?type=lyrics&taskId=${encodeURIComponent(taskId)}`);
      if (isFailed(data.status)) throw new Error(data.errorMessage || friendlyStatus(data.status));
      const options = (data.response?.data || []).filter((d) => d.text && d.status !== "failed");
      if (data.status === "SUCCESS" && options.length) {
        const pick = options[0];
        $("#lyrics").value = pick.text;
        if (!$("#title").value.trim() && pick.title) $("#title").value = pick.title.slice(0, 80);
        $("#aiLyricsBox").classList.add("hidden");
        refreshCredits();
        return;
      }
    }
    throw new Error("Lyrics are taking too long. Please try again.");
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate";
  }
}

// ---------- rendering ----------
function fmtDuration(sec) {
  if (!sec) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function render() {
  const root = $("#jobs");
  root.replaceChildren();
  $("#empty").classList.toggle("hidden", jobs.length > 0);
  $("#clearBtn").classList.toggle("hidden", jobs.length === 0);

  for (const job of jobs) {
    const el = $("#jobTpl").content.firstElementChild.cloneNode(true);
    const done = job.status === "SUCCESS";
    const failed = isFailed(job.status) || job.status === "TIMEOUT";
    el.classList.toggle("finished", done || failed);
    $(".job-title", el).textContent = job.label;
    $(".job-meta", el).textContent = [job.model?.replace("_", " "), job.instrumental ? "Instrumental" : null, timeAgo(job.createdAt)]
      .filter(Boolean).join(" · ");
    const badge = $(".badge", el);
    badge.textContent = done ? "Ready" : failed ? "Failed" : WORKING[job.status] || "Working";
    badge.className = `badge ${done ? "done" : failed ? "failed" : "working"}`;
    $(".job-error", el).textContent = failed ? job.error || "" : "";

    const tracksEl = $(".tracks", el);
    for (const t of job.tracks || []) tracksEl.append(renderTrack(t));
    root.append(el);
  }
  highlightPlaying();
}

function renderTrack(t) {
  const el = $("#trackTpl").content.firstElementChild.cloneNode(true);
  el.dataset.trackId = t.id;
  const img = $(".cover img", el);
  if (t.image) img.src = t.image;
  $(".track-title", el).textContent = t.title || "Untitled";
  $(".track-tags", el).textContent = t.tags || "";
  $(".dur", el).textContent = t.audio ? fmtDuration(t.duration) : t.stream ? "streaming…" : "rendering…";

  const dl = $(".dl", el);
  if (t.audio) {
    dl.href = t.audio;
    dl.setAttribute("download", `${(t.title || "song").replace(/[^\w\- ]+/g, "")}.mp3`);
  } else {
    dl.classList.add("disabled");
    dl.textContent = "Preparing MP3…";
  }

  const lyrBtn = $(".lyr", el);
  const lyrEl = $(".track-lyrics", el);
  if (t.lyrics && t.lyrics.trim()) {
    lyrEl.textContent = t.lyrics;
    lyrBtn.addEventListener("click", () => lyrEl.classList.toggle("hidden"));
  } else {
    lyrBtn.remove();
  }

  const playable = t.audio || t.stream;
  const cover = $(".cover", el);
  if (!playable) cover.disabled = true;
  cover.addEventListener("click", () => playTrack(t));
  return el;
}

let current = null;
function playTrack(t) {
  const audio = $("#audio");
  const src = t.audio || t.stream;
  if (!src) return;
  if (current?.id === t.id && !audio.paused) {
    audio.pause();
    return;
  }
  if (current?.id !== t.id || audio.src !== src) audio.src = src;
  current = t;
  $("#player").classList.remove("hidden");
  $("#playerTitle").textContent = t.title || "Untitled";
  $("#playerTags").textContent = t.tags || "";
  const cover = $("#playerCover");
  if (t.image) cover.src = t.image; else cover.removeAttribute("src");
  audio.play().catch(() => {});
  highlightPlaying();
}
function highlightPlaying() {
  document.querySelectorAll(".track").forEach((el) => {
    const on = current && el.dataset.trackId === current.id && !$("#audio").paused;
    el.classList.toggle("playing", Boolean(on));
    $(".play", el).textContent = on ? "❚❚" : "▶";
  });
}

// ---------- init ----------
function initChips() {
  const ideas = $("#ideaChips");
  for (const idea of IDEAS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = idea.split(",")[0];
    b.title = idea;
    b.addEventListener("click", () => { $("#prompt").value = idea; });
    ideas.append(b);
  }
  const styles = $("#styleChips");
  for (const s of STYLES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = s;
    b.addEventListener("click", () => {
      const field = $("#style");
      const parts = field.value.split(",").map((p) => p.trim()).filter(Boolean);
      if (!parts.includes(s)) parts.push(s);
      field.value = parts.join(", ");
    });
    styles.append(b);
  }
}

function init() {
  initChips();
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));
  $("#form").addEventListener("submit", onSubmit);
  $("#instrumental").addEventListener("change", syncInstrumental);
  $("#aiLyricsBtn").addEventListener("click", () => {
    $("#aiLyricsBox").classList.toggle("hidden");
    $("#lyricsPrompt").focus();
  });
  $("#lyricsGo").addEventListener("click", generateLyrics);
  $("#lyricsPrompt").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); generateLyrics(); } });

  const bindRange = (id, outId, fmt) => {
    const r = $(id), o = $(outId);
    const upd = () => (o.textContent = fmt(r.value));
    r.addEventListener("input", upd);
    upd();
  };
  bindRange("#styleWeight", "#styleWeightOut", (v) => Number(v).toFixed(2));
  bindRange("#weirdness", "#weirdnessOut", (v) => Number(v).toFixed(2));
  bindRange("#variety", "#varietyOut", (v) => VARIETY[v]);

  $("#clearBtn").addEventListener("click", () => {
    if (!confirm("Remove all songs from this list? (Files stay on SunoAPI for 14 days.)")) return;
    jobs = [];
    saveJobs();
    render();
  });

  const audio = $("#audio");
  ["play", "pause", "ended"].forEach((ev) => audio.addEventListener(ev, highlightPlaying));

  syncInstrumental();
  render();

  fetch("/api/config")
    .then((r) => r.json())
    .then(async (cfg) => {
      if (cfg.passwordRequired && !getPw()) await askPassword();
    })
    .catch(() => {})
    .finally(() => {
      refreshCredits();
      // Resume any jobs that were still running (or lacked final MP3s) when the page was closed.
      for (const job of jobs) {
        const missingMp3 = job.status === "SUCCESS" && job.tracks.some((t) => !t.audio);
        if ((job.status !== "SUCCESS" && !isFailed(job.status)) || missingMp3) {
          if (job.status === "TIMEOUT" || missingMp3) { job.status = "PENDING"; job.error = ""; }
          pollJob(job);
        }
      }
    });
}

init();
