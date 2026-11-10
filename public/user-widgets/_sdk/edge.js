/*
 * Edge Studio — SDK des widgets perso.
 * Chargé par <script src="../_sdk/edge.js"></script> dans le index.html d'un widget.
 *
 *   Edge.on("settings", s => …)   réglages du widget (au démarrage puis à chaque modification)
 *   Edge.on("size", s => …)        taille en cellules { w, h }
 *   Edge.on("theme", t => …)       { accent, background } (appliqué aussi aux variables CSS)
 *   Edge.on("editing", b => …)     vrai pendant le mode édition
 *   Edge.on("system", s => …)      { cpu, cpuPerCore, memUsed, memTotal, uptime, hostname } chaque seconde
 *   Edge.on("media", m => …)       lecture en cours { title, artist, album, playing, position, duration, thumbnail, source } ou null
 *   Edge.on("sensors", list => …)  capteurs LibreHardwareMonitor [{ path, name, value, unit }]
 *
 *   Edge.open("https://…" | "C:\\…\\app.exe" | "steam://…")
 *   Edge.keys("ctrl+shift+m")      Edge.command("…")      Edge.media("play_pause" | "next" | …)
 *   Edge.page(0)                   Edge.setSettings({ cle: valeur })
 * Toutes les actions renvoient une promesse (rejetée en cas d'échec).
 * Les erreurs JavaScript non rattrapées s'affichent en bas du widget.
 * Guide complet : docs/widgets-perso.md
 */
(() => {
  const listeners = {};
  const state = {};
  const pending = new Map();
  let seq = 0;
  const DATA_TOPICS = ["system", "media", "sensors"];
  const post = (msg) => parent.postMessage(Object.assign({ edge: 1 }, msg), "*");

  const applyTheme = (t) => {
    const s = document.documentElement.style;
    if (t && t.accent) s.setProperty("--accent", t.accent);
    if (t && t.background) s.setProperty("--bg", t.background);
  };

  addEventListener("message", (e) => {
    if (e.source !== parent) return;
    const m = e.data;
    if (!m || m.edge !== 1) return;
    if (m.type === "event") {
      state[m.topic] = m.data;
      if (m.topic === "theme") applyTheme(m.data);
      if (m.topic === "editing") document.documentElement.classList.toggle("is-editing", !!m.data);
      (listeners[m.topic] || []).forEach((fn) => {
        try { fn(m.data); } catch (err) { console.error("[Edge]", err); }
      });
    } else if (m.type === "result") {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.ok ? p.resolve() : p.reject(new Error(m.error || "action refusée"));
    }
  });

  const request = (action) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      post({ type: "action", id, action });
    });

  window.Edge = {
    get settings() { return state.settings || {}; },
    get size() { return state.size || { w: 1, h: 1 }; },
    get theme() { return state.theme || {}; },
    get editing() { return !!state.editing; },
    on(topic, fn, options) {
      (listeners[topic] = listeners[topic] || []).push(fn);
      if (DATA_TOPICS.includes(topic)) post({ type: "subscribe", topic, url: options && options.url });
      if (topic in state) fn(state[topic]);
      return () => { listeners[topic] = (listeners[topic] || []).filter((f) => f !== fn); };
    },
    action: request,
    open: (target) => request({ kind: "open", target }),
    keys: (keys) => request({ kind: "keys", keys }),
    command: (command) => request({ kind: "command", command }),
    media: (command) => request({ kind: "media", command }),
    page: (page) => request({ kind: "page", page }),
    setSettings: (patch) => post({ type: "setSettings", patch }),
  };

  // Erreurs du widget affichées sur l'Edge (sinon invisibles dans l'appli installée).
  addEventListener("error", (e) => {
    const where = e.filename ? ` (${e.filename.split("/").pop().split("?")[0]}:${e.lineno})` : "";
    post({ type: "error", message: String(e.message || e.error || "erreur inconnue") + where });
  });
  addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    post({ type: "error", message: "Promesse rejetée : " + String((r && r.message) || r) });
  });

  post({ type: "ready" });
})();
