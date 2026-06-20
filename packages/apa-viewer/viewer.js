// APA Viewer - claims-first reading view for a Patent Artifact, with lazy expansion,
// typed-edge chip groups, search, and TOC scroll-spy. Vanilla browser JS, zero dependencies.
//
// Load:  ./index.html         -> fetches sibling ./manifest.json
//        ./index.html?manifest=../../examples/minimal-patent-artifact/manifest.json
//
// DELIBERATE DIVERGENCE FROM ARA (mirrors build_manifest.mjs):
//   An edge with "resolved": false is NEVER hidden. It renders as a visible amber warning badge
//   (the S112-support / unsupported-edge surface). This is the headline feature.

// ---------------------------------------------------------------------------
// fatal-error surface: the page is never just blank
// ---------------------------------------------------------------------------
function showFatal(msg) {
  const slot =
    document.getElementById("loading") || document.getElementById("sections") || document.body;
  const div = document.createElement("div");
  div.className = "error";
  div.textContent = "APA Viewer error: " + msg;
  slot.prepend(div);
}
window.addEventListener("error", (e) =>
  showFatal(`${e.message}\n  at ${e.filename}:${e.lineno}:${e.colno}`)
);
window.addEventListener("unhandledrejection", (e) =>
  showFatal("unhandled promise rejection: " + ((e.reason && e.reason.message) || e.reason))
);

const params = new URLSearchParams(location.search);
const MANIFEST_PATH = params.get("manifest") || "manifest.json";

// Sections: claims first and always. Other node kinds get their own sections below the claims.
const SECTIONS = [
  { id: "claims", label: "Claims", kinds: ["claim"], blurb: "What is claimed (limitations expand inline)" },
  { id: "spec", label: "Specification", kinds: ["spec-paragraph"], blurb: "§112 written-description support paragraphs" },
  { id: "drawings", label: "Drawings", kinds: ["drawing-figure", "reference-numeral"], blurb: "Figures and their reference numerals" },
  { id: "terms", label: "Defined terms", kinds: ["defined-term"], blurb: "Lexicography / antecedent-basis source" },
  { id: "priorart", label: "Prior art", kinds: ["prior-art-reference"], blurb: "References distinguished over (for patentability)" },
  { id: "prosecution", label: "Prosecution trace", kinds: ["prosecution-node"], blurb: "Decision DAG: where claim scope was set" },
  { id: "inventors", label: "Inventors", kinds: ["inventor"], blurb: "Natural-person inventors (35 USC 116)" },
];

const KIND_BADGE = {
  claim: "CLM",
  "claim-limitation": "LIM",
  "spec-paragraph": "SPEC",
  "drawing-figure": "FIG",
  "reference-numeral": "NUM",
  "prior-art-reference": "PA",
  "defined-term": "TERM",
  "prosecution-node": "PH",
  inventor: "INV",
};

// Edge kind -> { out: label when this node is the `from`, in: label when this node is the `to` }.
const EDGE_GROUP = {
  supported_by: { out: "supported by (§112)", in: "supports limitations" },
  illustrated_by: { out: "illustrated by", in: "illustrates" },
  practiced_by: { out: "practiced by", in: "practices / described by" },
  antecedent_of: { out: "antecedent basis", in: "antecedent for" },
  depends_on: { out: "depends on", in: "base for" },
  distinguished_over: { out: "distinguished over", in: "distinguished by claims" },
  scope_set_at: { out: "scope set at", in: "set scope of claims" },
  contributed_to: { out: "conceived by", in: "conceived" },
};

const state = {
  data: null,
  byId: new Map(),
  outEdges: new Map(), // node id -> edges where node is `from` (with .from possibly qualified CLM##.LIM##)
  inEdges: new Map(), // node id -> edges where node is `to`
};

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
async function main() {
  let manifest;
  try {
    const r = await fetch(MANIFEST_PATH);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    manifest = await r.json();
  } catch (e) {
    const loading = document.getElementById("loading");
    loading.innerHTML =
      `<div class="error">Could not load <code>${esc(MANIFEST_PATH)}</code> (${esc(
        (e && e.message) || e
      )}).<br/>` +
      `Build it first:<br/><code>node build_manifest.mjs &lt;matter-dir&gt; --out manifest.json</code><br/>` +
      `then serve this directory over http:// (fetch is blocked on file://).</div>`;
    return;
  }
  if (!manifest || !Array.isArray(manifest.nodes) || !Array.isArray(manifest.edges)) {
    showFatal("manifest.json is missing nodes/edges arrays (invalid shape).");
    return;
  }
  const loading = document.getElementById("loading");
  if (loading) loading.remove();

  state.data = manifest;
  state.byId = new Map(manifest.nodes.map((n) => [n.id, n]));
  manifest.nodes.forEach((n) => {
    state.inEdges.set(n.id, []);
    state.outEdges.set(n.id, []);
  });
  manifest.edges.forEach((e) => {
    // `from` may be qualified (CLM##.LIM##); index it under both the qualified and bare ids.
    const fromBare = bareId(e.from);
    if (state.outEdges.has(fromBare)) state.outEdges.get(fromBare).push(e);
    const toBare = bareId(e.to);
    if (state.inEdges.has(toBare)) state.inEdges.get(toBare).push(e);
  });

  renderTopBar();
  renderHero();
  renderReviewPanels();
  renderSections();
  renderTOC();
  wireControls();
  setupTOCScrollSpy();
}

// ---------------------------------------------------------------------------
// top bar / hero (meta + provenance summary + disclaimer is in HTML)
// ---------------------------------------------------------------------------
function renderTopBar() {
  const meta = state.data.meta || {};
  const el = document.getElementById("matter-meta");
  el.innerHTML =
    `<strong>${esc(meta.title || "(untitled matter)")}</strong>` +
    (meta.application_type ? ` &middot; ${esc(meta.application_type)}` : "") +
    (meta.status ? ` &middot; ${esc(meta.status)}` : "");
}

function renderHero() {
  const meta = state.data.meta || {};
  const el = document.getElementById("hero");
  const nodes = state.data.nodes;
  const counts = Object.fromEntries(
    SECTIONS.map((s) => [s.id, nodes.filter((n) => s.kinds.includes(n.kind)).length])
  );
  const unresolved = state.data.edges.filter((e) => e.resolved === false);

  const prov = meta.provenance_summary || {};
  const provChips = Object.entries(prov)
    .map(
      ([k, v]) =>
        `<span class="prov-chip"><span class="prov-k">${esc(k)}</span> <span class="prov-v">${esc(
          v
        )}</span></span>`
    )
    .join("");

  el.innerHTML = `
    <h1>${esc(meta.title || "(untitled matter)")}</h1>
    <div class="meta-line">
      ${meta.application_type ? `<span class="meta-pill">${esc(meta.application_type)}</span>` : ""}
      ${meta.status ? `<span class="meta-pill">${esc(meta.status)}</span>` : ""}
      ${
        meta.rules_effective_date
          ? `<span class="meta-faint">rules effective ${esc(meta.rules_effective_date)}</span>`
          : ""
      }
    </div>
    ${provChips ? `<div class="prov-summary"><span class="prov-label">provenance</span>${provChips}</div>` : ""}
    ${
      unresolved.length > 0
        ? `<div class="unresolved-banner" id="unresolved-banner">⚠ ${unresolved.length} unresolved edge${
            unresolved.length === 1 ? "" : "s"
          } (e.g. missing §112 support) — see amber badges below</div>`
        : ""
    }
    <div class="stats">
      ${SECTIONS.map((s) =>
        counts[s.id] > 0
          ? `<div><strong>${counts[s.id]}</strong>${esc(s.label.toLowerCase())}</div>`
          : ""
      ).join("")}
    </div>
  `;

  const banner = document.getElementById("unresolved-banner");
  if (banner) {
    banner.style.cursor = "pointer";
    banner.title = "scroll to the first unresolved edge";
    banner.addEventListener("click", () => {
      const first = document.querySelector(".warn-badge");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}

// ---------------------------------------------------------------------------
// review checklist (read-only human review surface)
// ---------------------------------------------------------------------------
function renderReviewPanels() {
  const review = state.data.review;
  const sections = document.getElementById("sections");
  if (!review || !sections) return;

  const wrap = document.createElement("section");
  wrap.id = "section-review";
  wrap.className = "review-section";
  wrap.innerHTML = `
    <div class="section-header">
      <h2>Review <span class="blurb">read-only checklist</span></h2>
    </div>
    <div class="review-grid"></div>
  `;
  const grid = wrap.querySelector(".review-grid");
  grid.appendChild(reviewPanel({
    title: "Provenance adoption",
    issueCount: review.provenance?.blocking_count || 0,
    okText: "all limitations adopted",
    issueText: "human adoption required",
    items: (review.provenance?.unadopted_limitations || []).map((x) => ({
      id: x.id,
      text: `${x.claim || ""} ${x.title || ""}`.trim(),
      detail: x.status || "",
    })),
  }));
  grid.appendChild(reviewPanel({
    title: "IDS verification",
    issueCount: review.ids?.warning_count || 0,
    okText: "prior-art references verified",
    issueText: "reference verification required",
    items: (review.ids?.unverified_prior_art || []).map((x) => ({
      id: x.id,
      text: x.title || x.citation || x.id,
      detail: x.status || "",
    })),
  }));
  grid.appendChild(reviewPanel({
    title: "Support edges",
    issueCount: review.support?.warning_count || 0,
    okText: "all edges resolve",
    issueText: "unresolved edge review required",
    items: (review.support?.unresolved_edges || []).map((x) => ({
      id: bareId(x.from),
      text: `${x.from} ${x.kind} -> ${x.to}`,
      detail: x.severity || "",
    })),
  }));
  const drawing = review.drawings || {};
  const drawingIssues = (drawing.blocking_count || 0) + (drawing.status === "missing" || drawing.status === "parse-error" ? 1 : 0);
  grid.appendChild(reviewPanel({
    title: "Drawing QA",
    issueCount: drawingIssues,
    okText: drawing.status === "not-applicable" ? "no drawing figures" : "drawing review present",
    issueText: drawing.status === "missing" ? "drawing review missing" : "drawing findings require review",
    items: drawingItems(drawing),
  }));

  sections.parentNode.insertBefore(wrap, sections);
}

function reviewPanel({ title, issueCount, okText, issueText, items }) {
  const panel = document.createElement("article");
  panel.className = `review-panel ${issueCount > 0 ? "needs-review" : "ok"}`;
  const status = issueCount > 0 ? issueText : okText;
  panel.innerHTML = `
    <div class="review-panel-head">
      <h3>${esc(title)}</h3>
      <span class="review-status">${issueCount > 0 ? esc(issueCount) : "0"}</span>
    </div>
    <div class="review-status-line">${esc(status)}</div>
    <ul class="review-items"></ul>
  `;
  const list = panel.querySelector(".review-items");
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = okText;
    list.appendChild(li);
    return panel;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    const href = item.id && state.byId.has(bareId(item.id)) ? `#card-${esc(bareId(item.id))}` : "";
    li.innerHTML =
      (href ? `<a href="${href}">${esc(item.id)}</a>` : `<span class="review-id">${esc(item.id || "")}</span>`) +
      `<span>${esc(item.text || "")}</span>` +
      (item.detail ? `<small>${esc(item.detail)}</small>` : "");
    list.appendChild(li);
  });
  return panel;
}

function drawingItems(drawing) {
  if (drawing.status === "not-applicable") return [];
  if (drawing.status === "missing" || drawing.status === "parse-error") {
    return [{
      id: "",
      text: drawing.message || "drawing-quality review not found",
      detail: drawing.path || "",
    }];
  }
  const findings = Array.isArray(drawing.findings) ? drawing.findings : [];
  if (!findings.length) return [];
  return findings.slice(0, 8).map((f) => ({
    id: f.figure || f.sheet || "",
    text: f.issue_type || f.message || f.rule_reference || "drawing finding",
    detail: f.severity || f.rule_reference || "",
  }));
}

// ---------------------------------------------------------------------------
// sections + cards
// ---------------------------------------------------------------------------
function renderSections() {
  const container = document.getElementById("sections");
  container.innerHTML = "";
  SECTIONS.forEach((s) => {
    const items = state.data.nodes.filter((n) => s.kinds.includes(n.kind));
    if (items.length === 0) return;
    items.sort(cmpNodes);
    const sec = document.createElement("section");
    sec.id = `section-${s.id}`;
    sec.className = "section";
    sec.innerHTML = `
      <div class="section-header">
        <h2>${esc(s.label)} <span class="count">${items.length}</span>
          ${s.blurb ? `<span class="blurb">${esc(s.blurb)}</span>` : ""}
        </h2>
      </div>
      <div class="section-body"></div>
    `;
    const body = sec.querySelector(".section-body");
    items.forEach((node) => body.appendChild(buildCard(node)));
    container.appendChild(sec);
  });
}

function cmpNodes(a, b) {
  // group by id-prefix then numeric suffix; figures before their numerals via the # split
  const ka = idSortKey(a.id);
  const kb = idSortKey(b.id);
  if (ka[0] !== kb[0]) return ka[0] < kb[0] ? -1 : 1;
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2] - kb[2];
}
function idSortKey(id) {
  const m = /^([A-Za-z]+)(\d+)?(?:#(\d+))?/.exec(id) || [];
  return [m[1] || id, m[2] ? parseInt(m[2], 10) : 0, m[3] ? parseInt(m[3], 10) : 0];
}

function buildCard(node) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = node.id;
  card.id = `card-${node.id}`;

  // Header: badge (kind + id) + title + provenance chip.
  const head = document.createElement("div");
  head.className = "card-head";
  head.innerHTML =
    `<span class="badge ${esc(node.kind)}">${esc(KIND_BADGE[node.kind] || node.kind)} ${esc(
      node.id
    )}</span>` +
    `<span class="card-title">${esc(node.title || "")}</span>` +
    provenanceChip(node.provenance);
  card.appendChild(head);

  // Headline statement: the most reading-relevant field per kind.
  const stmt = headlineText(node);
  if (stmt) {
    const div = document.createElement("div");
    div.className = "statement";
    div.textContent = stmt;
    card.appendChild(div);
  }

  // Expand bar: kind-specific. Claims lazily reveal their limitations; everything carries its
  // typed-edge chip groups (which include unresolved-edge warning badges).
  const bar = document.createElement("div");
  bar.className = "expand-bar";
  card.appendChild(bar);
  populateExpandBar(node, bar, card);

  return card;
}

function headlineText(node) {
  const f = node.fields || {};
  switch (node.kind) {
    case "claim":
      return f.statement || "";
    case "claim-limitation":
      return f.text || "";
    case "spec-paragraph":
      return f.text || "";
    case "drawing-figure":
      return f.description || "";
    case "reference-numeral":
      return f.element ? `numeral ${f.numeral} — ${f.element}` : "";
    case "prior-art-reference":
      return f.relied_on_passage || f.citation || "";
    case "defined-term":
      return f.definition || "";
    case "prosecution-node":
      return f.summary || "";
    case "inventor":
      return f.name || "";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// expand bar: claim -> limitations (lazy), then typed-edge chip groups for any node
// ---------------------------------------------------------------------------
function populateExpandBar(node, bar, card) {
  bar.innerHTML = "";

  // 1. Claims get a "limitations (n)" toggle that lazily reveals each LIM as a nested card.
  if (node.kind === "claim") {
    const lims = state.data.nodes.filter(
      (n) => n.kind === "claim-limitation" && (n.fields || {}).claim === node.id
    );
    if (lims.length > 0) {
      const label = document.createElement("span");
      label.className = "group-label";
      label.textContent = "show";
      bar.appendChild(label);

      const btn = document.createElement("button");
      btn.className = "expand-btn";
      btn.innerHTML = `<span class="arrow">▶</span> limitations <span class="n">${lims.length}</span>`;
      btn.addEventListener("click", () => toggleLimitations(card, btn, node, lims));
      bar.appendChild(btn);
    }
  }

  // 2. Typed-edge chip groups (every node). Unresolved edges render as warning badges here.
  const groups = buildLinkGroups(node);
  for (const [groupLabel, items, kind] of groups) {
    const row = document.createElement("div");
    row.className = "expand-bar chip-row";
    row.innerHTML = `<span class="group-label">${esc(groupLabel)}</span>`;
    items.forEach((it) => {
      row.appendChild(it.resolved ? chipFor(card, it, kind) : warnBadgeFor(it, kind));
    });
    if (row.querySelectorAll(".chip, .warn-badge").length > 0) card.appendChild(row);
  }

  if (bar.children.length === 0) bar.style.display = "none";
}

// Build ordered groups: [groupLabel, [{id, resolved, target}], edgeKind].
function buildLinkGroups(node) {
  const out = state.outEdges.get(node.id) || [];
  const inc = state.inEdges.get(node.id) || [];
  const groups = new Map(); // key "kind|dir" -> { label, kind, items: [] }

  const push = (kind, dir, targetId, resolved) => {
    const cfg = EDGE_GROUP[kind];
    const label = (cfg && cfg[dir]) || `${kind} (${dir})`;
    const key = `${kind}|${dir}`;
    if (!groups.has(key)) groups.set(key, { label, kind, items: [] });
    const g = groups.get(key);
    if (!g.items.some((i) => i.id === targetId)) g.items.push({ id: targetId, resolved });
  };

  out.forEach((e) => push(e.kind, "out", e.to, e.resolved !== false));
  // Incoming edges only shown when the source resolves (the source node exists by construction).
  inc.forEach((e) => push(e.kind, "in", e.from, true));

  // Preferred display order: support/illustration first, then structure, then prosecution.
  const order = [
    "supported_by|out",
    "illustrated_by|out",
    "practiced_by|out",
    "antecedent_of|out",
    "antecedent_of|in",
    "depends_on|out",
    "depends_on|in",
    "distinguished_over|out",
    "distinguished_over|in",
    "scope_set_at|out",
    "scope_set_at|in",
    "contributed_to|out",
    "contributed_to|in",
    "supported_by|in",
    "illustrated_by|in",
    "practiced_by|in",
  ];
  const seenKeys = new Set();
  const result = [];
  for (const key of order) {
    if (groups.has(key)) {
      const g = groups.get(key);
      result.push([g.label, g.items, g.kind]);
      seenKeys.add(key);
    }
  }
  // any kinds not in the explicit order, appended deterministically
  for (const [key, g] of groups) {
    if (!seenKeys.has(key)) result.push([g.label, g.items, g.kind]);
  }
  return result;
}

// A resolved chip: clicking expands/scrolls to the linked node.
function chipFor(card, item, kind) {
  const other = state.byId.get(bareId(item.id));
  const chip = document.createElement("button");
  chip.className = "chip";
  const shortLabel = other ? (other.title || "") : "";
  chip.innerHTML =
    `<span class="chip-id">${esc(displayId(item.id))}</span>` +
    (shortLabel ? `<span class="chip-label">${esc(shortLabel.slice(0, 64))}</span>` : "");
  chip.addEventListener("click", () => toggleNested(card, chip, bareId(item.id)));
  return chip;
}

// An unresolved edge -> a visible amber warning badge. NEVER hidden.
function warnBadgeFor(item, kind) {
  const badge = document.createElement("span");
  badge.className = "warn-badge";
  const tgt = displayId(item.id);
  if (kind === "supported_by") {
    badge.textContent = `⚠ unsupported §112 support edge - target ${tgt} missing`;
  } else {
    badge.textContent = `⚠ unresolved ${kind} → ${tgt}`;
  }
  badge.title =
    "This edge points at an id that does not exist among the manifest nodes. " +
    "It is shown (not dropped) so the gap is visible for attorney review.";
  return badge;
}

// ---------------------------------------------------------------------------
// claim -> limitations (lazy nested cards)
// ---------------------------------------------------------------------------
function toggleLimitations(card, btn, claimNode, lims) {
  const existing = card.querySelector(`[data-lims="${claimNode.id}"]`);
  if (existing) {
    existing.remove();
    btn.classList.remove("active");
    return;
  }
  btn.classList.add("active");
  const wrap = document.createElement("div");
  wrap.className = "lim-wrap";
  wrap.dataset.lims = claimNode.id;
  lims.sort(cmpNodes);
  lims.forEach((lim) => {
    const sub = buildCard(lim);
    sub.classList.add("nested-card");
    wrap.appendChild(sub);
  });
  insertAfter(wrap, btn.closest(".expand-bar"));
}

// ---------------------------------------------------------------------------
// chip -> nested artifact card (resolved targets only)
// ---------------------------------------------------------------------------
function toggleNested(card, chip, nodeId) {
  const existing = card.querySelector(`[data-nested="${cssEsc(nodeId)}"]`);
  if (existing) {
    existing.remove();
    chip.classList.remove("active");
    return;
  }
  chip.classList.add("active");
  const node = state.byId.get(nodeId);
  if (!node) return;

  const wrap = document.createElement("div");
  wrap.className = "nested";
  wrap.dataset.nested = nodeId;
  wrap.innerHTML = `
    <div class="nested-header">
      <span>expanded ${esc(node.kind.replace(/-/g, " "))}</span>
      <button class="close" title="collapse">×</button>
      <a class="jump" href="#card-${esc(node.id)}" title="jump to its own card">↗ go to ${esc(
    node.id
  )}</a>
    </div>
  `;
  wrap.appendChild(buildCard(node));
  insertAfter(wrap, chip.closest(".expand-bar"));
  wrap.querySelector(".close").addEventListener("click", () => {
    wrap.remove();
    chip.classList.remove("active");
  });
  // Also flash the canonical card so the user can find it in place.
  const own = document.getElementById(`card-${cssId(node.id)}`);
  if (own) {
    own.classList.add("flash");
    setTimeout(() => own.classList.remove("flash"), 1200);
  }
}

// ---------------------------------------------------------------------------
// TOC + scroll spy
// ---------------------------------------------------------------------------
function renderTOC() {
  const toc = document.getElementById("toc");
  toc.innerHTML = "";
  if (state.data.review) {
    const h = document.createElement("h4");
    h.innerHTML = `<a href="#section-review">Review</a>`;
    toc.appendChild(h);
  }
  SECTIONS.forEach((s) => {
    const items = state.data.nodes.filter((n) => s.kinds.includes(n.kind));
    if (items.length === 0) return;
    items.sort(cmpNodes);
    const h = document.createElement("h4");
    h.innerHTML = `<a href="#section-${s.id}">${esc(s.label)}</a>`;
    toc.appendChild(h);
    const ul = document.createElement("ul");
    items.forEach((n) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#card-${n.id}`;
      a.dataset.target = `card-${n.id}`;
      a.innerHTML = `<span class="id">${esc(n.id)}</span>${esc((n.title || "").slice(0, 48))}`;
      li.appendChild(a);
      ul.appendChild(li);
    });
    toc.appendChild(ul);
  });
}

function setupTOCScrollSpy() {
  const links = Array.from(document.querySelectorAll("#toc a[data-target]"));
  if (links.length === 0) return;
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          links.forEach((a) => a.classList.toggle("active", a.dataset.target === entry.target.id));
        }
      });
    },
    { rootMargin: "-90px 0px -60% 0px", threshold: 0 }
  );
  // Observe only top-level (non-nested) cards.
  document.querySelectorAll(".section-body > .card").forEach((c) => obs.observe(c));
}

// ---------------------------------------------------------------------------
// controls
// ---------------------------------------------------------------------------
function wireControls() {
  document.getElementById("search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll(".section-body > .card").forEach((c) => {
      if (!q) {
        c.classList.remove("hidden");
        return;
      }
      const id = (c.dataset.id || "").toLowerCase();
      const text = c.textContent.toLowerCase();
      c.classList.toggle("hidden", !(id.includes(q) || text.includes(q)));
    });
  });

  document.getElementById("expand-all").addEventListener("click", () => {
    document.querySelectorAll(".card .expand-btn:not(.active)").forEach((btn) => btn.click());
  });
  document.getElementById("collapse-all").addEventListener("click", () => {
    document
      .querySelectorAll(".card .expand-btn.active, .card .chip.active")
      .forEach((btn) => btn.click());
    document.querySelectorAll(".nested, .lim-wrap").forEach((n) => n.remove());
    document
      .querySelectorAll(".expand-btn.active, .chip.active")
      .forEach((b) => b.classList.remove("active"));
  });
}

// ---------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------
function provenanceChip(prov) {
  if (!prov) return "";
  const cls = prov.startsWith("inventor:")
    ? "inventor"
    : prov.replace(/[^a-z-]/g, "") || "other";
  return `<span class="prov-tag prov-${esc(cls)}" title="provenance">${esc(prov)}</span>`;
}

// `from` endpoints may be qualified CLM##.LIM##; the bare node id is after the dot.
function bareId(id) {
  const s = String(id || "");
  const dot = s.indexOf(".");
  return dot > 0 ? s.slice(dot + 1) : s;
}
// For display we keep the qualified/figure-numeral form as authored.
function displayId(id) {
  return String(id || "");
}
function cssId(id) {
  return String(id || "");
}
function cssEsc(s) {
  return String(s).replace(/(["\\#.:>~+*\[\]])/g, "\\$1");
}

function insertAfter(newNode, ref) {
  ref.parentNode.insertBefore(newNode, ref.nextSibling);
}

function esc(s) {
  return String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

main();
