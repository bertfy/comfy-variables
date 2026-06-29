// Prompt Variables — static demo extension.
// Loads inside the REAL ComfyUI frontend. Because this is a backend-less static
// deploy, the on-prompt handler can't run server-side, so this extension
// replicates resolve_prompt_variables() client-side and shows the result when
// you press Run. Same three rules: last-write-wins, missing->literal, no nesting.

const app = (window.comfyAPI && window.comfyAPI.app && window.comfyAPI.app.app) || window.app;
const LG = window.LiteGraph;

function buildRegistry(graph) {
  // last-write-wins by node order
  const reg = new Map();
  const nodes = graph._nodes.slice().sort((a, b) => (a.id || 0) - (b.id || 0));
  for (const n of nodes) {
    if (n.type !== "Variable") continue;
    const nameW = (n.widgets || []).find((w) => w.name === "name");
    const valW = (n.widgets || []).find((w) => w.name === "value");
    const name = (nameW && String(nameW.value || "")).trim();
    if (name) reg.set(name, valW ? String(valW.value == null ? "" : valW.value) : "");
  }
  return reg;
}

function resolveOnce(text, reg) {
  // single pass over [tokens]
  return String(text).replace(/\[[^\[\]]*\]/g, (m) => {
    const name = m.slice(1, -1);
    return reg.has(name) ? reg.get(name) : m; // missing -> literal
  });
}

function resolveNested(text, reg) {
  // resolve repeatedly so an inserted value's own [tokens] also resolve
  // (e.g. [style] -> "[era] film stock" -> "1980s film stock"); capped for cycles
  let out = String(text);
  for (let i = 0; i < 12; i++) {
    const next = resolveOnce(out, reg);
    if (next === out) break;
    out = next;
  }
  return out;
}

function resolveGraph(graph) {
  const reg = buildRegistry(graph);
  const changes = [];
  for (const n of graph._nodes) {
    if (n.type === "Variable") continue;
    for (const w of n.widgets || []) {
      if (typeof w.value === "string" && w.value.includes("[")) {
        const after = resolveOnce(w.value, reg);
        if (after !== w.value) changes.push({ node: n, widget: w, before: w.value, after });
      }
    }
  }
  return { reg, changes };
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function highlight(text, reg) {
  return esc(text).replace(/\[[^\[\]]*\]/g, (m) => {
    const name = m.slice(1, -1);
    if (reg.has(name))
      return `<span style="background:rgba(111,207,127,.22);border-bottom:2px solid #6fcf7f;border-radius:4px;padding:0 3px">${esc(reg.get(name))}</span>`;
    return `<span style="background:rgba(224,166,75,.18);border-bottom:2px dashed #e0a64b;border-radius:4px;padding:0 3px;color:#f0c48a">${esc(m)}</span>`;
  });
}

function showResolved(graph) {
  const { reg, changes } = resolveGraph(graph);
  let body = "";
  if (!reg.size) {
    body = `<div style="color:#97a1ad">No <b style="color:#e6e9ee">Variable</b> nodes found. Add one and set a name &rarr; value.</div>`;
  } else if (!changes.length) {
    body = `<div style="color:#97a1ad">No <code>[token]</code> found in any string field to resolve.</div>`;
  } else {
    body = changes
      .map(
        (c) => `
      <div style="margin:10px 0 14px">
        <div style="font-size:11px;color:#97a1ad;margin-bottom:4px">${esc(c.node.title || c.node.type)} &middot; ${esc(c.widget.name)}</div>
        <div style="font-size:12px;color:#7d8794;margin-bottom:6px">before: ${esc(c.before)}</div>
        <div style="font-size:15px;line-height:1.6">${highlight(c.before, reg)}</div>
      </div>`
      )
      .join("");
  }
  const regRows = [...reg.entries()]
    .map(([k, v]) => `<code>[${esc(k)}]</code> &rarr; ${esc(v)}`)
    .join("<br>");

  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)";
  wrap.innerHTML = `
    <div style="width:min(640px,92vw);max-height:82vh;overflow:auto;background:#2a3038;border:1px solid #444c57;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.5);font-family:ui-sans-serif,system-ui,sans-serif;color:#e6e9ee">
      <div style="padding:14px 18px;border-bottom:1px solid #444c57;display:flex;align-items:center;gap:10px">
        <div style="width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#5b8cff,#6fcf7f);display:grid;place-items:center;font-weight:800;color:#10141a">V</div>
        <b>Resolved Prompt</b>
        <span style="margin-left:auto;font-size:11px;color:#97a1ad">client-side resolve · static demo</span>
      </div>
      <div style="padding:16px 18px">
        <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#97a1ad;margin-bottom:6px">Registry (last-write-wins)</div>
        <div style="font-size:13px;margin-bottom:16px">${regRows || '<span style="color:#97a1ad">empty</span>'}</div>
        ${body}
      </div>
      <div style="padding:12px 18px;border-top:1px solid #444c57;display:flex;justify-content:flex-end">
        <button id="pv-close" style="background:#333b45;color:#e6e9ee;border:1px solid #444c57;border-radius:7px;padding:7px 16px;cursor:pointer">Close</button>
      </div>
    </div>`;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.id === "pv-close") wrap.remove();
  });
  document.body.appendChild(wrap);
}

function hasVariableNodes() {
  return !!(app.graph && app.graph._nodes.some((n) => n.type === "Variable"));
}

function seedDemoGraph() {
  const g = app.graph;
  if (!g) return;
  try {
    g.clear(); // replace ComfyUI's default txt2img graph with the Variables demo
    const mk = (type, pos, widgets) => {
      const n = LG.createNode(type);
      if (!n) return null;
      n.pos = pos;
      for (const [k, v] of Object.entries(widgets || {})) {
        const w = (n.widgets || []).find((w) => w.name === k);
        if (w) w.value = v;
      }
      g.add(n);
      return n;
    };
    mk("Variable", [40, 120], { name: "color name", value: "muted plum" });
    mk("Variable", [40, 360], { name: "mood", value: "somber" });
    mk("Variable", [40, 600], { name: "style", value: "[era] film stock" });
    mk("Variable", [40, 840], { name: "era", value: "1980s" });
    const str = mk("PrimitiveStringMultiline", [430, 120], {
      value: "a lone figure in a [color name] coat, [mood] tone, shot on [style]",
    });
    const prev = mk("PreviewAny", [860, 120], {});
    if (str && prev) {
      str.size = [350, 180];
      prev.size = [380, 200];
      try { str.connect(0, prev, 0); } catch (_) {}
    }
    g.setDirtyCanvas(true, true);
  } catch (e) {
    console.warn("[variables_demo] seed failed", e);
  }
}

/* ---------- inline per-variable color highlighting in text widgets ---------- */
// solid fills — deep enough that the light field text stays readable on top
const PALETTE = ["#3f9d63", "#4a6fd6", "#c2872f", "#a052ad", "#2f9aa3", "#c2564f", "#6f9a2f", "#7a63d6", "#c25f8a", "#2f8fa3"];

function registryColorMap(reg) {
  const m = new Map();
  let i = 0;
  for (const name of reg.keys()) { m.set(name, PALETTE[i % PALETTE.length]); i++; }
  return m;
}

function highlightHTML(text, reg, cmap) {
  let html = "", last = 0, m;
  const re = /\[[^\[\]]*\]/g;
  while ((m = re.exec(text)) !== null) {
    html += esc(text.slice(last, m.index));
    const name = m[0].slice(1, -1);
    if (reg.has(name)) {
      const c = cmap.get(name);
      html += `<span style="border-radius:3px;background:${c}">${esc(m[0])}</span>`; // solid fill
    } else {
      html += `<span style="border-radius:3px;background:#ffffff14">${esc(m[0])}</span>`; // faint, undefined
    }
    last = re.lastIndex;
  }
  html += esc(text.slice(last)) + " ";
  return html;
}

function ensureBackdrop(ta) {
  const parent = ta.parentElement;
  if (!parent) return null;
  if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  let bd = ta._pvBackdrop;
  if (!bd || !bd.isConnected) {
    // capture the field's real background BEFORE we make the textarea transparent,
    // so the backdrop can re-paint it and the field keeps its proper color.
    const obg = getComputedStyle(ta).backgroundColor;
    ta._pvOrigBg = obg && obg !== "rgba(0, 0, 0, 0)" && obg !== "transparent" ? obg : "";
    bd = document.createElement("div");
    bd.className = "pv-hl-backdrop";
    bd.appendChild(document.createElement("div")); // marks layer
    parent.insertBefore(bd, parent.firstChild);
    ta._pvBackdrop = bd;
    ta.style.background = "transparent";
    ta.style.position = "relative";
    ta.style.zIndex = "1";
  }
  return bd;
}

function syncHighlight(ta, reg, cmap) {
  const bd = ensureBackdrop(ta);
  if (!bd) return;
  const cs = getComputedStyle(ta);
  bd.style.cssText =
    `position:absolute;left:${ta.offsetLeft}px;top:${ta.offsetTop}px;` +
    `width:${ta.offsetWidth}px;height:${ta.offsetHeight}px;overflow:hidden;` +
    `pointer-events:none;z-index:0;border-radius:${cs.borderRadius};` +
    `background:${ta._pvOrigBg || "transparent"}`;
  const marks = bd.firstChild;
  marks.style.cssText =
    `font:${cs.font};letter-spacing:${cs.letterSpacing};padding:${cs.padding};` +
    `white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;color:transparent;` +
    `box-sizing:border-box;width:${ta.clientWidth}px;` +
    `transform:translate(${-ta.scrollLeft}px,${-ta.scrollTop}px)`;
  marks.innerHTML = highlightHTML(ta.value, reg, cmap);
}

function startHighlighting() {
  const tick = () => {
    if (!app.graph) return;
    const reg = buildRegistry(app.graph);
    const cmap = registryColorMap(reg);
    document.querySelectorAll("textarea.comfy-multiline-input").forEach((ta) => {
      if (ta.readOnly) return; // don't highlight read-only display fields (Preview as Text)
      try {
        syncHighlight(ta, reg, cmap);
        if (!ta._pvBound) {
          ta._pvBound = true;
          ta.addEventListener("input", () => {
            const r = buildRegistry(app.graph);
            syncHighlight(ta, r, registryColorMap(r));
          });
          ta.addEventListener("scroll", () => {
            const marks = ta._pvBackdrop && ta._pvBackdrop.firstChild;
            if (marks) marks.style.transform = `translate(${-ta.scrollLeft}px,${-ta.scrollTop}px)`;
          });
        }
      } catch (e) { /* widget mid-rebuild */ }
    });
  };
  setInterval(tick, 250);
}

/* ---------- render resolved output into Preview nodes (no backend) ---------- */
function resolvedOutputOf(node, reg) {
  if (!node) return "";
  const w = (node.widgets || []).find((w) => w.name === "value" && typeof w.value === "string")
         || (node.widgets || []).find((w) => typeof w.value === "string");
  if (!w) return "";
  const raw = String(w.value == null ? "" : w.value);
  return node.type === "Variable" ? raw : resolveNested(raw, reg); // Variable outputs raw
}

function populatePreviews() {
  if (!app.graph) return;
  const reg = buildRegistry(app.graph);
  app.graph._nodes.filter((n) => n.type === "PreviewAny").forEach((prev) => {
    let text = "";
    const inp = (prev.inputs || [])[0];
    if (inp && inp.link != null && app.graph.links) {
      const link = app.graph.links[inp.link];
      if (link) {
        const origin = app.graph.getNodeById(link.origin_id);
        text = resolvedOutputOf(origin, reg);
      }
    }
    try {
      if (typeof prev.onExecuted === "function") prev.onExecuted({ text: [text] });
    } catch (e) { /* ignore */ }
  });
  app.graph.setDirtyCanvas(true, true);
}

function suppressDefaultGraphToast() {
  // The seeded demo replaces ComfyUI's default graph, whose missing-model
  // validation fires a stray "required models are missing" panel at varying
  // times. Remove that panel whenever it appears (robust to class names).
  const style = document.createElement("style");
  style.textContent = ".p-toast{display:none !important}";
  document.head.appendChild(style);
  // Safely dismiss the "required models are missing" panel by clicking its own
  // Dismiss button (no DOM removal, so nothing else can break).
  let n = 0;
  const iv = setInterval(() => {
    document.querySelectorAll("button").forEach((b) => {
      if ((b.textContent || "").trim().toLowerCase() === "dismiss") b.click();
    });
    if (++n > 80) clearInterval(iv);
  }, 250);
}

app.registerExtension({
  name: "Comfy.PromptVariablesDemo",
  async setup() {
    startHighlighting();
    suppressDefaultGraphToast();
    // Retry-seed: the default graph can load slightly after extension setup,
    // so keep (re)seeding until the Variable demo is present, then stop.
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (!hasVariableNodes()) seedDemoGraph();
      if (hasVariableNodes() || tries > 8) { clearInterval(iv); setTimeout(populatePreviews, 400); }
    }, 500);
    // Intercept the real Run/Queue button: resolve client-side instead of POSTing.
    if (typeof app.queuePrompt === "function") {
      const orig = app.queuePrompt.bind(app);
      app.queuePrompt = async function (...args) {
        try { populatePreviews(); } catch (e) { console.warn(e); }
        return Promise.resolve();
      };
      app.queuePrompt._origQueue = orig;
    }
  },
});
