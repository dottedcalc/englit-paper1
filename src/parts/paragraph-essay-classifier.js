/**
 * Paragraph vs essay classification (Gemini). Criteria A–D stay disabled until the current
 * analysis text is classified (single paragraph, or essay with verbatim intro/bodies/conclusion split).
 * Paragraph vs essay follows typographic boundaries in the paste, not thematic structure.
 * Essay intro/body/conclusion split keeps typographic blocks intact but labels them using rhetorical
 * roles (thesis/orientation vs analysis vs synthesis) — see buildEssayVerbatimSplitMessage.
 */

const CLASSIFY_PARAGRAPH_ESSAY_BTN_DEFAULT = "Classify paragraph or essay";

const CLASSIFY_BEFORE_CRITERIA_TITLE =
  "Classify your analysis as a paragraph or essay first (button above the criteria tiles).";

const STORAGE_PARAGRAPH_CLASSIFICATION_V1 = "ib-paper1-paragraph-classification-v1";

/** @type {{ text: string, kind: 'paragraph' | 'essay', rationale: string, essayParts?: { intro: string, bodyParagraphs: string[], conclusion: string } } | null} */
let paragraphClassificationRecord = null;

/**
 * Same gate as disabling the classify button: paragraph classified, or essay with successful split.
 * @returns {boolean}
 */
function paragraphClassifiedLocksTextareas() {
  const para = studentParagraph?.value.trim() ?? "";
  const rec = paragraphClassificationRecord;
  return (
    !!rec &&
    rec.text === para &&
    (rec.kind === "paragraph" || (rec.kind === "essay" && !!rec.essayParts))
  );
}

function syncClassifiedTextareaLocks() {
  const lock = paragraphClassifiedLocksTextareas();
  if (sourceText) {
    sourceText.readOnly = lock;
    if (lock) sourceText.setAttribute("aria-readonly", "true");
    else sourceText.removeAttribute("aria-readonly");
  }
  if (studentParagraph) {
    studentParagraph.readOnly = lock;
    if (lock) studentParagraph.setAttribute("aria-readonly", "true");
    else studentParagraph.removeAttribute("aria-readonly");
  }
  const panel = studentParagraph?.closest(".input-panel");
  if (panel) panel.classList.toggle("input-panel--classified-locked", lock);
}

function persistParagraphClassificationRecord() {
  try {
    if (!paragraphClassificationRecord) {
      localStorage.removeItem(STORAGE_PARAGRAPH_CLASSIFICATION_V1);
      return;
    }
    localStorage.setItem(STORAGE_PARAGRAPH_CLASSIFICATION_V1, JSON.stringify(paragraphClassificationRecord));
  } catch {
    /* ignore */
  }
}

/**
 * After draft text is loaded, restore classification if it matches the current analysis field.
 */
function tryRestoreParagraphClassificationRecordAfterDraftLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_PARAGRAPH_CLASSIFICATION_V1);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || !obj.text || (obj.kind !== "paragraph" && obj.kind !== "essay")) {
      return;
    }
    const current = studentParagraph?.value.trim() ?? "";
    if (current !== String(obj.text).trim()) return;
    paragraphClassificationRecord = obj;
    updateParagraphFormatLabelUI();
    updateEssayModeChrome();
    syncClassifyParagraphEssayButtonState();
    syncDashboardCriterionRunLocks();
  } catch {
    /* ignore */
  } finally {
    syncClassifiedTextareaLocks();
  }
}

function renderEssayStructureOnHomepage() {
  const wrap = document.getElementById("essayStructurePreview");
  if (!wrap) return;

  const para = studentParagraph?.value.trim() ?? "";
  const rec = paragraphClassificationRecord;
  if (!rec || rec.text !== para || rec.kind !== "essay" || !rec.essayParts) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }

  const { intro, bodyParagraphs, conclusion } = rec.essayParts;
  const bodies = Array.isArray(bodyParagraphs) ? bodyParagraphs : [];
  const hasIntro = !!(intro && String(intro).trim());
  const hasConclusion = !!(conclusion && String(conclusion).trim());
  const nBody = bodies.length;

  const segments = [];
  if (hasIntro) segments.push("introduction");
  if (nBody > 0) segments.push(`${nBody} body paragraph${nBody === 1 ? "" : "s"}`);
  if (hasConclusion) segments.push("conclusion");

  const structureLine =
    segments.length > 0
      ? `Detected structure: ${segments.join(", ")}.`
      : "Essay classified; use the response box above for the full text.";

  wrap.innerHTML = window.DOMPurify.sanitize(
    `<p class="essay-structure-preview__title">Essay structure (outline only)</p>
    <p class="essay-structure-preview__summary">${escapeHtml(structureLine)}</p>`,
    { ADD_ATTR: ["class"] }
  );
  wrap.hidden = false;
}

const PARAGRAPH_ESSAY_CLASSIFIER_SCHEMA = {
  type: "object",
  properties: {
    classification: {
      type: "string",
      enum: ["paragraph", "essay"],
      description:
        "paragraph = one typographic block: no formatting boundary that marks a new paragraph. essay = two or more typographic blocks separated by line breaks (see prompt); ignore how many ideas or themes appear.",
    },
    rationale: {
      type: "string",
      description: "One short sentence citing the formatting cue (e.g. blank line, extra newline), not the student’s ideas.",
    },
  },
  required: ["classification"],
};

function buildParagraphEssayClassifierMessage(studentText) {
  const body = String(studentText || "").trim();
  return `You classify a student's IB English Paper 1 style written analysis submission.

Decide whether the text is **one typographic paragraph** or **multiple typographic paragraphs** in their paste.

Use **formatting only**. Do **not** use topic shifts, number of claims, “essay-like” structure, intro/body/conclusion roles, or thematic sections.

**Typographic paragraph boundary** (counts toward “essay”):
- A **blank line** (newline, optional spaces, newline) between non-empty text, **or**
- A **hard line break** (single newline) that starts a **new line of text** so that, when you split on newlines and drop only fully empty lines, you get **two or more non-empty lines** — unless every newline is clearly **mid-sentence wrapping** (e.g. no punctuation/end before the break and the next line continues the same clause). When unsure, prefer **paragraph**.

**paragraph**: After the rule above, the submission is still **one** block (one typographic paragraph). Internal single newlines that look like soft wrap of one paragraph still count as **paragraph**.

**essay**: Two or more typographic blocks by the rule above.

Output JSON only per schema.

[Student submission]
${body}`;
}

const ESSAY_VERBATIM_SPLIT_SCHEMA = {
  type: "object",
  properties: {
    introduction: {
      type: "string",
      description:
        "Verbatim opening: thesis/orientation only—no sustained close analysis or substantial quotation (see essay-split prompt). Empty string if there is no separable introduction (e.g. essay opens with analysis) or the first block is already body-level analysis.",
    },
    body_paragraphs: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      description:
        "Each item one typographic paragraph, verbatim in order: the analytical core (claims tied to evidence, techniques, quotations, close reading). Do not merge/split blocks; do not edit characters.",
    },
    conclusion: {
      type: "string",
      description:
        "Verbatim closing: synthesis/sign-off (e.g. in conclusion), thesis restatement, elevation—little new close reading. Empty if there is no separable conclusion (essay may end on analysis) or no such block after the last body paragraph.",
    },
  },
  required: ["introduction", "body_paragraphs", "conclusion"],
};

function buildEssayVerbatimSplitMessage(studentText) {
  const body = String(studentText || "");
  return `You segment a student's IB English Paper 1 analysis ESSAY into introduction, body paragraph(s), and conclusion.

Not every essay has all three parts: some begin with analysis (no introduction), or finish without a distinct closing paragraph (no conclusion). Use \`""\` for introduction and/or conclusion when absent; **body_paragraphs** must still list at least one typographic block.

**Step A — typographic blocks (do not merge or split):**
1. Split the submission into **typographic paragraphs** in order (blank lines and hard line breaks between non-empty lines; same rule as “paragraph vs essay”). Each block stays one contiguous string—never merge two blocks into one JSON field or split one block across fields.

**Step B — rhetorical roles (assign whole blocks only):**
You choose where **body** begins and ends; **introduction** is all typographic paragraphs **before** the first body block; **conclusion** is all typographic paragraphs **after** the last body block. A valid essay-shaped response can be **body only**, **intro + body**, **body + conclusion**, or **intro + body + conclusion**—do not invent intro or conclusion text; only empty strings when the student truly did not supply that section.

**Introduction** (may be empty string \`""\`):
- Frames the task, orients the reader, and usually states a **thesis** / line of argument about the unseen.
- Does **not** carry the main **close analysis**: avoid classifying a block as introduction if it **chiefly** quotes the passage at length, walks through **specific** textual details/devices, or develops **evidence-led analytical claims** about how the author creates meaning. Those belong in **body**.
- If the **first** typographic paragraph is already doing that kind of analysis, set **introduction** to \`""\` and put that paragraph as **body_paragraphs[0]** (no fake “intro” that is really analysis).

**Body paragraph(s)** (at least one):
- Paragraphs where the student **analyzes**: techniques, effects, implications, usually with **quotation** or tight reference to **specific** language/form/structure.
- **body_paragraphs** = one JSON array element per **consecutive** typographic body block, in reading order—the graded analytical core.

**Conclusion** (may be empty):
- Closing move: often **signposts** closure (“In conclusion”, “To conclude”, “Ultimately” as wrap-up), **restates** or **reaffirms** the thesis, **elevates** to broader insight or evaluation.
- Typically **little new** sustained close reading or **new** long quotations compared to body paragraphs; if the final typographic paragraph is still introducing substantial quote-driven analysis, treat it as the **last body** paragraph, not conclusion.

**Tie-breaks:** When unsure whether the first block is intro vs body, prefer **body** if the paragraph is dominated by analysis and textual evidence. When unsure whether the last block is body vs conclusion, prefer **conclusion** only if it reads as synthesis/sign-off; otherwise **body**.

**Step C — verbatim assembly:**
- **introduction** = verbatim join (in order) of every typographic paragraph before the first body block (or \`""\`).
- **conclusion** = verbatim join of every typographic paragraph after the last body block (or \`""\`).
- Concatenating introduction + each body_paragraph in order + conclusion must equal the full student text with nothing missing or extra.

CRITICAL — verbatim rule:
- Copy every character from the student text below. Do not paraphrase, summarize, fix spelling, change punctuation, normalize line breaks, trim, or add text.

Output JSON only per schema.

[Student essay — exact text]
${body}`;
}

/**
 * @param {string} fullText
 * @param {string} introduction
 * @param {string[]} bodyParagraphs
 * @param {string} conclusion
 * @returns {{ ok: boolean, message?: string }}
 */
function validateVerbatimEssaySlices(fullText, introduction, bodyParagraphs, conclusion) {
  const bodies = Array.isArray(bodyParagraphs) ? bodyParagraphs : [];
  if (bodies.length === 0) {
    return { ok: false, message: "Essay split returned no body paragraphs. Try classifying again." };
  }
  for (let i = 0; i < bodies.length; i++) {
    if (typeof bodies[i] !== "string" || !bodies[i].trim()) {
      return {
        ok: false,
        message: `Body paragraph ${i + 1} was empty. Each body paragraph must be copied verbatim from your text.`,
      };
    }
  }
  const introS = introduction == null ? "" : String(introduction);
  const concS = conclusion == null ? "" : String(conclusion);
  let cursor = 0;
  const ordered = [introS, ...bodies.map(String), concS];
  for (const segment of ordered) {
    if (!segment) continue;
    const idx = fullText.indexOf(segment, cursor);
    if (idx < 0) {
      return {
        ok: false,
        message:
          "Essay split did not match your text verbatim (intro, each body paragraph, then conclusion, in order). Edit typos or spacing only in your paste, or classify again.",
      };
    }
    cursor = idx + segment.length;
  }
  if (!/^\s*$/.test(fullText.slice(cursor))) {
    return {
      ok: false,
      message:
        "Essay split must account for the full submission in order with no leftover text. Try classifying again.",
    };
  }
  return { ok: true };
}

/**
 * @param {string} apiKey
 * @param {string} studentText trimmed full essay
 * @returns {Promise<{ introduction: string, body_paragraphs: string[], conclusion: string }>}
 */
async function splitEssayVerbatimPartsWithGemini(apiKey, studentText) {
  const text = String(studentText || "");
  if (!text.trim()) {
    throw new Error("Paste your essay before classifying.");
  }
  const prompt = buildEssayVerbatimSplitMessage(text);
  /** Verbatim essay JSON echoes the full submission (often 2×+ raw size when escaped); use the same large JSON cap as graders. */
  let raw;
  try {
    raw = await callGemini(apiKey, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      temperature: 0.5,
      responseMimeType: "application/json",
      responseSchema: ESSAY_VERBATIM_SPLIT_SCHEMA,
    });
  } catch (firstErr) {
    try {
      raw = await callGemini(apiKey, prompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        temperature: 0.5,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }
  let data;
  try {
    data = parseModelJsonObject(raw);
  } catch {
    throw new Error("Essay split did not return valid JSON. Try again.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Essay split failed. Try again.");
  }
  const intro = data.introduction == null ? "" : String(data.introduction);
  const conc = data.conclusion == null ? "" : String(data.conclusion);
  const bp = Array.isArray(data.body_paragraphs) ? data.body_paragraphs.map((x) => String(x)) : [];
  return { introduction: intro, body_paragraphs: bp, conclusion: conc };
}

/**
 * Mean of numeric scores, clamped to [0, 5], then rounded to nearest 0.5.
 * @param {(number | null | undefined)[]} scores
 * @returns {number | null}
 */
function meanScoresClampToNearestHalfStep(scores) {
  const ok = (scores || []).filter((s) => s != null && Number.isFinite(s));
  if (ok.length === 0) return null;
  const mean = ok.reduce((a, b) => a + b, 0) / ok.length;
  const clamped = Math.min(5, Math.max(0, mean));
  return Math.round(clamped * 2) / 2;
}

/**
 * @returns {string[] | null} Paragraph text(s) to grade, or null if not ready.
 */
function getEssayBodyParagraphsForGrading() {
  const para = studentParagraph?.value.trim() ?? "";
  if (!paragraphClassificationRecord || paragraphClassificationRecord.text !== para) return null;
  if (paragraphClassificationRecord.kind === "paragraph") return [para];
  const bp = paragraphClassificationRecord.essayParts?.bodyParagraphs;
  if (!Array.isArray(bp) || bp.length === 0) return null;
  return bp.slice();
}

function getEssayMetaFromClassificationRecord() {
  const ep = paragraphClassificationRecord?.essayParts;
  return {
    essayIntro: ep?.intro != null ? String(ep.intro) : "",
    essayConclusion: ep?.conclusion != null ? String(ep.conclusion) : "",
    essayBodyParagraphs: Array.isArray(ep?.bodyParagraphs) ? ep.bodyParagraphs.slice() : [],
  };
}

/**
 * Full student analysis text for downstream passes (essay parts in order, else single textarea).
 * @returns {string}
 */
function getFullStudentAnalysisTextForIbModeration() {
  const ta = studentParagraph?.value.trim() ?? "";
  const rec = paragraphClassificationRecord;
  if (rec && rec.text === ta && rec.kind === "essay" && rec.essayParts) {
    const intro = rec.essayParts.intro != null ? String(rec.essayParts.intro).trim() : "";
    const conclusion = rec.essayParts.conclusion != null ? String(rec.essayParts.conclusion).trim() : "";
    const bodies = Array.isArray(rec.essayParts.bodyParagraphs) ? rec.essayParts.bodyParagraphs : [];
    const parts = [];
    if (intro) parts.push(intro);
    for (const b of bodies) {
      const t = b != null ? String(b).trim() : "";
      if (t) parts.push(t);
    }
    if (conclusion) parts.push(conclusion);
    if (parts.length > 0) return parts.join("\n\n");
  }
  return ta;
}

function updateEssayModeChrome() {
  const para = studentParagraph?.value.trim() ?? "";
  const essayActive =
    !!paragraphClassificationRecord &&
    paragraphClassificationRecord.text === para &&
    paragraphClassificationRecord.kind === "essay" &&
    !!paragraphClassificationRecord.essayParts;
  const panel = studentParagraph?.closest(".input-panel");
  const titleEl = document.querySelector(".student-head .panel-title");
  if (panel) panel.classList.toggle("input-panel--essay-mode", essayActive);
  if (studentParagraph) {
    studentParagraph.classList.toggle("textarea--essay-mode", essayActive);
    studentParagraph.placeholder = essayActive
      ? "Full essay: intro, body paragraph(s), and conclusion in order. Body paragraphs are graded separately; the tile shows the moderated Criterion A score."
      : "Paste your Paper 1 analytical response (one paragraph or full essay)…";
  }
  if (titleEl) {
    titleEl.textContent = "Your Analytical Response";
  }
  renderEssayStructureOnHomepage();
}

function syncClassifyParagraphEssayButtonState() {
  const btn = document.getElementById("classifyParagraphEssayBtn");
  const labelSpan = btn?.querySelector(".classify-paragraph-essay__label");
  if (!btn) {
    syncClassifiedTextareaLocks();
    return;
  }
  if (btn.dataset.classifying === "1") {
    btn.disabled = true;
    syncClassifiedTextareaLocks();
    return;
  }
  const para = studentParagraph?.value.trim() ?? "";
  const rec = paragraphClassificationRecord;
  const locked =
    !!rec &&
    rec.text === para &&
    (rec.kind === "paragraph" || (rec.kind === "essay" && !!rec.essayParts));
  btn.disabled = !!locked;
  if (labelSpan) {
    if (!locked) {
      labelSpan.textContent = CLASSIFY_PARAGRAPH_ESSAY_BTN_DEFAULT;
    } else if (rec.kind === "paragraph") {
      labelSpan.textContent = "Paragraph classified — Clear all to reset";
    } else {
      labelSpan.textContent = "Essay classified — Clear all to reset";
    }
  }
  syncClassifiedTextareaLocks();
}

/**
 * @returns {boolean} True when criteria may run for the current analysis text.
 */
function paragraphFormatCriteriaGateOpen() {
  const para = studentParagraph?.value.trim() ?? "";
  if (!para) return false;
  if (!paragraphClassificationRecord || paragraphClassificationRecord.text !== para) return false;
  if (paragraphClassificationRecord.kind === "paragraph") return true;
  if (paragraphClassificationRecord.kind === "essay") {
    const bp = paragraphClassificationRecord.essayParts?.bodyParagraphs;
    return Array.isArray(bp) && bp.length > 0;
  }
  return false;
}

function resetParagraphClassificationForDashboard() {
  paragraphClassificationRecord = null;
  updateParagraphFormatLabelUI();
  updateEssayModeChrome();
  persistParagraphClassificationRecord();
}

/**
 * Call when the student paragraph field may have diverged from the last classification.
 */
function invalidateParagraphClassificationIfStudentTextChanged() {
  const t = studentParagraph?.value.trim() ?? "";
  if (!paragraphClassificationRecord) return;
  if (paragraphClassificationRecord.text !== t) {
    paragraphClassificationRecord = null;
    updateParagraphFormatLabelUI();
    updateEssayModeChrome();
    persistParagraphClassificationRecord();
    setError("");
    syncDashboardCriterionRunLocks();
  }
}

/**
 * @param {string} apiKey
 * @param {string} trimmedParagraph
 * @returns {Promise<{ kind: 'paragraph' | 'essay', rationale: string }>}
 */
async function classifyParagraphOrEssayWithGemini(apiKey, trimmedParagraph) {
  const para = String(trimmedParagraph || "").trim();
  if (!para) {
    throw new Error("Paste your analysis paragraph before classifying.");
  }

  const prompt = buildParagraphEssayClassifierMessage(para);
  let raw;
  try {
    raw = await callGemini(apiKey, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON_COMPACT,
      temperature: 0.5,
      responseMimeType: "application/json",
      responseSchema: PARAGRAPH_ESSAY_CLASSIFIER_SCHEMA,
    });
  } catch (firstErr) {
    try {
      raw = await callGemini(apiKey, prompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON_COMPACT,
        temperature: 0.5,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }

  let data;
  try {
    data = parseModelJsonObject(raw);
  } catch {
    throw new Error("Classification did not return valid JSON. Try again.");
  }

  if (!data || typeof data !== "object") {
    throw new Error("Classification failed. Try again.");
  }

  const kind = String(data.classification || "")
    .trim()
    .toLowerCase();
  if (kind !== "paragraph" && kind !== "essay") {
    throw new Error("Classification failed. Try again.");
  }

  const rationale = String(data.rationale || "").trim();
  return { kind, rationale };
}

function updateParagraphFormatLabelUI() {
  const wrap = document.getElementById("paragraphFormatLabelWrap");
  const labelEl = document.getElementById("paragraphFormatLabel");
  const rationaleEl = document.getElementById("paragraphFormatRationale");
  if (!wrap || !labelEl || !rationaleEl) {
    syncClassifiedTextareaLocks();
    return;
  }

  const para = studentParagraph?.value.trim() ?? "";
  if (!paragraphClassificationRecord || paragraphClassificationRecord.text !== para) {
    wrap.hidden = true;
    labelEl.textContent = "";
    rationaleEl.textContent = "";
    rationaleEl.hidden = true;
    wrap.classList.remove("paragraph-format-label-wrap--paragraph", "paragraph-format-label-wrap--essay");
    renderEssayStructureOnHomepage();
    syncClassifiedTextareaLocks();
    return;
  }

  wrap.hidden = false;
  wrap.classList.toggle("paragraph-format-label-wrap--paragraph", paragraphClassificationRecord.kind === "paragraph");
  wrap.classList.toggle("paragraph-format-label-wrap--essay", paragraphClassificationRecord.kind === "essay");

  if (paragraphClassificationRecord.kind === "paragraph") {
    labelEl.textContent = "Label: single paragraph";
  } else if (paragraphClassificationRecord.essayParts) {
    const n = paragraphClassificationRecord.essayParts.bodyParagraphs.length;
    labelEl.textContent = `Label: essay — ${n} body paragraph${n === 1 ? "" : "s"} to grade`;
  } else {
    labelEl.textContent = "Label: essay (split pending)";
  }

  if (paragraphClassificationRecord.rationale) {
    rationaleEl.textContent = paragraphClassificationRecord.rationale;
    rationaleEl.hidden = false;
  } else {
    rationaleEl.textContent = "";
    rationaleEl.hidden = true;
  }

  renderEssayStructureOnHomepage();
  syncClassifiedTextareaLocks();
}

function guardClassifiedTextareaMutations(ev) {
  if (!paragraphClassifiedLocksTextareas()) return;
  ev.preventDefault();
}

(function wireClassifiedTextareaMutationGuards() {
  if (!sourceText || !studentParagraph) return;
  ["beforeinput", "paste", "cut", "drop"].forEach((type) => {
    sourceText.addEventListener(type, guardClassifiedTextareaMutations);
    studentParagraph.addEventListener(type, guardClassifiedTextareaMutations);
  });
})();
