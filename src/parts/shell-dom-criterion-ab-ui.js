
function setCriterionCLoading(loading, statusText) {
  if (criterionCTileRun) {
    criterionCTileRun.disabled = loading;
    if (loading) criterionCTileRun.classList.remove("criterion-tile__run--graded");
  }
  const sp = document.getElementById("criterionCTileSpinner");
  if (sp) sp.hidden = !loading;
  const lbl = document.querySelector("#criterionCTile .criterion-tile__btn-label");
  if (lbl) lbl.textContent = loading ? "Running…" : "Run Criterion C";
  setStatus(loading ? statusText || "" : "");
  if (!loading) syncDashboardCriterionRunLocks();
}

/**
 * First top-level `{ ... }` in `str`, respecting JSON string escapes so `{`/`}` inside strings do not affect depth.
 * @param {string} str
 * @returns {string | null}
 */
function extractFirstBalancedJsonObject(str) {
  const start = str.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let i = start;
  while (i < str.length) {
    const c = str[i];
    if (!inString) {
      if (c === '"') {
        inString = true;
        i += 1;
        continue;
      }
      if (c === "{") {
        depth += 1;
        i += 1;
        continue;
      }
      if (c === "}") {
        depth -= 1;
        if (depth === 0) return str.slice(start, i + 1);
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }
    if (c === "\\") {
      if (i + 1 >= str.length) return null;
      const n = str[i + 1];
      if (n === "u" && i + 5 < str.length) {
        i += 6;
        continue;
      }
      i += 2;
      continue;
    }
    if (c === '"') {
      inString = false;
    }
    i += 1;
  }
  return null;
}

/**
 * @param {string} raw
 * @returns {object}
 */
function parseModelJsonObject(raw) {
  let cleaned = String(raw).trim().replace(/^\uFEFF/, "");
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/u, "");
  }
  cleaned = cleaned.trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const slice = extractFirstBalancedJsonObject(cleaned);
    if (slice) {
      return JSON.parse(slice);
    }
    throw new Error("parseModelJsonObject: invalid JSON");
  }
}

const apiKeyInput = document.getElementById("apiKey");
const modelSelect = document.getElementById("modelSelect");
const sourceText = document.getElementById("sourceText");
const studentParagraph = document.getElementById("studentParagraph");
const clearBtn = document.getElementById("clearBtn");
const charCount = document.getElementById("charCount");
const paraCharCount = document.getElementById("paraCharCount");
const statusLine = document.getElementById("statusLine");
const errorBox = document.getElementById("errorBox");
const outputSection = document.getElementById("outputSection");
const outputEl = document.getElementById("output");
const copyBtn = document.getElementById("copyBtn");
const topicArgumentSection = document.getElementById("topicArgumentSection");
const topicAuditOutput = document.getElementById("topicAuditOutput");
const copyTopicAuditBtn = document.getElementById("copyTopicAuditBtn");
const finalGradeSection = document.getElementById("finalGradeSection");
const finalGradeOutput = document.getElementById("finalGradeOutput");
const auditTooltip = document.getElementById("auditTooltip");

const criterionATileRun = document.getElementById("criterionATileRun");
const criterionATileSpinner = document.getElementById("criterionATileSpinner");
const criterionBTileRun = document.getElementById("criterionBTileRun");
const criterionBTileSpinner = document.getElementById("criterionBTileSpinner");
const criterionCTileRun = document.getElementById("criterionCTileRun");
const criterionDTileRun = document.getElementById("criterionDTileRun");

/** @type {HTMLDivElement | null} */
let criterionBTooltip = null;
/** @type {(() => void) | null} */
let boundScrollRepositionB = null;
let criterionBTooltipHoverBound = false;

let tooltipHideTimer = null;

/** @type {(() => void) | null} */
let boundScrollReposition = null;

let auditTooltipHoverBound = false;

function clearTooltipHide() {
  if (tooltipHideTimer) {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
  }
}

function scheduleHideTooltip() {
  clearTooltipHide();
  tooltipHideTimer = setTimeout(() => {
    if (auditTooltip) auditTooltip.hidden = true;
  }, 180);
}

function loadKey() {
  if (!apiKeyInput) return;
  try {
    const k = localStorage.getItem(STORAGE_KEY);
    if (k) apiKeyInput.value = k;
  } catch {
    /* ignore */
  }
}

function saveKey() {
  if (!apiKeyInput) return;
  try {
    localStorage.setItem(STORAGE_KEY, apiKeyInput.value.trim());
  } catch {
    /* ignore */
  }
}

/**
 * @returns {string}
 */
function getSelectedGeminiModelId() {
  const sel = document.getElementById("modelSelect");
  if (sel && sel.value && String(sel.value).trim()) {
    return String(sel.value).trim();
  }
  try {
    const s = localStorage.getItem(STORAGE_GEMINI_MODEL_KEY);
    if (s && String(s).trim()) return String(s).trim();
  } catch {
    /* ignore */
  }
  return DEFAULT_GEMINI_MODEL_ID;
}

const MODEL_TIER_NOTE_CLASSES = [
  "model-tier-note--open",
  "model-tier-note--lite",
  "model-tier-note--flash",
  "model-tier-note--pro",
];

function syncModelTierNote() {
  const note = document.getElementById("modelTierNote");
  const sel = document.getElementById("modelSelect");
  if (!note || !sel) return;
  const opt = sel.selectedOptions[0];
  const tier = opt?.getAttribute("data-tier") || "";
  const lead = note.querySelector(".model-tier-note__lead");
  const rest = note.querySelector(".model-tier-note__rest");
  if (!lead || !rest) return;
  for (const c of MODEL_TIER_NOTE_CLASSES) {
    note.classList.remove(c);
  }
  if (tier === "open") {
    note.classList.add("model-tier-note--open");
    lead.textContent = "Free tier · ~1500 RPD · open weights";
    rest.textContent =
      " Usually high availability on the API; strong default when you want generous quota and transparent weights.";
  } else if (tier === "lite") {
    note.classList.add("model-tier-note--lite");
    lead.textContent = "Free tier · ~500 RPD";
    rest.textContent =
      " Light and cheap; occasional 503 Unavailable when capacity is tight. Good for quick passes.";
  } else if (tier === "flash") {
    note.classList.add("model-tier-note--flash");
    lead.textContent = "Usually not on free tier";
    rest.textContent =
      " Expect a billed Gemini API project. Good balance of speed and quality for grading.";
  } else if (tier === "pro") {
    note.classList.add("model-tier-note--pro");
    lead.textContent = "Usually not on free tier";
    rest.textContent = " Expect a billed project; highest capability, higher cost and latency.";
  } else {
    lead.textContent = "";
    rest.textContent = "";
  }
}

function persistGeminiModelChoice() {
  const sel = document.getElementById("modelSelect");
  if (!sel) return;
  try {
    localStorage.setItem(STORAGE_GEMINI_MODEL_KEY, String(sel.value).trim());
  } catch {
    /* ignore */
  }
  syncModelTierNote();
}

function loadGeminiModelChoice() {
  const sel = document.getElementById("modelSelect");
  if (!sel) return;
  try {
    const s = localStorage.getItem(STORAGE_GEMINI_MODEL_KEY);
    if (s && String(s).trim()) {
      const v = String(s).trim();
      const match = [...sel.options].some((o) => o.value === v);
      if (match) sel.value = v;
    }
  } catch {
    /* ignore */
  }
  syncModelTierNote();
}

function loadDraftText() {
  if (!sourceText || !studentParagraph) return;
  try {
    const src = localStorage.getItem(STORAGE_DRAFT_SOURCE);
    const para = localStorage.getItem(STORAGE_DRAFT_PARAGRAPH);
    if (src !== null) sourceText.value = src;
    if (para !== null) studentParagraph.value = para;
  } catch {
    /* ignore */
  }
}

function persistDraftSource() {
  if (!sourceText) return;
  updateCharCount();
  try {
    localStorage.setItem(STORAGE_DRAFT_SOURCE, sourceText.value);
  } catch {
    /* ignore */
  }
}

function persistDraftParagraph() {
  if (!studentParagraph) return;
  updateParaCharCount();
  try {
    localStorage.setItem(STORAGE_DRAFT_PARAGRAPH, studentParagraph.value);
  } catch {
    /* ignore */
  }
}

function clearDraftText() {
  try {
    localStorage.removeItem(STORAGE_DRAFT_SOURCE);
    localStorage.removeItem(STORAGE_DRAFT_PARAGRAPH);
  } catch {
    /* ignore */
  }
}

/** Prefer localStorage; migrate once from legacy sessionStorage. */
function loadCriterionABundleRaw() {
  try {
    let raw = localStorage.getItem(CRITERION_A_BUNDLE_KEY);
    if (raw) return raw;
    raw = sessionStorage.getItem(CRITERION_A_BUNDLE_KEY);
    if (raw) {
      try {
        localStorage.setItem(CRITERION_A_BUNDLE_KEY, raw);
        sessionStorage.removeItem(CRITERION_A_BUNDLE_KEY);
      } catch {
        /* ignore */
      }
    }
    return raw;
  } catch {
    return null;
  }
}

function saveCriterionABundle(bundle) {
  const s = JSON.stringify(bundle);
  try {
    localStorage.setItem(CRITERION_A_BUNDLE_KEY, s);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(CRITERION_A_BUNDLE_KEY);
  } catch {
    /* ignore */
  }
}

function clearCriterionABundle() {
  try {
    localStorage.removeItem(CRITERION_A_BUNDLE_KEY);
    sessionStorage.removeItem(CRITERION_A_BUNDLE_KEY);
  } catch {
    /* ignore */
  }
}

function loadCriterionBBundleRaw() {
  try {
    return localStorage.getItem(CRITERION_B_BUNDLE_KEY);
  } catch {
    return null;
  }
}

/**
 * @param {{ version: number, sourceText: string, studentParagraph: string, criterionBData: object, criterionBRawJson: string, criterionBBenchmarkData?: object, criterionBBenchmarkRawJson?: string, criterionBStep3Data?: object, criterionBStep3RawJson?: string, finalCriterionBScore?: number | null }} bundle
 */
/**
 * @returns {boolean} false when localStorage is full or unavailable
 */
function saveCriterionBBundle(bundle) {
  try {
    localStorage.setItem(CRITERION_B_BUNDLE_KEY, JSON.stringify(bundle));
    return true;
  } catch {
    return false;
  }
}

function clearCriterionBBundle() {
  try {
    localStorage.removeItem(CRITERION_B_BUNDLE_KEY);
  } catch {
    /* ignore */
  }
}

function loadIbOverallModerationRaw() {
  try {
    return localStorage.getItem(IB_OVERALL_MODERATION_KEY);
  } catch {
    return null;
  }
}

/**
 * @param {object} obj
 */
function saveIbOverallModerationRecord(obj) {
  try {
    localStorage.setItem(IB_OVERALL_MODERATION_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

function clearIbOverallModerationRecord() {
  try {
    localStorage.removeItem(IB_OVERALL_MODERATION_KEY);
  } catch {
    /* ignore */
  }
}

function setError(msg) {
  if (!errorBox) return;
  if (!msg) {
    errorBox.hidden = true;
    errorBox.textContent = "";
    return;
  }
  errorBox.hidden = false;
  errorBox.textContent = msg;
}

function setStatus(text) {
  if (!statusLine) return;
  if (!text) {
    statusLine.hidden = true;
    statusLine.textContent = "";
    return;
  }
  statusLine.hidden = false;
  statusLine.textContent = text;
}

function updateCharCount() {
  if (!sourceText || !charCount) return;
  const n = sourceText.value.length;
  charCount.textContent =
    n === 1 ? "1 character" : `${n.toLocaleString()} characters`;
}

function updateParaCharCount() {
  if (!studentParagraph || !paraCharCount) return;
  const n = studentParagraph.value.length;
  paraCharCount.textContent =
    n === 1 ? "1 character" : `${n.toLocaleString()} characters`;
}

function setDashboardLoading(loading, statusText) {
  if (criterionATileRun) {
    criterionATileRun.disabled = loading;
    if (loading) criterionATileRun.classList.remove("criterion-tile__run--graded");
  }
  if (criterionATileSpinner) criterionATileSpinner.hidden = !loading;
  const lbl = document.querySelector("#criterionATile .criterion-tile__btn-label");
  if (lbl) lbl.textContent = loading ? "Running…" : "Run Criterion A";
  setStatus(loading ? statusText || "" : "");
  if (!loading) syncDashboardCriterionRunLocks();
}

function setCriterionBLoading(loading, statusText) {
  if (criterionBTileRun) {
    criterionBTileRun.disabled = loading;
    if (loading) criterionBTileRun.classList.remove("criterion-tile__run--graded");
  }
  if (criterionBTileSpinner) criterionBTileSpinner.hidden = !loading;
  const lbl = document.querySelector("#criterionBTile .criterion-tile__btn-label");
  if (lbl) lbl.textContent = loading ? "Running…" : "Run Criterion B";
  setStatus(loading ? statusText || "" : "");
  if (!loading) syncDashboardCriterionRunLocks();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {object} set
 * @returns {string}
 */
/** Display-only: application holistic score and band thresholds (Criterion A). */
function highlightTierClass(set) {
  if (set.insight === 0) return "audit-hl audit-hl--outside";
  const h = computeCriterionASetHolisticScore(set);
  if (h == null) return "audit-hl audit-hl--weak";
  if (h > 2.5) return "audit-hl audit-hl--strong";
  if (h >= 1.8) return "audit-hl audit-hl--mid";
  if (h >= 1.3) return "audit-hl audit-hl--weak";
  return "audit-hl audit-hl--poor";
}

function fallbackTopicSentence(paragraph) {
  const t = paragraph.trim();
  const m = t.match(/^([\s\S]*?[.!?])(\s+|$)/);
  if (m && m[1].length > 0 && m[1].length < 400) {
    return m[1] + (m[2] || "");
  }
  return "";
}

/**
 * Split full paragraph into topic prefix + body using model field or fallback.
 */
function resolveTopicSplit(fullText, excludedFromModel) {
  const trimmed = fullText;
  const ex = (excludedFromModel || "").trim();
  if (ex && trimmed.startsWith(ex)) {
    return { topic: ex, body: trimmed.slice(ex.length) };
  }
  if (ex) {
    const i = trimmed.indexOf(ex);
    if (i === 0) return { topic: ex, body: trimmed.slice(ex.length) };
  }
  const fb = fallbackTopicSentence(trimmed);
  if (fb) return { topic: fb, body: trimmed.slice(fb.length) };
  return { topic: "", body: trimmed };
}

function findVerbatimInBody(body, verbatim, cursor) {
  const v = String(verbatim);
  if (!v) return -1;
  let idx = body.indexOf(v, cursor);
  if (idx !== -1) return idx;
  const trimmed = v.trim();
  if (trimmed !== v) {
    idx = body.indexOf(trimmed, cursor);
    if (idx !== -1) return idx;
  }
  return body.indexOf(v);
}

/**
 * Build HTML: topic (neutral) + highlighted body.
 * @param {string} fullText
 * @param {{ excludedTopicSentence?: string, sets?: object[] }} data
 */
function buildHighlightedHtml(fullText, data) {
  const sets = Array.isArray(data.sets) ? data.sets : [];
  const { topic, body } = resolveTopicSplit(fullText, data.excludedTopicSentence);

  const parts = [];
  if (topic) {
    parts.push(`<span class="audit-topic" title="Topic sentence — not scored">${escapeHtml(topic)}</span>`);
  }

  let cursor = 0;
  const bodyLen = body.length;
  let aligned = 0;

  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];
    const verbatim = set.verbatim != null ? String(set.verbatim) : "";
    if (!verbatim) continue;

    const idx = findVerbatimInBody(body, verbatim, cursor);
    if (idx === -1 || idx < cursor) {
      continue;
    }

    aligned += 1;
    if (idx > cursor) {
      parts.push(`<span class="audit-plain">${escapeHtml(body.slice(cursor, idx))}</span>`);
    }

    const tier = highlightTierClass(set);
    parts.push(
      `<span class="${tier}" tabindex="0" data-set-index="${i}" role="button" aria-label="Set ${i + 1} scores">${escapeHtml(verbatim)}</span>`
    );
    cursor = idx + verbatim.length;
  }

  if (cursor < bodyLen) {
    parts.push(`<span class="audit-plain">${escapeHtml(body.slice(cursor))}</span>`);
  }

  let warn = "";
  if (sets.length > 0 && aligned < sets.length) {
    warn =
      '<p class="audit-warn">Some sets could not be matched to exact substrings of your paragraph; hover may be missing for those. Use &ldquo;Copy audit (JSON)&rdquo; for the full model output.</p>';
  }

  return (
    warn +
    `<div class="audit-legend" aria-hidden="true">
      <span class="lg lg-strong">Excellent (holistic &gt; 2.5)</span>
      <span class="lg lg-mid">Strong (1.8–2.5)</span>
      <span class="lg lg-weak">Mediocre (1.3–&lt;1.8)</span>
      <span class="lg lg-poor">Poor (&lt; 1.3)</span>
      <span class="lg lg-outside">Serious irrelevant tangent</span>
      <span class="lg lg-topic">Topic (not scored)</span>
    </div>
    <p class="audit-paragraph">${parts.join("")}</p>`
  );
}

/**
 * @param {object} set
 */
function fillTooltip(el, set, index) {
  if (!auditTooltip) return;
  clearTooltipHide();
  auditTooltip.innerHTML = "";
  auditTooltip.hidden = false;

  const title = document.createElement("div");
  title.className = "audit-tooltip__title";
  title.textContent = `Set ${index + 1}`;
  auditTooltip.appendChild(title);

  const table = document.createElement("table");
  table.className = "audit-tooltip__table";
  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr><th>Requirement</th><th>Score</th><th>Justification</th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");

  const hol = computeCriterionASetHolisticScore(set);
  const band = hol != null ? criterionAHolisticBandFromScore(hol) : null;
  const holCoef = normalizeCriterionAHolisticCoefficient(set.criterionAHolisticCoefficient);
  const hasReasoningParts =
    set.reasoningDeducibleConclusion != null &&
    set.reasoningPreciseConceptWording != null &&
    set.reasoningLinearCoherence != null;
  const holisticFormulaNote = holCoef != null
    ? `insight × ${holCoef} (max 3)`
    : "insight × (precision + evidenceQuality + reasoning) / 7.5 (legacy bundles)";
  const rows = [
    ["Insight", set.insight, set.justificationInsight],
    ["Precision", set.precision, set.justificationPrecision],
    [`Evidence (${set.evidenceType || "?"}) (0–2)`, set.evidenceQuality, set.justificationEvidence],
    ...(hasReasoningParts
      ? [
          ["(a) Deducible conclusion (0–2)", set.reasoningDeducibleConclusion, "—"],
          ["(b) Precise concept & wording (0–1)", set.reasoningPreciseConceptWording, "—"],
          ["(c) Linear / not circular (0–1)", set.reasoningLinearCoherence, "—"],
        ]
      : []),
    ["Reasoning total (0–4)", set.reasoning, set.justificationReasoning],
    ...(holCoef != null
      ? [
          [
            "Holistic coefficient (×)",
            String(holCoef),
            set.justificationHolisticCoefficient != null ? String(set.justificationHolisticCoefficient) : "—",
          ],
        ]
      : []),
    [
      "Holistic (app)",
      hol != null ? hol.toFixed(2) : "—",
      band ? `max 3.0 · band: ${band}` : holisticFormulaNote,
    ],
  ];

  for (const [req, score, just] of rows) {
    const tr = document.createElement("tr");
    if (req === "Holistic (app)" && band) {
      tr.className = `audit-tooltip__band-row audit-tooltip__band-row--${band}`;
    }
    const td1 = document.createElement("td");
    td1.textContent = req;
    const td2 = document.createElement("td");
    td2.textContent = score != null ? String(score) : "—";
    const td3 = document.createElement("td");
    td3.textContent = just || "—";
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  auditTooltip.appendChild(table);

  positionTooltip(el);
}

function positionTooltip(anchorEl) {
  if (!auditTooltip) return;
  const rect = anchorEl.getBoundingClientRect();
  const pad = 8;
  const tw = Math.min(420, window.innerWidth - 24);
  auditTooltip.style.position = "fixed";
  auditTooltip.style.width = `${tw}px`;
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
  auditTooltip.style.left = `${left}px`;

  const margin = 10;
  const est = 300;
  let top = rect.bottom + margin;
  if (top + est > window.innerHeight - pad) {
    top = rect.top - margin - est;
  }
  if (top < pad) top = pad;
  auditTooltip.style.top = `${top}px`;
}

function hideTooltip() {
  clearTooltipHide();
  if (auditTooltip) auditTooltip.hidden = true;
}

function bindHighlightInteractions(container, data) {
  if (boundScrollReposition) {
    window.removeEventListener("scroll", boundScrollReposition, true);
    boundScrollReposition = null;
  }

  const sets = data.sets || [];
  const spans = container.querySelectorAll("[data-set-index]");

  spans.forEach((span) => {
    const i = Number(span.getAttribute("data-set-index"));
    const set = sets[i];
    if (!set) return;

    span.addEventListener("mouseenter", () => {
      clearTooltipHide();
      fillTooltip(span, set, i);
    });
    span.addEventListener("mouseleave", () => scheduleHideTooltip());
    span.addEventListener("focus", () => {
      clearTooltipHide();
      fillTooltip(span, set, i);
    });
    span.addEventListener("blur", () => scheduleHideTooltip());
  });

  if (auditTooltip && !auditTooltipHoverBound) {
    auditTooltip.addEventListener("mouseenter", () => clearTooltipHide());
    auditTooltip.addEventListener("mouseleave", () => scheduleHideTooltip());
    auditTooltipHoverBound = true;
  }

  boundScrollReposition = () => {
    if (!auditTooltip || auditTooltip.hidden) return;
    const active = document.activeElement;
    if (active && active.getAttribute("data-set-index") !== null) {
      positionTooltip(active);
    }
  };
  window.addEventListener("scroll", boundScrollReposition, true);
}

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
function clampInt(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(x)));
}

/**
 * @param {object} data
 * @returns {object[]}
 */
function flattenCriterionBSets(data) {
  const paras = Array.isArray(data.bodyParagraphs) ? data.bodyParagraphs : [];
  const out = [];
  for (const para of paras) {
    const sets = Array.isArray(para.analysisSets) ? para.analysisSets : [];
    for (const st of sets) out.push(st);
  }
  return out;
}

/**
 * Deterministic reasoning total 0–4 from four checkpoints + logical penalty (legacy Criterion B bundles only).
 * @param {object} set
 * @returns {number}
 */
function getCriterionBReasoningScoreComputed(set) {
  if (!set || typeof set !== "object") return 0;
  let n = 0;
  if (set.specificRole_met === true) n += 1;
  if (set.linkToMessage_met === true) n += 1;
  if (set.subtleImplications_met === true) n += 1;
  if (set.audienceImpact_met === true) n += 1;
  if (set.logicalConsistency_ok === false) n -= 1;
  return clampInt(n, 0, 4);
}

/**
 * @param {object} set
 * @returns {boolean}
 */
function isCriterionBSetScoringV2(set) {
  if (!set || typeof set !== "object") return false;
  const a = Number(set.reasoningDeducibleConclusion);
  const c = Number(set.reasoningLinearCoherence);
  return Number.isFinite(a) && Number.isFinite(c);
}

/**
 * @param {object} set
 * @returns {number}
 */
function getCriterionBCheckpointTrueCount(set) {
  if (!set || typeof set !== "object") return 0;
  let n = 0;
  if (set.specificRole_met === true) n += 1;
  if (set.linkToMessage_met === true) n += 1;
  if (set.subtleImplications_met === true) n += 1;
  if (set.audienceImpact_met === true) n += 1;
  return n;
}

/**
 * @param {number} n
 * @returns {number}
 */
function getCriterionBCheckpointBandPoints(n) {
  const k = clampInt(n, 0, 4);
  if (k <= 0) return 0;
  if (k === 1) return 2;
  if (k === 2) return 4;
  return 6;
}

/**
 * @param {object} set
 * @returns {number}
 */
function getCriterionBReasoningACSum(set) {
  const a = clampInt(set?.reasoningDeducibleConclusion, 0, 2);
  const c = clampInt(set?.reasoningLinearCoherence, 0, 1);
  return a + c;
}

/**
 * @param {object} set
 * @returns {number}
 */
function getCriterionBReasoningAdjustment(set) {
  const s = getCriterionBReasoningACSum(set);
  if (s === 3) return 1;
  if (s === 2) return 0;
  return -1;
}

/**
 * Per-set Criterion B score out of 9 (v2: technique 0–2 + checkpoint band + (a)/(c) adjustment; legacy: old formula).
 * @param {object} set
 * @returns {number}
 */
function computeCriterionBWeighted(set) {
  if (isCriterionBSetScoringV2(set)) {
    const tech = clampInt(set?.techniqueQualityScore, 0, 2);
    const ckPts = getCriterionBCheckpointBandPoints(getCriterionBCheckpointTrueCount(set));
    const adj = getCriterionBReasoningAdjustment(set);
    const raw = tech + ckPts + adj;
    return Math.min(9, Math.max(0, raw));
  }
  const x = clampInt(set?.techniqueQualityScore, 0, 3);
  const y = getCriterionBReasoningScoreComputed(set);
  return x + y * 1.5;
}

/**
 * "Outside" tier analogue: no technique signal and no checkpoint credit (v2), or zero technique + zero reasoning (legacy).
 * @param {object} set
 */
function isCriterionBSetOutsideTier(set) {
  if (!set || typeof set !== "object") return false;
  if (isCriterionBSetScoringV2(set)) {
    const tx = clampInt(set.techniqueQualityScore, 0, 2);
    return tx === 0 && getCriterionBCheckpointTrueCount(set) === 0;
  }
  const tx = clampInt(set.techniqueQualityScore, 0, 3);
  return tx === 0 && getCriterionBReasoningScoreComputed(set) === 0;
}

/**
 * Discrete highlight colours by browser weighted set total /9 (8–9, 6–7, 4–5, 1–3).
 * @param {number} w
 * @returns {"89" | "67" | "45" | "13"}
 */
function criterionBWeightedBandKey(w) {
  if (w == null || !Number.isFinite(w)) return "13";
  if (w >= 8) return "89";
  if (w >= 6) return "67";
  if (w >= 4) return "45";
  return "13";
}

/**
 * @param {object} set
 */
function highlightTierClassB(set) {
  if (isCriterionBSetOutsideTier(set)) return "audit-hl audit-bhl--outside";
  const w = computeCriterionBWeighted(set);
  const k = criterionBWeightedBandKey(w);
  return `audit-hl audit-bhl--${k}`;
}

/**
 * @param {string} fullText
 * @param {{ bodyParagraphs?: object[] }} data
 */
function buildCriterionBHighlightedHtml(fullText, data) {
  const paras = Array.isArray(data.bodyParagraphs) ? data.bodyParagraphs : [];
  const firstTs =
    paras[0] && paras[0].topicSentenceVerbatim != null
      ? String(paras[0].topicSentenceVerbatim)
      : "";
  const setsFlat = flattenCriterionBSets(data);
  const { topic, body } = resolveTopicSplit(fullText, firstTs);

  const parts = [];
  if (topic) {
    parts.push(
      `<span class="audit-topic" title="Topic sentence — not scored">${escapeHtml(topic)}</span>`
    );
  }

  let cursor = 0;
  const bodyLen = body.length;
  let aligned = 0;

  for (let i = 0; i < setsFlat.length; i++) {
    const set = setsFlat[i];
    const verbatim = set.verbatim != null ? String(set.verbatim) : "";
    if (!verbatim) continue;

    const idx = findVerbatimInBody(body, verbatim, cursor);
    if (idx === -1 || idx < cursor) {
      continue;
    }

    aligned += 1;
    if (idx > cursor) {
      parts.push(`<span class="audit-plain">${escapeHtml(body.slice(cursor, idx))}</span>`);
    }

    const tier = highlightTierClassB(set);
    parts.push(
      `<span class="${tier}" tabindex="0" data-criterion-b-set-index="${i}" role="button" aria-label="Criterion B set ${i + 1}">${escapeHtml(verbatim)}</span>`
    );
    cursor = idx + verbatim.length;
  }

  if (cursor < bodyLen) {
    parts.push(`<span class="audit-plain">${escapeHtml(body.slice(cursor))}</span>`);
  }

  let warn = "";
  if (setsFlat.length > 0 && aligned < setsFlat.length) {
    warn =
      '<p class="audit-warn">Some sets could not be matched to exact substrings of your response; hover may be missing for those. Use &ldquo;Copy grading (JSON)&rdquo; for the full model output.</p>';
  }

  return (
    warn +
    `<div class="audit-legend" aria-hidden="true">
      <span class="lg lg-b89">Set total 8–9 / 9</span>
      <span class="lg lg-b67">6–7 / 9</span>
      <span class="lg lg-b45">4–5 / 9</span>
      <span class="lg lg-b13">1–3 / 9</span>
      <span class="lg lg-b-outside">No technique / checkpoints (outside band)</span>
      <span class="lg lg-topic">Topic (not scored)</span>
    </div>
    <p class="audit-paragraph">${parts.join("")}</p>`
  );
}

function boolToMark(v) {
  return v ? "✅" : "❌";
}

let criterionBTooltipHideTimer = null;

function clearCriterionBTooltipHide() {
  if (criterionBTooltipHideTimer) {
    clearTimeout(criterionBTooltipHideTimer);
    criterionBTooltipHideTimer = null;
  }
}

function scheduleHideCriterionBTooltip() {
  clearCriterionBTooltipHide();
  criterionBTooltipHideTimer = setTimeout(() => {
    if (criterionBTooltip) criterionBTooltip.hidden = true;
  }, 180);
}

/**
 * @param {HTMLElement} el
 * @param {object} set
 * @param {number} index
 */
function fillCriterionBTooltip(el, set, index) {
  if (!criterionBTooltip) return;
  clearCriterionBTooltipHide();
  criterionBTooltip.innerHTML = "";
  criterionBTooltip.hidden = false;

  const title = document.createElement("div");
  title.className = "audit-tooltip__title";
  title.textContent = `Criterion B · Set ${index + 1}`;
  criterionBTooltip.appendChild(title);

  const w = computeCriterionBWeighted(set);
  const v2 = isCriterionBSetScoringV2(set);
  const x = v2 ? clampInt(set.techniqueQualityScore, 0, 2) : clampInt(set.techniqueQualityScore, 0, 3);
  const ck = getCriterionBCheckpointTrueCount(set);
  const ckPts = getCriterionBCheckpointBandPoints(ck);
  const ac = v2 ? getCriterionBReasoningACSum(set) : getCriterionBReasoningScoreComputed(set);
  const adj = v2 ? getCriterionBReasoningAdjustment(set) : null;

  const sumLine = document.createElement("p");
  sumLine.className = "audit-tooltip__summary";
  sumLine.style.margin = "0 0 0.5rem";
  sumLine.style.fontSize = "0.82rem";
  sumLine.textContent = v2
    ? `Computed — Checkpoints true: ${ck}/4 → ${ckPts} pts · (a)+(c): ${ac} → adj ${adj != null && adj > 0 ? "+" : ""}${adj} · Total: ${w.toFixed(1)} / 9 (technique ${x}/2)`
    : `Computed — Legacy reasoning: ${ac} / 4 · Weighted: ${w.toFixed(1)} / 9 (technique ${x}/3)`;
  criterionBTooltip.appendChild(sumLine);

  const table = document.createElement("table");
  table.className = "audit-tooltip__table";
  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr><th>Requirement</th><th>Status</th><th>Notes</th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");

  const rows = v2
    ? [
        [
          "Technique quality (0–2)",
          `${x} / 2`,
          set.techniqueQualityJustification != null ? String(set.techniqueQualityJustification) : "—",
        ],
        ["Specific role / function", boolToMark(set.specificRole_met), set.specificRole_notes],
        ["Link to message", boolToMark(set.linkToMessage_met), set.linkToMessage_notes],
        ["Subtle implications", boolToMark(set.subtleImplications_met), set.subtleImplications_notes],
        ["Audience impact", boolToMark(set.audienceImpact_met), set.audienceImpact_notes],
        [
          "(a) Deducible conclusion",
          `${clampInt(set.reasoningDeducibleConclusion, 0, 2)} / 2`,
          "Criterion A–parallel (a); see justification row.",
        ],
        [
          "(c) Linear coherence",
          `${clampInt(set.reasoningLinearCoherence, 0, 1)} / 1`,
          "Criterion A–parallel (c); see justification row.",
        ],
        [
          "(a)+(c) justification (model)",
          "—",
          set.criterionBReasoningJustificationAC != null
            ? String(set.criterionBReasoningJustificationAC)
            : "—",
        ],
        [
          "Checkpoint band (computed)",
          `${ckPts} pts`,
          `${ck} checkpoint(s) true → 0/2/4/6 band`,
        ],
        [
          "Reasoning adjustment (computed)",
          `${adj != null && adj > 0 ? "+" : ""}${adj}`,
          "(a)+(c) sum 3 → +1, 2 → 0, 0–1 → −1",
        ],
        [
          "Total set score (computed)",
          `${w.toFixed(1)} / 9`,
          "technique + checkpoint band + adjustment, capped 0–9.",
        ],
      ]
    : [
        [
          "Technique quality (0–3)",
          `${x} / 3`,
          set.techniqueQualityJustification != null ? String(set.techniqueQualityJustification) : "—",
        ],
        ["Specific role / function", boolToMark(set.specificRole_met), set.specificRole_notes],
        ["Link to message", boolToMark(set.linkToMessage_met), set.linkToMessage_notes],
        ["Subtle implications", boolToMark(set.subtleImplications_met), set.subtleImplications_notes],
        ["Audience impact", boolToMark(set.audienceImpact_met), set.audienceImpact_notes],
        ["Logical consistency (−1 if ❌)", boolToMark(set.logicalConsistency_ok), set.logicalConsistency_notes],
        [
          "Reasoning total (computed)",
          `${getCriterionBReasoningScoreComputed(set)} / 4`,
          "Sum of four checks, minus 1 if logical consistency is ❌.",
        ],
        [
          "Weighted total (legacy)",
          `${w.toFixed(1)} / 9`,
          "technique + reasoning × 1.5",
        ],
      ];

  const bk = criterionBWeightedBandKey(w);
  const bandClass =
    bk === "89" ? "excellent" : bk === "67" ? "strong" : bk === "45" ? "mediocre" : "poor";
  const bandLabel =
    bk === "89" ? "8–9 / 9" : bk === "67" ? "6–7 / 9" : bk === "45" ? "4–5 / 9" : "1–3 / 9";

  for (const [req, status, notes] of rows) {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td");
    td1.textContent = req;
    const td2 = document.createElement("td");
    td2.textContent = status;
    const td3 = document.createElement("td");
    td3.textContent = notes != null ? String(notes) : "—";
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tbody.appendChild(tr);
  }

  const holTr = document.createElement("tr");
  holTr.className = `audit-tooltip__band-row audit-tooltip__band-row--${bandClass}`;
  const htd1 = document.createElement("td");
  htd1.textContent = "Highlight band (set total)";
  const htd2 = document.createElement("td");
  htd2.textContent = Number.isFinite(w) ? `${w.toFixed(1)} / 9` : "—";
  const htd3 = document.createElement("td");
  htd3.textContent = isCriterionBSetOutsideTier(set)
    ? `${bandLabel} · outside tier (no technique + no checkpoints)`
    : bandLabel;
  holTr.appendChild(htd1);
  holTr.appendChild(htd2);
  holTr.appendChild(htd3);
  tbody.appendChild(holTr);

  table.appendChild(tbody);
  criterionBTooltip.appendChild(table);

  positionCriterionBTooltip(el);
}

function positionCriterionBTooltip(anchorEl) {
  if (!criterionBTooltip) return;
  const rect = anchorEl.getBoundingClientRect();
  const pad = 8;
  const tw = Math.min(420, window.innerWidth - 24);
  criterionBTooltip.style.position = "fixed";
  criterionBTooltip.style.width = `${tw}px`;
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
  criterionBTooltip.style.left = `${left}px`;

  const margin = 10;
  const est = 300;
  let top = rect.bottom + margin;
  if (top + est > window.innerHeight - pad) {
    top = rect.top - margin - est;
  }
  if (top < pad) top = pad;
  criterionBTooltip.style.top = `${top}px`;
}

function hideCriterionBTooltip() {
  clearCriterionBTooltipHide();
  if (criterionBTooltip) criterionBTooltip.hidden = true;
}

/**
 * @param {HTMLElement} container
 * @param {object} data
 */
function bindCriterionBHighlightInteractions(container, data) {
  if (boundScrollRepositionB) {
    window.removeEventListener("scroll", boundScrollRepositionB, true);
    boundScrollRepositionB = null;
  }

  const setsFlat = flattenCriterionBSets(data);
  const spans = container.querySelectorAll("[data-criterion-b-set-index]");

  spans.forEach((span) => {
    const i = Number(span.getAttribute("data-criterion-b-set-index"));
    const set = setsFlat[i];
    if (!set) return;

    span.addEventListener("mouseenter", () => {
      clearCriterionBTooltipHide();
      fillCriterionBTooltip(span, set, i);
    });
    span.addEventListener("mouseleave", () => scheduleHideCriterionBTooltip());
    span.addEventListener("focus", () => {
      clearCriterionBTooltipHide();
      fillCriterionBTooltip(span, set, i);
    });
    span.addEventListener("blur", () => scheduleHideCriterionBTooltip());
  });

  if (criterionBTooltip && !criterionBTooltipHoverBound) {
    criterionBTooltip.addEventListener("mouseenter", () => clearCriterionBTooltipHide());
    criterionBTooltip.addEventListener("mouseleave", () => scheduleHideCriterionBTooltip());
    criterionBTooltipHoverBound = true;
  }

  boundScrollRepositionB = () => {
    if (!criterionBTooltip || criterionBTooltip.hidden) return;
    const active = document.activeElement;
    if (active && active.getAttribute("data-criterion-b-set-index") !== null) {
      positionCriterionBTooltip(active);
    }
  };
  window.addEventListener("scroll", boundScrollRepositionB, true);
}

/**
 * @param {object} data
 * @returns {number | null}
 */
function computeCriterionBMeanScaledTo5(data) {
  const sets = flattenCriterionBSets(data);
  if (!sets.length) return null;
  let sumW = 0;
  for (const s of sets) {
    sumW += computeCriterionBWeighted(s);
  }
  const meanW = sumW / sets.length;
  const scaled = (meanW / 9) * 5;
  return Math.round(scaled * 10) / 10;
}

/**
 * Essay-mode parent bundle: whole-essay holistic checks (shifts + genre-specific). Hidden if not essay.
 * @param {{ version?: number, essayMode?: boolean, criterionBEssayHolisticChecks?: object, criterionBEssayHolisticChecksRawJson?: string } | null} bundle
 */
function renderCriterionBEssayHolisticChecksPanel(bundle) {
  const section = document.getElementById("criterionBEssayHolisticSection");
  const out = document.getElementById("criterionBEssayHolisticOutput");
  if (!section || !out) return;

  if (!bundle || bundle.version !== 2 || !bundle.essayMode) {
    section.hidden = true;
    out.innerHTML = "";
    if (section.dataset) delete section.dataset.rawEssayHolisticJson;
    return;
  }

  section.hidden = false;
  if (section.dataset) {
    if (bundle.criterionBEssayHolisticChecksRawJson) {
      section.dataset.rawEssayHolisticJson = bundle.criterionBEssayHolisticChecksRawJson;
    } else {
      delete section.dataset.rawEssayHolisticJson;
    }
  }

  const chk = bundle.criterionBEssayHolisticChecks;
  if (!chk || typeof chk !== "object") {
    out.innerHTML =
      '<p class="output-hint">No full-essay holistic checks in this save. Run <strong>Criterion B</strong> again in essay mode to generate shifts and genre-specific rows.</p>';
    return;
  }

  const sr = escapeHtml(String(chk.shiftsHolisticRating ?? "—"));
  const sj = escapeHtml(String(chk.shiftsHolisticJustification ?? "—"));
  const gr = escapeHtml(String(chk.genreHolisticRating ?? "—"));
  const gj = escapeHtml(String(chk.genreHolisticJustification ?? "—"));
  const sg = escapeHtml(String(chk.sourceGenreLabel ?? "—"));

  const rows = Array.isArray(chk.shiftsPerBenchmarkRow) ? chk.shiftsPerBenchmarkRow : [];
  const shiftRowsHtml = rows.length
    ? rows
        .map((r) => {
          const ord = r.orderInPassage != null ? escapeHtml(String(r.orderInPassage)) : "—";
          const desc = escapeHtml(String(r.shiftDescriptionFromBenchmark ?? "—"));
          const ok = r.explicitlyClearlyStatedStudentVerbatim === true;
          const ev = r.studentVerbatimEvidence != null ? escapeHtml(String(r.studentVerbatimEvidence)) : "";
          const note =
            r.examinerShiftRowNote != null && String(r.examinerShiftRowNote).trim()
              ? escapeHtml(String(r.examinerShiftRowNote))
              : "—";
          return `<tr><td>${ord}</td><td>${desc}</td><td>${ok ? "Yes" : "No"}</td><td><q>${ev || "—"}</q></td><td>${note}</td></tr>`;
        })
        .join("")
    : "";

  const listToLi = (arr) => {
    const a = Array.isArray(arr) ? arr : [];
    if (!a.length) return "<li>—</li>";
    return a.map((t) => `<li>${escapeHtml(String(t))}</li>`).join("");
  };

  const html = `
    <p class="output-hint">Whole-essay pass after each body paragraph was graded; model input is the <strong>complete</strong> student essay.</p>
    <p class="b-calc"><strong>Source genre (model):</strong> ${sg}</p>
    <table class="b-check-table criterion-b-essay-holistic__main">
      <thead><tr><th scope="col">Holistic check</th><th scope="col">Rating</th><th scope="col">Examiner summary</th></tr></thead>
      <tbody>
        <tr>
          <td>Shifts vs benchmark</td>
          <td><strong>${sr}</strong></td>
          <td>${sj}</td>
        </tr>
        <tr>
          <td>Genre-specific techniques</td>
          <td><strong>${gr}</strong></td>
          <td>${gj}</td>
        </tr>
      </tbody>
    </table>
    <h3 class="criterion-b-essay-holistic__sub">Per-shift coverage (benchmark → explicit student wording?)</h3>
    ${
      rows.length
        ? `<table class="b-check-table criterion-b-essay-holistic__detail"><thead><tr><th>#</th><th>Benchmark shift</th><th>Explicit in essay</th><th>Student verbatim</th><th>Examiner note</th></tr></thead><tbody>${shiftRowsHtml}</tbody></table>`
        : '<p class="output-hint">No benchmark shift rows (N/A or empty).</p>'
    }
    <div class="criterion-b-essay-holistic__cols">
      <div>
        <h3 class="criterion-b-essay-holistic__sub">Genre-specific techniques discussed</h3>
        <ul class="criterion-b-essay-holistic__ul">${listToLi(chk.genreSpecificTechniquesFoundInEssay)}</ul>
      </div>
      <div>
        <h3 class="criterion-b-essay-holistic__sub">Non-genre-specific (generic) techniques</h3>
        <ul class="criterion-b-essay-holistic__ul">${listToLi(chk.nonGenreSpecificTechniquesFoundInEssay)}</ul>
      </div>
    </div>
  `;

  out.innerHTML = window.DOMPurify.sanitize(html, { ADD_ATTR: ["class"] });
}

/**
 * Final Criterion B mark (official IB descriptor bands, 0–5 in 0.5 steps) + examiner report.
 * @param {{ criterionBFinalExaminer?: object, criterionBFinalExaminerRawJson?: string } | null} bundle
 */
function renderCriterionBFinalExaminerPanel(bundle) {
  const section = document.getElementById("criterionBFinalExaminerSection");
  const out = document.getElementById("criterionBFinalExaminerOutput");
  if (!section || !out) return;

  const fe = bundle?.criterionBFinalExaminer;
  if (!fe || typeof fe !== "object" || fe.score == null) {
    section.hidden = true;
    out.innerHTML = "";
    if (section.dataset) delete section.dataset.rawFinalExaminerJson;
    return;
  }

  section.hidden = false;
  if (section.dataset) {
    if (bundle.criterionBFinalExaminerRawJson) {
      section.dataset.rawFinalExaminerJson = bundle.criterionBFinalExaminerRawJson;
    } else {
      delete section.dataset.rawFinalExaminerJson;
    }
  }

  const sc = normalizeCriterionBHolisticScore(fe.score);
  const disp =
    sc == null ? "—" : Number.isInteger(sc) ? String(sc) : sc.toFixed(1);
  const rep = fe.examinerReport != null ? escapeHtml(String(fe.examinerReport)) : "—";

  const rubric = buildCriterionBAnalysisRubricTableHtml(sc);

  const html = `
    <p class="final-grade__mean"><strong>Final mark (IB official descriptor bands):</strong> ${escapeHtml(disp)} / 5</p>
    <p class="criterion-b-holistic__label">Examiner synthesis (5–6 sentences)</p>
    <p class="criterion-b-holistic__just">${rep}</p>
    ${rubric}
  `;

  out.innerHTML = window.DOMPurify.sanitize(html, {
    ADD_ATTR: ["class", "scope", "colspan", "aria-label"],
  });
}

/**
 * @param {object} data
 * @param {string} rawJson
 */
function renderCriterionBMainOutput(fullParagraph, rawJson, data) {
  const out = document.getElementById("criterionBOutput");
  const section = document.getElementById("criterionBOutputSection");
  if (!out || !section) return;

  const html = buildCriterionBHighlightedHtml(fullParagraph, data);
  out.innerHTML = window.DOMPurify.sanitize(html, {
    ADD_ATTR: ["tabindex", "role", "aria-label", "data-criterion-b-set-index", "title"],
  });
  bindCriterionBHighlightInteractions(out, data);
  if (section.dataset) section.dataset.rawCriterionBJson = rawJson;
}

/**
 * @param {object} data
 */
function renderCriterionBPhase1Table(data) {
  const el = document.getElementById("criterionBPhase1Output");
  if (!el) return;

  const paras = Array.isArray(data.bodyParagraphs) ? data.bodyParagraphs : [];
  const rows = paras
    .map((p) => {
      const idx = p.paragraphIndex != null ? String(p.paragraphIndex) : "—";
      const ts = escapeHtml(String(p.topicSentenceVerbatim || "—"));
      const score = clampInt(p.topicSentenceScore, 0, 2);
      const tech = escapeHtml(String(p.topicSentenceTechniquesListed || "—"));
      const just = escapeHtml(String(p.topicSentenceJustification || "—"));
      return `<tr>
        <td>${escapeHtml(idx)}</td>
        <td><q>${ts}</q></td>
        <td>${escapeHtml(String(score))} / 2</td>
        <td>${tech}</td>
        <td>${just}</td>
      </tr>`;
    })
    .join("");

  const html = `
    <table class="b-phase1-table">
      <thead>
        <tr>
          <th>¶</th>
          <th>Topic sentence</th>
          <th>Score (0–2)</th>
          <th>Technique(s) named</th>
          <th>Justification</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="5">—</td></tr>`}</tbody>
    </table>
  `;
  el.innerHTML = window.DOMPurify.sanitize(html);
}

/**
 * @param {object} data
 */
function renderCriterionBSetDetailBlocks(data) {
  const out = document.getElementById("criterionBSetBlocks");
  if (!out) return;

  const paras = Array.isArray(data.bodyParagraphs) ? data.bodyParagraphs : [];
  let globalSetIdx = 0;
  const blocks = [];

  for (const p of paras) {
    const pIdx = p.paragraphIndex != null ? p.paragraphIndex : 0;
    const sets = Array.isArray(p.analysisSets) ? p.analysisSets : [];
    const tsText = p.topicSentenceVerbatim != null ? String(p.topicSentenceVerbatim) : "";
    const tsScore = clampInt(p.topicSentenceScore, 0, 2);
    const tsTech = escapeHtml(String(p.topicSentenceTechniquesListed || "—"));
    const tsJust = escapeHtml(String(p.topicSentenceJustification || "—"));

    if (tsText || sets.length > 0) {
      blocks.push(`
        <div class="criterion-b-topic-box" id="cb-topic-${escapeHtml(String(pIdx))}">
          <h3 class="criterion-b-topic-box__title">Paragraph ${escapeHtml(String(pIdx))} — Topic sentence (Phase 1)</h3>
          ${tsText ? `<blockquote class="criterion-b-topic-box__quote"><q>${escapeHtml(tsText)}</q></blockquote>` : ""}
          <p class="criterion-b-topic-box__meta"><strong>Score:</strong> ${escapeHtml(String(tsScore))} / 2 · <strong>Technique(s):</strong> ${tsTech}</p>
          <p class="criterion-b-topic-box__meta">${tsJust}</p>
        </div>
      `);
    }

    for (let j = 0; j < sets.length; j++) {
      const set = sets[j];
      globalSetIdx += 1;
      const v2 = isCriterionBSetScoringV2(set);
      const x = v2 ? clampInt(set.techniqueQualityScore, 0, 2) : clampInt(set.techniqueQualityScore, 0, 3);
      const w = computeCriterionBWeighted(set);
      const techNamed = escapeHtml(String(set.techniqueNamed || "—"));
      const ck = getCriterionBCheckpointTrueCount(set);
      const ckPts = getCriterionBCheckpointBandPoints(ck);
      const ac = v2 ? getCriterionBReasoningACSum(set) : getCriterionBReasoningScoreComputed(set);
      const adj = v2 ? getCriterionBReasoningAdjustment(set) : null;

      const tableRows = v2
        ? [
            [
              "Technique quality (0–2)",
              `${escapeHtml(String(x))} / 2`,
              escapeHtml(String(set.techniqueQualityJustification || "—")),
            ],
            [
              "Specific role / function",
              boolToMark(set.specificRole_met),
              escapeHtml(String(set.specificRole_notes || "—")),
            ],
            [
              "Link to message",
              boolToMark(set.linkToMessage_met),
              escapeHtml(String(set.linkToMessage_notes || "—")),
            ],
            [
              "Subtle implications",
              boolToMark(set.subtleImplications_met),
              escapeHtml(String(set.subtleImplications_notes || "—")),
            ],
            [
              "Audience impact",
              boolToMark(set.audienceImpact_met),
              escapeHtml(String(set.audienceImpact_notes || "—")),
            ],
            [
              "(a) Deducible conclusion",
              `${escapeHtml(String(clampInt(set.reasoningDeducibleConclusion, 0, 2)))} / 2`,
              "<em>Criterion A–parallel (a)</em>",
            ],
            [
              "(c) Linear coherence",
              `${escapeHtml(String(clampInt(set.reasoningLinearCoherence, 0, 1)))} / 1`,
              "<em>Criterion A–parallel (c)</em>",
            ],
            [
              "(a)+(c) justification",
              "—",
              escapeHtml(String(set.criterionBReasoningJustificationAC || "—")),
            ],
            [
              "<strong>Checkpoint band (computed)</strong>",
              `<strong>${escapeHtml(String(ckPts))} pts</strong>`,
              `<em>${escapeHtml(String(ck))} checkpoint(s) true → 0 / 2 / 4 / 6 band.</em>`,
            ],
            [
              "<strong>Reasoning adjustment (computed)</strong>",
              `<strong>${escapeHtml(String(adj != null && adj > 0 ? `+${adj}` : adj))}</strong>`,
              "<em>(a)+(c) sum 3 → +1, 2 → 0, 0–1 → −1.</em>",
            ],
            [
              "<strong>Total set score (computed)</strong>",
              `<strong>${escapeHtml(w.toFixed(1))} / 9</strong>`,
              "<em>technique + checkpoint band + adjustment, capped 0–9.</em>",
            ],
          ]
        : [
            [
              "Technique quality (0–3)",
              `${escapeHtml(String(x))} / 3`,
              escapeHtml(String(set.techniqueQualityJustification || "—")),
            ],
            [
              "Specific role / function",
              boolToMark(set.specificRole_met),
              escapeHtml(String(set.specificRole_notes || "—")),
            ],
            [
              "Link to message",
              boolToMark(set.linkToMessage_met),
              escapeHtml(String(set.linkToMessage_notes || "—")),
            ],
            [
              "Subtle implications",
              boolToMark(set.subtleImplications_met),
              escapeHtml(String(set.subtleImplications_notes || "—")),
            ],
            [
              "Audience impact",
              boolToMark(set.audienceImpact_met),
              escapeHtml(String(set.audienceImpact_notes || "—")),
            ],
            [
              "Logical consistency (−1 to reasoning sum if ❌)",
              boolToMark(set.logicalConsistency_ok),
              escapeHtml(String(set.logicalConsistency_notes || "—")),
            ],
            [
              "<strong>Reasoning total (computed)</strong>",
              `<strong>${escapeHtml(String(ac))} / 4</strong>`,
              "<em>Sum of four checks, minus 1 if logical consistency is ❌; clamped 0–4 in browser.</em>",
            ],
            [
              "<strong>Weighted total (computed, legacy)</strong>",
              `<strong>${escapeHtml(w.toFixed(1))} / 9</strong>`,
              "<em>techniqueQuality + reasoningTotal × 1.5</em>",
            ],
          ];

      const bodyHtml = tableRows
        .map(
          ([req, status, notes]) =>
            `<tr><td>${req}</td><td>${status}</td><td>${notes}</td></tr>`
        )
        .join("");

      blocks.push(`
        <div class="criterion-b-set-block" id="cb-set-${globalSetIdx - 1}">
          <h3>Paragraph ${escapeHtml(String(pIdx))} · Set ${j + 1} (global ${globalSetIdx}) — Technique audit</h3>
          <p class="b-calc"><strong>Technique named:</strong> ${techNamed}</p>
          <p class="b-calc"><strong>Evidence / analysis span (verbatim):</strong> <q>${escapeHtml(String(set.verbatim || ""))}</q></p>
          <table class="b-check-table">
            <thead>
              <tr><th>Requirement</th><th>Status (✅/❌ or score)</th><th>Notes / Justification</th></tr>
            </thead>
            <tbody>
              ${bodyHtml}
            </tbody>
          </table>
        </div>
      `);
    }
  }

  out.innerHTML = window.DOMPurify.sanitize(blocks.join(""), { ADD_ATTR: ["id"] });
}
