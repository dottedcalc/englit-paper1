// ═══════════════════════════════════════════════════════════════════════════════
// CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

async function classifyResponse(sourceText, studentText) {
  const system = `You are an IB English A Paper 1 examiner assistant.
Decide whether the student's response is ONE analytical paragraph or a FULL analytical essay.

Definitions:
- "paragraph": a single unified analytical paragraph (no intro/conclusion structure).
- "essay": a full response with an introduction, body paragraphs, and a conclusion.

Return JSON with exactly these fields:
{
  "type": "paragraph" | "essay",
  "rationale": "One sentence explaining your decision.",
  "paragraphs": ["<body paragraph 1 verbatim>", ...]
}

For "paragraph" type: paragraphs = [<the entire student text verbatim>].
For "essay" type: paragraphs = body paragraphs only (exclude intro and conclusion).
Never paraphrase — copy text verbatim.`;

  const user = `Source text:\n${sourceText}\n\nStudent response:\n${studentText}`;
  const raw = await callApi(system, user);
  return parseJson(raw);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNKER  — sentence-aware split at ~30–40 words per chunk
// ═══════════════════════════════════════════════════════════════════════════════

const CHUNK_TARGET_WORDS = 35;

/**
 * Split text into chunks of roughly `targetWords` words, never breaking
 * mid-sentence. Each chunk is 2–3 sentences on average.
 */
/**
 * Split student text into ~CHUNK_TARGET_WORDS chunks, never crossing a paragraph boundary.
 * Returns { chunks: string[], paraStartSet: Set<number> }
 * where paraStartSet contains the chunk index of the first chunk of each paragraph.
 */
function splitIntoChunks(text, targetWords = CHUNK_TARGET_WORDS) {
  const paragraphs = text.split(/\n+/);
  const chunks = [];
  const paraStartSet = new Set();

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    paraStartSet.add(chunks.length); // this chunk starts a new paragraph

    const sentences = trimmed.match(/[^.!?…]+[.!?…]+(?:\s|$)|[^.!?…]+$/g) ?? [trimmed];
    let current = [];
    let wordCount = 0;

    for (const sentence of sentences) {
      const s = sentence.trim();
      if (!s) continue;
      current.push(s);
      wordCount += s.split(/\s+/).length;
      if (wordCount >= targetWords) {
        chunks.push(current.join(' '));
        current = [];
        wordCount = 0;
      }
    }
    if (current.length) chunks.push(current.join(' '));
  }

  return { chunks, paraStartSet };
}

/** Normalise whitespace for stable comparisons (chunking can change if whitespace changes). */
function studentEssaySig(studentText) {
  return String(studentText ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Holistic within-band position: 1–3 (lower/middle/upper). Legacy saved values of 4 map to 3. */
function normalizeHolisticPosition(raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 4) return 3;
  return clampInt(n, 1, 3);
}

function clampInt(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, Math.trunc(x)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Call an async fn with retries and exponential backoff. Used for per-chunk
 * API calls so transient glitches (5xx, timeouts, malformed JSON, rate-limits)
 * don't abort the reading pass — only a persistent failure does.
 */
async function withRetry(fn, { label = 'op', tries = 3, baseMs = 1200 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message ?? err);
      const transient = /(fetch|network|timeout|abort|5\d\d|429|json|parse|quota)/i.test(msg);
      if (attempt >= tries || !transient) throw err;
      const backoff = baseMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 400);
      console.warn(`[retry] ${label} attempt ${attempt}/${tries} failed: ${msg} — retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL TIERS + TYPICAL-RUN COST (UI)
// ═══════════════════════════════════════════════════════════════════════════════

const KEY_MODEL_TIER = 'ib-grader-model-tier';

const OPENROUTER_MODELS_BY_TIER = {
  premium: [
    { id: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6' },
    { id: 'openai/gpt-5.4', label: 'GPT-5.4' },
    { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)' },
  ],
  accessible: [
    /** OpenRouter id uses hyphens: `…-v3-0324`, not `…-v3.0324`. */
    { id: 'deepseek/deepseek-chat-v3-0324', label: 'DeepSeek V3' },
    { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)' },
    { id: 'openai/gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
    { id: 'x-ai/grok-4-fast', label: 'Grok 4 Fast' },
  ],
  free: [
    { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B Instruct (free)' },
    { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (free)' },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super (free)' },
  ],
};

const MODEL_TIER_ORDER = ['premium', 'accessible', 'free'];

/** Removed or renamed slugs / tiers from earlier builds → current catalog id. */
const LEGACY_OPENROUTER_MODEL_ID = {
  'deepseek/deepseek-chat-v3.0324': 'deepseek/deepseek-chat-v3-0324',
  'openai/gpt-5.4-pro': 'openai/gpt-5.4',
  'anthropic/claude-sonnet-4.6': 'anthropic/claude-opus-4.6',
};

function allKnownOpenRouterModelIds() {
  const s = new Set();
  for (const t of MODEL_TIER_ORDER) {
    for (const row of OPENROUTER_MODELS_BY_TIER[t] ?? []) s.add(row.id);
  }
  return s;
}

function tierForModelId(modelId) {
  for (const t of MODEL_TIER_ORDER) {
    if ((OPENROUTER_MODELS_BY_TIER[t] ?? []).some((r) => r.id === modelId)) return t;
  }
  return null;
}

/** Mirrors `readEssaySequentiallyFromChunks` holistic scheduling (≥20% read, every 2 chunks + last). */
function countHolisticPassesForChunkCount(n) {
  let h = 0;
  for (let i = 0; i < n; i++) {
    const runHolistic = (i + 1) % 2 === 0 || i === n - 1;
    const chunkPct = (i + 1) / n;
    if (runHolistic && chunkPct >= 0.2) h++;
  }
  return h;
}

let _openRouterPricingMap = null;

async function fetchOpenRouterPricingMap() {
  if (_openRouterPricingMap) return _openRouterPricingMap;
  const res = await fetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error(`OpenRouter models ${res.status}`);
  const data = await res.json();
  const map = Object.create(null);
  for (const m of data.data ?? []) {
    map[m.id] = m.pricing ?? {};
  }
  _openRouterPricingMap = map;
  return map;
}

function parseOpenRouterUsdPerToken(s) {
  if (s == null || s === '') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatUsdEstimate(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n === 0) return '$0.00';
  if (n < 0.005) return `≈ $${n.toFixed(4)}`;
  if (n < 1) return `≈ $${n.toFixed(3)}`;
  return `≈ $${n.toFixed(2)}`;
}

function populateModelSelectForTier(selectEl, tier, preferredModelId) {
  if (!selectEl) return;
  const rows = OPENROUTER_MODELS_BY_TIER[tier] ?? [];
  selectEl.innerHTML = '';
  for (const { id, label } of rows) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    opt.dataset.tier = tier;
    selectEl.appendChild(opt);
  }
  const ids = new Set(rows.map((r) => r.id));
  const pick = preferredModelId && ids.has(preferredModelId) ? preferredModelId : rows[0]?.id;
  if (pick) {
    selectEl.value = pick;
    setModel(pick);
  }
}

function setActiveTierButton(tierBar, tier) {
  if (!tierBar) return;
  for (const btn of tierBar.querySelectorAll('.model-tier-btn')) {
    const on = btn.dataset.tier === tier;
    btn.classList.toggle('model-tier-btn--active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEQUENTIAL READER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The running notes object the reader maintains as it moves through the essay.
 * Initialised before the first chunk. Deliberately sparse — the reader has
 * seen nothing yet.
 *
 * TOTAL WORD BUDGET: ≤ 300 words across all fields at all times.
 * The reader must compress or merge earlier notes when the budget is tight.
 */
const EMPTY_BAND = { band: 'unknown', position: 0, confidence: 'unknown', note: '', shift: 'unknown' };
function initialNotes() {
  return {
    thesis: '',
    reasoning: [],
    readerState: 'Nothing read yet.',
    concerns: [],
    feeling: { A: '', B: '', C: '', D: '' },
    overallImpression: { A: { ...EMPTY_BAND }, B: { ...EMPTY_BAND }, C: { ...EMPTY_BAND }, D: { ...EMPTY_BAND } },
  };
}

// ── Response schemas (document expected JSON shape in prompts; API uses JSON object mode) ──

const ANNOTATION_TYPES = [
  'A_STAR','A_CHECK','A_CROSS','A_QUESTION','A_CURVY','A_EXCLAIM',
  'B_STAR','B_CHECK','B_D','B_CROSS','B_QUESTION','B_NO_EVAL','B_UNSUP','B_BR',
  'C_STAR','C_CHECK','C_CROSS','C_QUESTION','C_SIGNPOST','C_S','C_DRIFT','C_ICP',
  'D_SP','D_AWK','D_SD','D_WC','D_GRA','D_CHECK','D_V','D_CROSS','D_R',
];

const READ_CHUNK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    notes: {
      type: 'OBJECT',
      properties: {
        thesis:      { type: 'STRING' },
        reasoning: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              text:  { type: 'STRING' },
              depth: { type: 'INTEGER' },
            },
            required: ['text', 'depth'],
          },
        },
        readerState: { type: 'STRING' },
        concerns:    { type: 'ARRAY', items: { type: 'STRING' } },
        feeling: {
          type: 'OBJECT',
          properties: {
            A: { type: 'STRING' },
            B: { type: 'STRING' },
            C: { type: 'STRING' },
            D: { type: 'STRING' },
          },
          required: ['A', 'B', 'C', 'D'],
        },
      },
      required: ['thesis', 'reasoning', 'readerState', 'concerns', 'feeling'],
    },
    annotations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          target:    { type: 'STRING', enum: ['current', 'prev'] },
          anchor:    { type: 'STRING' },
          criterion: { type: 'STRING', enum: ['A', 'B', 'C', 'D'] },
          type:      { type: 'STRING', enum: ANNOTATION_TYPES },
          note:      { type: 'STRING' },
        },
        required: ['target', 'anchor', 'criterion', 'type', 'note'],
      },
    },
  },
  required: ['notes', 'annotations'],
};

/** Net rung on 9-point ladder: low1…low3, mid1…mid3, high1…high3. Used for holistic `shift` string enum. */
const HOLISTIC_SHIFT_STRING_ENUM = [
  'unknown',
  ...Array.from({ length: 17 }, (_, i) => String(i - 8)),
];

const OI_BAND_OBJ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    band:       { type: 'STRING', enum: ['high', 'mid', 'low', 'unknown'] },
    position:   { type: 'INTEGER' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low', 'unknown'] },
    note:       { type: 'STRING' },
    /** String enum in JSON. Net rung change on 9-rung scale; app recalculates from band+position. */
    shift:      { type: 'STRING', enum: HOLISTIC_SHIFT_STRING_ENUM },
  },
  required: ['band', 'position', 'confidence', 'note', 'shift'],
};

/** Dedicated pass: holistic impression only (runs every 2 reading chunks). */
const HOLISTIC_PASS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overallImpression: {
      type: 'OBJECT',
      properties: {
        A: OI_BAND_OBJ_SCHEMA,
        B: OI_BAND_OBJ_SCHEMA,
        C: OI_BAND_OBJ_SCHEMA,
        D: OI_BAND_OBJ_SCHEMA,
      },
      required: ['A', 'B', 'C', 'D'],
    },
  },
  required: ['overallImpression'],
};

const CRIT_SCORE_OBJ = {
  type: 'OBJECT',
  properties: {
    score:         { type: 'INTEGER' },
    keyStrengths:  { type: 'ARRAY', items: { type: 'STRING' } },
    keyWeaknesses: { type: 'ARRAY', items: { type: 'STRING' } },
    bandBoundary:  { type: 'STRING' },
    justification: { type: 'STRING' },
  },
  required: ['score', 'keyStrengths', 'keyWeaknesses', 'bandBoundary', 'justification'],
};

// Legacy single-criterion schema (kept for compatibility)
const SCORE_SCHEMA = CRIT_SCORE_OBJ;

const SCORE_ALL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    A: CRIT_SCORE_OBJ,
    B: CRIT_SCORE_OBJ,
    C: CRIT_SCORE_OBJ,
    D: CRIT_SCORE_OBJ,
  },
  required: ['A', 'B', 'C', 'D'],
};


/** Return a human-readable paragraph label for a given chunk index. */
function getParaLabel(chunkIdx, paraStartSet) {
  const sorted = [...paraStartSet].sort((a, b) => a - b);
  const total  = sorted.length;
  const paraIdx = sorted.filter(s => s <= chunkIdx).length - 1;
  if (paraIdx <= 0)            return 'Introduction';
  if (paraIdx === total - 1)   return 'Conclusion';
  return `Body paragraph ${paraIdx}`;
}

/**
 * System instructions for one sequential chunk read (same text as sent to the model).
 * @param {number} chunkIndex
 * @param {number} totalChunks
 * @param {string} paraLabel
 */
function buildReadChunkSystemPrompt(chunkIndex, totalChunks, paraLabel) {
  return `You are an IB English A Paper 1 examiner reading a complete student essay for the first time.

The essay is a full analytical response to a literary source text — it has an introduction, body paragraphs, and a conclusion, totalling roughly ${totalChunks * CHUNK_TARGET_WORDS} words. You are reading it sequentially in ${totalChunks} small chunks because you are building your notes progressively as you read, exactly as a human examiner would. The chunked delivery is only a reading mechanism — your goal is to form a holistic assessment of the entire essay.

CURRENT POSITION: Chunk ${chunkIndex + 1} of ${totalChunks} — ${paraLabel}${chunkIndex + 1 === totalChunks ? ' (final chunk)' : chunkIndex + 1 > totalChunks * 0.8 ? ' (near the end)' : chunkIndex + 1 <= 2 ? ' (beginning of essay)' : ''}.

You receive a sliding window of context around the current chunk:
• 2 chunks before (background) — for continuity
• 1 chunk before (local context) — you may annotate this if triggered by current chunk
• Current chunk — you may annotate this
• 1 chunk ahead (lookahead) — for context only; do NOT annotate it
Plus your accumulated reading notes and the source passage.

════════════════════════════════════════════════
PART 1 — UPDATE YOUR NOTES
════════════════════════════════════════════════

Notes fields (update and return as "notes" in your response):

• thesis — The student's explicitly stated thesis, paraphrased. RULES:
  - Leave as empty string "" if the student has not yet clearly stated a thesis. Do NOT infer, guess, or reconstruct one from early topic sentences, opening remarks, or contextual clues — only set it when the student has written a recognisable thesis statement.
  - Once set (non-empty), NEVER change, update, or refine it for any reason. The thesis is fixed by what the student wrote. Treat it as immutable for all future chunks.

• reasoning — A FLAT ordered list of nodes. Each node is { "text": "...", "depth": 0|1|2 }.
    depth 0 = main argumentative move or essay section (bold anchor)
    depth 1 = how that point develops, technique used, or quality of execution
    depth 2 = specifics under that point, quality remark, examples, supporting text students
  SCOPE: must map the full essay argument from the beginning to the current chunk — not just recent chunks. A reader glancing at it should grasp the shape, direction, and quality of the whole argument so far, including roughly how much essay space was devoted to each point.
  ADDING NODES:
  - Append new nodes at the end — never reorder.
  - Not every chunk needs a new depth-0 node. A chunk may add only a depth-1 or depth-2 note under an existing point.
  - Only add a depth-0 node when a genuinely new main argumentative move begins.
  COMPRESSION — when near the word limit, shorten earlier nodes' text and collapse related depth-1/2 siblings into one. Do not delete — compress.
  PACING — you are at chunk ${chunkIndex + 1} of ${totalChunks} (~${Math.round((chunkIndex + 1) / totalChunks * 100)}% through), so reasoning should occupy roughly ${Math.round((chunkIndex + 1) / totalChunks * 100)}% of your eventual total word budget. Stay lean early.

• readerState — One phrase: what you as a first-time reader are thinking right now.
• concerns — Short list of MACRO-level concerns about the essay as a whole — structural, argumentative, or interpretive issues that affect the overall quality across multiple paragraphs, not local slips or single-sentence observations. Each entry ≤12 words. Only add an entry when a pattern or essay-wide problem has become clear.
• feeling — LOCAL impression from recent chunks only. Four fields — A, B, C, D — each a 1–2 sentence note on what the current and immediately preceding chunks show: what is working, what is not. Update freely each chunk. Leave "" if nothing observed yet for that criterion.

• overallImpression — NOT part of this response. A separate dedicated pass (every two reading chunks, **only after ≥20% of the essay** has been read) updates holistic bands, positions, confidence, and cumulative **shift** using your thesis/reasoning/feeling/etc., all annotations so far, and the prior holistic snapshot. Focus this call on chunk notes + annotations only.

ESSAY STRUCTURE AWARENESS:
Essays will have an introduction, body paragraphs, and a conclusion. Treat these differently in your reasoning:
- Introduction: the thesis (if stated) lives here; note the framing and scope but do not treat introductory sentences as analytical moves. Set the thesis field if clearly stated.
- Body paragraphs: the core analytical work — each paragraph typically advances a claim, applies a technique, and develops its significance. This is where reasoning nodes should be richest.
- Conclusion — apply across ALL note fields (thesis, reasoning, readerState, concerns, feeling): A Paper 1 conclusion is not supposed to add substantial new analysis or a large amount of fresh synthesis; it should mainly round off or briefly draw together what the body already argued. Treat it as low leverage for overall quality: it does not materially raise or lower your cumulative judgement unless it is absent or clearly flawed (e.g. contradicts the body, introduces unsupported claims, leaves the argument hanging, serious register or coherence failure), or unless it offers genuinely new, sophisticated analytical insight that goes beyond repetition — only that exceptional case may meaningfully elevate quality. Do not overweight the conclusion in reasoning nodes or concerns relative to body paragraphs; add a single conclusion reasoning node only when something analytically new or a notable quality issue appears there. (The separate holistic pass applies the same principle when it writes overallImpression notes.)

NOTES RULES:
1. NO quotes or verbatim text from the student essay in notes. Paraphrase everything.
2. Notes describe analytical moves and reasoning only — not examples or evidence.
3. Start very short (~20–30 words for chunk 1). Grow only when genuinely new information arrives.
4. HARD LIMIT: total words across thesis + reasoning + readerState + concerns combined must NEVER exceed 350. The "feeling" field does NOT count toward this limit — write it as fully as needed. If near the 350-word limit, compress the other fields by removing filler words and shortening earlier entries. Never reorder the reasoning sequence.

════════════════════════════════════════════════
PART 2 — PLACE ANNOTATIONS
════════════════════════════════════════════════

After updating your notes, place 0–4 annotations on the CURRENT chunk or the PREVIOUS chunk (only if directly triggered by what you just read in the current chunk).

CONCLUSION — ANNOTATION WEIGHTING: When the chunk you are annotating is the conclusion (or mostly conclusion), use the same principle as in notes above. Do not treat it like a body paragraph: avoid clustering annotations there. Prefer few or none unless something clearly scores — a flaw that matters (contradiction, unsupported new claim, incoherence, serious language issue), a missing or inadequate recap where the essay needs closure, or a rare case of distinct new sophistication that genuinely raises the level. Routine restatement or light synthesis does not warrant extra ★/✓ marks; do not let a polished final paragraph alone drive positive B or A annotations if it only repeats earlier analysis.

SELECTION PRINCIPLE: Place 0–8 annotations per chunk — only moments that would materially affect scoring or that a co-examiner would need to see to calibrate their mark. Choose the annotation symbol that most accurately represents the quality of the writing in this passage: if the student is genuinely doing something well, use a positive symbol (★, ✓, →); if they are falling short, use a negative one (✗, ?, D, S, etc.). The symbol should honestly reflect the level of the work in the recent chunks, not default to neutral.

BALANCE ACROSS CRITERIA — this is mandatory: annotations must be distributed across all four criteria A, B, C, and D. Do not cluster annotations on one or two criteria. Each chunk should ideally touch at least two different criteria if evidence is present. A and B may appear slightly more often as they are the most diagnostic, but C and D must each appear regularly across the essay — if this chunk contains clear organisational moves or language choices, annotate them. An annotation spread that ignores C or D is incorrect.

If a chunk has nothing noteworthy for a given criterion, annotate nothing for it — do not annotate for balance's sake alone. A blank chunk is correct when nothing materially affects scoring.

Each annotation targets a specific short phrase. The "anchor" field must be a verbatim extract (3–8 words) from that chunk so the position can be found.

Annotations are NOT passed to the next reading step. They are saved and shown separately.

CONTEXT RULE (important):
- Historical or cultural context is ALLOWED, but ONLY when it can be reasonably inferred from the text itself (explicitly referenced, clearly signalled, or strongly anchored in specific textual language). Do not introduce a context claim the text never even subtly suggests.
- Context must COMPLEMENT the textual evidence and your explanation of technique (how features/choices create meaning). It must not replace the textual reading, and it must NOT constitute most of the analysis — the core claim still has to be grounded in the text's language.
- Outside knowledge follows the SAME rule: allowed only when textually anchored; otherwise it is an unsupported association/overreach (use B_UNSUP where appropriate). However, explaining connotations and common symbolic meanings (e.g. conventional symbolism) is always allowed as long as you still tie it back to the text's specific wording/features.

ANNOTATION TYPES:

── Criterion A (Knowledge & Understanding) ──
A_STAR     ★  Interpretation extends beyond literal to implication, symbolism, cultural/thematic resonance — correctly
A_CHECK    ✓  Some implications identified but analysis stops at first level of interpretation
A_CROSS    ✗  Predominantly literal or surface-level; paraphrase substitutes for interpretation; misreadings or failure to appreciate context around quotes
A_QUESTION ?  **Unconvincing interpretive reasoning (Criterion A):** the student’s analysis at this spot does **not** read as adequately **supported** by the evidence and/or by the **chain of reasoning** they give — the move feels **thin, asserted, or under-argued**, so you are **not persuaded** that their **conclusion** (the interpretive point they want you to accept) **follows** from what they have shown. This is **not** only “vague wording”: mark A? when the **warrant is weak** (e.g. quotation or paraphrase **does not** bear the weight of the claim, **non sequitur**, **overreach** from slim textual support, **missing steps** between text and interpretation). **In the annotation note field, elaborate in detail:** (1) what **claim** or **conclusion** the student is asking you to accept; (2) what **evidence/reasoning** they actually supply in the anchored span; (3) **why** that fails to convince — be specific about the **gap** (what would need to be shown, or what alternative reading the text allows).
A_CURVY    ~  Not the best quote/evidence choice to support this point
A_EXCLAIM  !  Understands local meaning and implications but not the broader meaning of the text

── Criterion B (Stylistic Features) ──
B_STAR     ★  Strong **evaluation of HOW** this authorial choice achieves its effect; **or** ties **several** authorial choices together to evaluate implications; **or** works at a **broader** authorial pattern (not a star for mere labelling, even if correct)
B_CHECK    ✓  Identifies a technique and **describes the effect correctly** (accurate name + effect; may be shallow — **does not** require full "how" evaluation; that is B★ vs B∅)
B_D        D  **Plot / description in place of analysis** — where **stylistic or authorial analysis is expected** (e.g. a body sentence that should unpack a device, mechanism, or effect), the student only **narrates, paraphrases, or summarises** the **literal** / **plot** with **no** feature→meaning or **no** effect — worse than B_NO_EVAL (∅), which at least **gestures** at effect. **"Description"** **≠** **no evaluation** in general: **B✓** requires **at least** **plausible** **technique** and **defensible** **effect**; **wrong** / **muddled** **labels** or **unjustified** / **incorrect** **effect** = **B✗** / **B?**, **not** **competent** B at that **spot**, **not** D. **D** = **wholly** **summary/narration** in **lieu** of **authorial** **analysis** at that spot. **Do not** mark every passing description: brief **summary or orientation at the end of a paragraph** (or similar closure) is often **acceptable** and **not** a D unless the whole **argumentative** move there was meant to be analytical.
B_CROSS    ✗  Identifies a technique but the effect is described **contradictorily** or **incorrectly**; or device/label is **wrong**, **conflated**, or **applied to the wrong element**
B_QUESTION ?  Connection between device and meaning is tenuous, unsupported, or simply asserted
B_NO_EVAL  ∅  **How** the authorial choice achieves the effect is **not evaluated** (mechanism absent). **May be used on the same anchor as B_CHECK** (two annotations, same 3–8 word span): the student **correctly** names technique and effect, but does **not** explain how the choice produces that effect — use both **B_CHECK** and **B_NO_EVAL** in that case.
B_UNSUP    ⚠  Relies on personal/historical/trivia associations not within the text
B_BR       BR  Fails to connect the device to its effect on the audience/reader — for drama: no effect on stage or spectator; for poetry/prose: no effect on the reader

── Criterion C (Focus & Organisation) ──
C_STAR     ★  **Effective organisation** that **mirrors** the essay's **line of reasoning**; **highly focused** — paragraph (or section) stays **tightly within the topic sentence's scope** and is **extremely clear** end-to-end; **evidence** is **selective, substantive, and detailed** rather than **over-fragmented** or a scatter of thin points. **Reserve for** structural quality **clearly above** a routine **C_CHECK** (✓).
C_CHECK    ✓  Clearly focused; connects to topic sentence or prior argument
C_CROSS    ✗  Contradiction with a prior claim or the thesis
C_QUESTION ?  Focus is breaking down; stream-of-consciousness; main point is hard to follow. When evaluating C, consult your current reasoning notes — if the argument map shows the essay has already covered this territory or is wandering without clear direction, this annotation is appropriate.
C_SIGNPOST →  Logical/argumentative transitions ("building on this", "by contrast") rather than just sequential ("also", "in addition")
C_S        S  Analysis scattered — multiple unrelated points, no clear priority or connecting logic. Cross-check your reasoning map: if it shows several disconnected nodes in the same paragraph, C_S is likely appropriate.
C_DRIFT    ≋  **Drift from the thesis's line of reasoning** — this paragraph/section does **not** follow the **argumentative path** the thesis sets up. Includes the case where the thesis **establishes a contrast, comparison, or sequence** of ideas, but the body **does not run that line**: paragraphs discuss aspects **individually** (e.g. one thing per paragraph) **without** the **contrasting / linked** development the intro promised, or the ordering no longer matches the logic announced. More broadly: content or order **veers** so it no longer **executes** the essay's own thesis. Cross-check the thesis field and your reasoning map.
C_ICP    ICP  Incomplete at paragraph or whole-essay level: paragraph cuts off mid-thought, lacks a workable topic sentence or development, or reads as a fragment; at essay level — introduction or conclusion missing or so truncated that the response is structurally unfinished for Paper 1. Use when the problem is absence or structural truncation, not merely weak focus (use C? or C_S for that).

── Criterion D (Language) ──
D_SP       SP   Spelling error
D_AWK      AWK  Awkward phrasing — feels off
D_SD       SD   Sentence too dense to parse (or to read in one breath) — overloaded structure, heavy stacking, reader must re-read to unpack
D_WC       WC   Imprecise word choice
D_GRA      GRA  Minor mechanics/syntax error but meaning remains clear (not hard to understand)
D_CHECK    ✓    Good word choice — precise and analytically effective
D_V        V    Vague
D_CROSS    ✗    Syntax error — confusing or hard to understand
D_R        R    Inappropriate register (opinion, subjective, informal, not grounded in authorial attribution)

════════════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════════════

Return ONLY a valid JSON object with exactly two top-level keys: "notes" and "annotations".

"notes" must contain: thesis, reasoning, readerState, concerns, feeling (A/B/C/D strings). Do NOT return overallImpression.

Each annotation: target ("current"|"prev"), anchor (3–8 verbatim words), criterion ("A"|"B"|"C"|"D"), type (one of the annotation codes), note (brief examiner note).

No markdown. No extra fields. No commentary outside the JSON.`;
}

function buildReadChunkUserMessage(sourceText, prev2Chunk, prevChunk, currentChunk, nextChunk, notes, chunkIndex, totalChunks, paraLabel) {
  return `SOURCE PASSAGE (for reference):
${sourceText}

---
TWO CHUNKS BEFORE (background context — do not annotate):
${prev2Chunk ?? '[None]'}

---
ONE CHUNK BEFORE (local context — you may annotate if triggered by current chunk):
${prevChunk ?? '[None — this is the first chunk.]'}

---
CURRENT CHUNK — ${paraLabel}, chunk ${chunkIndex + 1} of ${totalChunks} (annotate this):
${currentChunk}

---
ONE CHUNK AHEAD (lookahead — context only, do NOT annotate):
${nextChunk ?? '[None — this is the last chunk.]'}

---
YOUR ACCUMULATED NOTES SO FAR:
${JSON.stringify(notes, null, 2)}`;
}

/**
 * Read one chunk. Returns { notes, annotations }.
 * Notes are passed forward to the next chunk. Annotations are not.
 */
async function readOneChunk(sourceText, currentChunk, prevChunk, prev2Chunk, nextChunk, notes, chunkIndex, totalChunks, paraLabel) {
  const system = buildReadChunkSystemPrompt(chunkIndex, totalChunks, paraLabel);
  const user = buildReadChunkUserMessage(sourceText, prev2Chunk, prevChunk, currentChunk, nextChunk, notes, chunkIndex, totalChunks, paraLabel);

  // Wrap API call + JSON parse in retry-with-backoff so a single transient
  // glitch (5xx, timeout, truncated JSON, rate-limit) doesn't abort the pass.
  const parsed = await withRetry(async (attempt) => {
    const raw = await callApi(system, user, READ_CHUNK_SCHEMA); // notes omit overallImpression — holistic pass updates it
    try {
      return parseJson(raw);
    } catch (e) {
      console.error(`readOneChunk JSON parse failed (attempt ${attempt}). Raw response:`, raw);
      throw new Error(`Chunk ${chunkIndex + 1} — JSON parse error: ${e.message}`);
    }
  }, { label: `readOneChunk #${chunkIndex + 1}`, tries: 3, baseMs: 1500 });

  // Separate notes from annotations robustly
  const updatedNotes = parsed.notes ?? parsed;
  const annotations  = (parsed.annotations ?? []).map((a) => ({
    ...a,
    chunkIndex,
    chunkText: a.target === 'prev' ? (prevChunk ?? '') : currentChunk,
  }));

  return { notes: updatedNotes, annotations };
}

function annotationsForHolisticPrompt(allAnnotations) {
  return (allAnnotations ?? []).map((a) => ({
    chunkIndex: a.chunkIndex,
    criterion: a.criterion,
    type: a.type,
    anchor: a.anchor,
    note: a.note,
  }));
}

/** low < mid < high. Used to map band + within-band position to a 9-rung linear index. */
const HOLISTIC_BAND_RANK = { low: 0, mid: 1, high: 2 };

/**
 * @returns {number|null} null if a band is unknown/invalid
 */
function holisticBandRank(band) {
  const b = (band == null || band === '') ? 'unknown' : String(band).trim().toLowerCase();
  if (b in HOLISTIC_BAND_RANK) return HOLISTIC_BAND_RANK[b];
  return null;
}

/**
 * 0 = low(1) … 8 = high(3) along low1→low2→low3→mid1→…→high3. Null if band/position not a valid rung.
 */
function holisticLinearTierIndex(band, position) {
  const b = normalizeHolisticBand(band);
  if (b === 'unknown') return null;
  const r = holisticBandRank(b);
  if (r == null) return null;
  const p = normalizeHolisticPosition(position);
  if (p < 1 || p > 3) return null;
  return r * 3 + (p - 1);
}

/**
 * Net rung change vs prior (high/mid/low × position 1–3). e.g. mid2→mid3 = +1; mid3→high1 = +1; low1→high3 = +8.
 * First time we can place a rung from unknown/incomplete prior → 0. New placement unknown → "unknown".
 * @returns {number|'unknown'}
 */
function computeHolisticShiftFromTierLadder(priorBand, priorPos, newBand, newPos) {
  const nIdx = holisticLinearTierIndex(newBand, newPos);
  if (nIdx == null) return 'unknown';
  const pIdx = holisticLinearTierIndex(priorBand, priorPos);
  if (pIdx == null) {
    // First formation (no prior rung) or prior band without valid 1–3: baseline vs new
    return 0;
  }
  return nIdx - pIdx;
}

/** Normalise to schema enum. */
function normalizeHolisticConfidence(raw) {
  if (raw == null || raw === '') return 'unknown';
  const t = String(raw).trim().toLowerCase();
  if (t === 'high' || t === 'hi') return 'high';
  if (t === 'medium' || t === 'med' || t === 'mid') return 'medium';
  if (t === 'low' || t === 'lo') return 'low';
  if (t === 'unknown' || t === 'unk') return 'unknown';
  return 'unknown';
}

function normalizeHolisticBand(raw) {
  if (raw == null || raw === '') return 'unknown';
  const t = String(raw).trim().toLowerCase();
  if (t === 'high' || t === 'mid' || t === 'low' || t === 'unknown') return t;
  return 'unknown';
}

/**
 * @param {string} c - normalized
 * @param {number} readPct - 0–100, chunk-based % of essay read at this pass
 */
function clampHolisticConfidenceForReadPct(c, readPct) {
  if (readPct == null || Number.isNaN(readPct)) return c;
  if (readPct <= 40) return 'low';
  if (readPct < 70 && c === 'high') return 'medium';
  return c;
}

/** Store shift as string for JSON / UI (net rung delta −8…+8, or “unknown”). */
function stringifyHolisticShift(s) {
  if (s === 'unknown' || s === null || s === undefined) return 'unknown';
  if (typeof s === 'number' && Number.isFinite(s)) {
    if (s === 0) return '0';
    return String(s);
  }
  const t = String(s).trim().toLowerCase();
  if (t === 'unknown' || t === 'unk') return 'unknown';
  if (t === '0' || t === 'zero' || t === 'hold' || t === 'none') return '0';
  if (/^[-+]?[0-9]+$/.test(t)) {
    return String(parseInt(t, 10));
  }
  return 'unknown';
}

/**
 * @returns {number|'unknown'}  Net rung delta, or "unknown" for legacy empty when band unknown
 */
function normalizeHolisticShift(raw, priorBand) {
  if (raw === null || raw === undefined || raw === '') {
    return priorBand === 'unknown' || priorBand == null ? 'unknown' : 0;
  }
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase();
    if (t === 'unknown' || t === 'unk') return 'unknown';
    if (t === '0' || t === 'zero' || t === 'hold' || t === 'none') return 0;
    if (/^[-+]?[0-9]+$/.test(t)) {
      return parseInt(t, 10);
    }
  }
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (n === 0) return 0;
    return n;
  }
  return priorBand === 'unknown' || priorBand == null ? 'unknown' : 0;
}

/**
 * Merges model holistic output; **recomputes** `shift` as net rung on the **9-rung** ladder (low1…low3 → mid1…mid3 → high1…high3) from prior vs new **band** + **position**.
 * Clamps `confidence` by read % (≤40% → low; <70% → not high). `shift` is **not** modified by confidence in code. The prompt’s **vibe** scale is **judgment** only.
 * `readPct` = round(100 * chunksCompleted / totalChunks); omit only for no-op.
 */
function mergeHolisticOverallImpression(prior, parsed, readPct) {
  const raw = parsed?.overallImpression ?? parsed;
  if (!raw || typeof raw !== 'object') return prior ?? initialNotes().overallImpression;
  const base = prior ?? initialNotes().overallImpression;
  const pct  = readPct == null || Number.isNaN(readPct) ? 100 : Math.min(100, Math.max(0, readPct));
  const out = { ...base };
  for (const k of ['A', 'B', 'C', 'D']) {
    if (!raw[k] || typeof raw[k] !== 'object') continue;
    const priorEntry = base[k] ?? EMPTY_BAND;
    const priorBand    = normalizeHolisticBand(priorEntry.band ?? 'unknown');
    const merged       = { ...EMPTY_BAND, ...priorEntry, ...raw[k] };
    merged.band        = normalizeHolisticBand(merged.band);
    merged.position    = merged.band === 'unknown' ? 0 : normalizeHolisticPosition(merged.position);
    merged.confidence  = clampHolisticConfidenceForReadPct(
      normalizeHolisticConfidence(merged.confidence),
      pct,
    );
    // Shift: **source of truth** = net **rung** on 9-rung ladder (low1…high3) vs **prior** snapshot, not the model’s shift string.
    const netRungShift = computeHolisticShiftFromTierLadder(
      priorBand,
      priorEntry.position,
      merged.band,
      merged.position,
    );
    merged.shift = stringifyHolisticShift(netRungShift);
    out[k]         = merged;
  }
  return out;
}

/** Last one or two essay chunks for the holistic pass (paired cadence). */
function buildHolisticChunkWindowMarkdown(chunks, paraStartSet, chunkIndexEnd) {
  const parts = [];
  const spanStart = Math.max(0, chunkIndexEnd - 1);
  for (let j = spanStart; j <= chunkIndexEnd; j++) {
    const label = getParaLabel(j, paraStartSet);
    parts.push(`--- Chunk ${j + 1} of ${chunks.length} — ${label} (student essay)\n${chunks[j] ?? ''}`);
  }
  return parts.join('\n\n');
}

/**
 * System prompt for the dedicated holistic-impression API pass (runs every 2 reading chunks, only once ≥20% of the essay is read).
 * @param {number} chunkIndexEnd  — 0-based index of the chunk just finished
 * @param {number} totalChunks
 */
function buildHolisticImpressionSystemPrompt(chunkIndexEnd, totalChunks) {
  const pct = totalChunks > 0 ? Math.round(((chunkIndexEnd + 1) / totalChunks) * 100) : 0;
  return `You are an IB English A Paper 1 examiner on a DEDICATED pass. Return ONLY an updated "overallImpression" object for A, B, C, and D.

This pass is scheduled after every TWO sequential reading chunks (and also after the final chunk if the count is odd), **but the app does not invoke it until at least 20% of the essay (by chunk count) has been read** — the holistic pass is **not** run below that (hard); until then, band and shift stay **unknown**. You synthesise: accumulated notes, ALL annotations so far, the last one–two student essay chunks, the source passage, and the PRIOR overallImpression snapshot.

READING POSITION FOR THIS UPDATE: chunk ${chunkIndexEnd + 1} of ${totalChunks} completed (~${pct}% of the essay by chunk count). You are at or past the 20% threshold; **the app also applies confidence caps from this %** (see below).

TERMINOLOGY (read first — this document uses IB-style wording):
• **Band** = **high** / **mid** / **low** (the **three** **holistic** **quality** **levels** for the criterion).
• **9-rung placement** = each criterion sits on **one** rung in this order: **low1 → low2 → low3 → mid1 → mid2 → mid3 → high1 → high2 → high3** (combine **"band"** with **"position"** 1/2/3). **"Shift"** in JSON = **signed** **net** **rung** **change** vs the **PRIOR** snapshot (e.g. **mid2→mid3** = **+1**; **mid3→high1** = **+1**; **low1→high3** = up to **+8** in one go if the evidence truly warrants that jump). The app **recomputes** **shift** from your **band**+**position** and **replaces** your string — still output a **plausible** **shift** for transparency.
• **Tier** = **"position"** **1** / **2** / **3** (lower / middle / upper **third** **within** a **band**). **Do** **not** use **"tier"** to **mean** **high** / **mid** / **low** — that is always **"band"**.
• **Confidence** = how **settled** you are on the **combination** (**band** + **tier** / **position**). It **rises** when **evidence** from **successive** **chunks** **stays** on a **similar** **level** — the **work** **keeps** **reading** as the **same** **band** and **roughly** the **same** **calibre** **within** that **band** (similar **tier**) for **enough** of the **essay** that the **label** is **no** **longer** **tentative**. It **decreases** (or you **hold** it) when **evidence** is **not** at a **stable** **level** — e.g. **drastic** **jumps** in how the work **reads** **for** **this** **criterion**, **consecutive** **net** **changes** in **band** (back-and-forth or repeated **re-banding**), or **inconsistent** **quality** **across** **chunks** so you **cannot** **treat** the **read** as **settled**; **hold** or **lower** **until** the **pattern** **clarifies**.

Each criterion A–D must include:
  - "band": "high", "mid", "low", or "unknown" if too early
  - "position": integer 1–3 = **tier** **within** that **band** (lower / middle / upper **third**); if band is "unknown", position 0
  - "confidence": "high", "medium", "low", or "unknown" — follow **CONFIDENCE** (mandatory) below: how **settled** you are on **band** + **tier** (**position**), not raw essay “quality” in the abstract. **Overclaiming** **"high"** when little is read is wrong. Use the **vibe** **table** for **willingness** to **move** **placement** (**not** a number you count to).
  - "shift": string: **"unknown"** or a **signed** **integer** from **"-8"** to **"8"** (see step 3) — **required**; must **align** with the **net** **rung** **change** (9-rung order above) from the **PRIOR** **band+position**; the app **recomputes** from your **band**+**position** and **replaces** this field. **First** time **placing** from **"unknown"** **band** **→** **"0"** when a valid rung appears. **Do** **not** put shift only in the "note" text.
  - "note": follow the four-step workflow below (prose only—**do not** append [SHIFT: …] tags to the note; **shift** is its own key)

CONFIDENCE (mandatory; **~${pct}%** = READING POSITION, by **chunk** count):
• **What confidence means:** how **convinced** you are of the **current** **band** + **tier** (**position**) **read**, per criterion. It is **not** a generic “good / bad” score.
• **When to raise confidence** (say in the **note** when **useful**): when **new** **chunks** show the **work** **consistently** **stays** on a **similar** **level** for this **criterion** — **same** **band** (or a **clear** **emerging** **band**), **and** **quality** that **repeatedly** **fits** that **read**; **less** whiplash, **less** “maybe mid, maybe high.” **Stable** **evidence** → **creep** **confidence** **up** from **low** toward **medium** and, when **%** read and **pattern** **allow**, toward **high**.
• **When to lower confidence** (say in the **note** when **useful**): when **evidence** is **not** at the **same** **level** **across** the **read** for this **criterion** — e.g. **drastic** **shifts** in how it **comes** **across**, or **consecutive** **net** **rung** **moves** (repeated **re-placement** or **whipsawing**) that **unsettle** a **stable** **placement**. **Movement** **across** **bands** and/or **tiers** (**any** **non-zero** **net** **rung** **change** this **pass** or **a** **pattern** of **moves** **across** **passes**) **tends** to **decrease** **confidence** — the **read** is **less** **settled**; **downgrade** (or **hold** **low**/**medium**) **until** **placement** **stays** **stable** **for** **enough** of the **essay** or the **cumulative** **case** **firms** **up**. **Larger** **|shift|** **(magnitude)** **=** **stronger** **reason** to **not** **claim** **high** **confidence** **yet**, unless the **new** **rung** is **clearly** **right** and **sustained**.
• **Vibe: rough likelihood of moving rung this pass (NOT a quota, cap, dice, or number you track) —** **bump** **these** **up** **vs** a **cautious** default; **judge** as a **senior** **examiner** **would:** On **low** **confidence** your **(vibe)** is **~60–75%** **willing** to **change** **something** that **needs** **changing** — **band** **and/or** **tier** (**position** **1–3**), **and/or** the **thrust** of the **case** in the **note**. On **medium**, your **(vibe)** is **~30–40%** to **move** **at** **least** **one** **rung** on the **9-rung** **scale** **this** pass when **warranted** (the **"shift"** field **encodes** that **net** **rung** **delta**). On **high**, your **(vibe)** is **~10–15%** for a **rung** **move** this pass — you **lean** to **keeping** **placement**; you **re-place** only when the **cumulative** **essay** **clearly** **demands** it. **Values** = **gut** **brackets**, **not** a **dice** **roll** or **tally** you **report**.
• **Read-% caps (enforced in app):** If **≤40%** of the essay, **"confidence"** must be **"low"** (provisional by rule). If **<70%** and **>40%**, do **not** set **"high"** (you **cannot** **claim** a **settled** **read** on **band**+**tier** before **enough** is read; **stay** **aligned** **with** **medium** **vibe**, **~30–40%** **rung-move** **willingness**). If **≥70%**, **"high"** is **allowed** when you are **genuinely** **settled** on **band** + **tier** — **then** **self-check** **with** **the** **~10–15%** **high** **vibe** **bracket**. **Match** your output to these caps.
• **Tie to shift (conceptual):** the app **recomputes** **"shift"** as **new** rung **minus** **prior** rung (9-rung order); you choose **"band"** and **"position"** using **judgment** **guided** by the **vibe**. **Non-zero** **shift** **usually** **pulls** **confidence** **down** **or** **holds** it (see **When** **to** **lower** **confidence**). **Do** **not** invent **rigid** **micro-rules** that **override** **holistic** **judgment** — if a **re-placement** is **warranted**, **do** it.

WHEN "band" is **high** — **position 2 or 3** (middle or upper within high):
• Reserve **position 2** and **position 3** for essays where **at least ~50% of the text** (judge by chunk coverage, body paragraphs, and/or word share) **sustainedly** shows **high-band** quality for that criterion. “Most of the essay” in practice means **≥ about half** of the response demonstrates high attributes — not a few brilliant paragraphs in an otherwise mid-level essay.
• If high-quality work for that criterion is real but only a **minority** of the essay, use **position 1** (lower third of high) or re-evaluate whether **mid** is more honest.

HOLISTIC UPDATE WORKFLOW — apply IN ORDER, separately for each criterion (A, B, C, D); do not conflate criteria.

STEP 1 — CARRY FORWARD THE PRIOR NOTE (summarise, do not gut)
• Start from the prior overallImpression note for this letter. **Summarise** and compress only where needed: you must **not** excessively oversimplify or drop past judgements, but you must **not** be verbose either. Prioritise (for **this** criterion) **how far** the quality extends across the essay (**extent** / prevalence), the **criterion-relevant** quality itself, and **a few** concrete examples or anchor phrases — not long lists.
• Keep the balance: preserve nuance; avoid gutting; avoid paragraph-long repetition of old wording.
• Body paragraphs: treat them consistently. Space devoted to each named body paragraph in the note must stay **proportional** to that paragraph's share of the essay (by chunks and/or word count in the student text). As a floor, keep **at least ~20 words** of substantive, criterion-specific coverage **per body paragraph you still name** — do not shrink a body paragraph's treatment to a token or one-liner.
• Introduction and conclusion may be shorter than body paragraphs but still specific; do not let the conclusion dominate.

STEP 2 — ADD NEW OBSERVATIONS (this criterion only)
• Add what the last two reading chunks (plus annotations and other notes) newly show for **this** criterion only: strengths, weaknesses, and **prevalence** (how widespread the pattern is in the essay so far).
• Good and bad both belong here when evidence exists.

STEP 3 — **shift** in JSON = **signed** **net** **rung** **change** on the **9-rung** order (low1…high3) **vs** the **PRIOR** **band+position**; the app **recomputes** it — **return** a value **consistent** with the **placements** you output. Use the **CONFIDENCE** **vibe** to **self-calibrate** (not a **rigid** **rule** for **"0"**).
• **First formation:** If the **prior** **band** is **"unknown"** and this pass is the **first** where you set **valid** **band+position** (a **rung**), you **must** set **"shift"** to **"0"** (no **prior** **rung** to compare). While **new** **band** or **valid** **position** is still **missing**, keep **"shift"** **"unknown"** when you cannot name a rung.
• **Later passes:** **shift** = **(new** **rung** **index)** **−** **(prior** **rung** **index)**. Examples: **mid2→mid3** = **+1**; **mid3→high1** = **+1**; **same** **rung** = **"0"**; **down** a **rung** = **"-1"** (or a **more** **negative** **integer** if you move **several** **rungs** down in one pass and the evidence justifies that).
• **How** to **choose** the **new** **band**+**position** (and thus the **magnitude** of **shift**): use the **vibe** **table** in **CONFIDENCE** with your **cumulative** read. **Low** = **malleable**; **high** = **stiff** on **moving** **rungs** unless the **case** is **strong** — but **no** **mechanical** **rule** that **blocks** good **judgment** on **borderline** **placement**.
• **Anchor = prior rung** for this letter. Weigh new chunks + notes + annotations against that **placement**.
• If you cannot judge **with** the **%** read so far, keep **"unknown"** for **band** and **"unknown"** for **shift** (rare at **≥~20%**; prefer a **best** judgment when possible). After **~40%** read, **unknown** for **band** is **rare** unless the essay is **truly** **opaque**.
• **Do not** put [SHIFT: …] in the **note**; the **note** is analytical prose. The **"shift"** key carries the **rung** **delta**; the **app** is **authoritative** on the **value** (recomputed from **band**+**position**).
• **One** **rung** **(or** **a** **small** **number** **of** **rungs)** **per** **pass** by default when **adjusting** **placement**; **huge** **jumps** **across** the **9-rung** **scale** are **rare** unless the **cumulative** **evidence** is **truly** **definitive** — the **app** will **recompute** the **exact** **integer**; **do** **not** **inflate** a **small** **refinement** into a **big** **jump** without the **case** for it.

STEP 4 — ASSIGN / KEEP BANDS (unchanged logic except as driven by step 3)
• Setting **band** and **position** from **unknown** is appropriate once **enough** has been read (this pass only runs at **≥20%**). The **~60–75%** / **~30–40%** / **~10–15%** **vibe** (by **low** / **medium** / **high** **confidence**) is your **self-check**, **not** a **quota** (see **CONFIDENCE**).
• When **band** is **already** **known**, **revise** **band** and/or **tier** (**position**) when your **holistic** **judgment** **supports** it — **informed** by the **vibe** (low = **willing** to **move** **placement**; high = **rare** **net** **rung** **moves** unless very convinced), **not** a **filter** that **blocks** good **judgment** (including band **boundary** cases as described).

OTHER:
• Holistic "note" fields do **not** count toward the reader's 350-word cap on thesis/reasoning/etc.
• **Per-criterion word limit (each of A, B, C, D):** each "note" must be **at most 130 words** — a hard cap; never exceed it.
• **Use the 130-word budget progressively through the essay:** early in the read (low chunk %), keep each holistic note **short**; on each later holistic pass, use **more and more** of the allowed words as the picture fills in, scaling roughly with **~${pct}%** of the essay read so far (by the final pass(es), when warranted, work **up toward** 130 words per criterion). Do not waste the cap on filler; do **not** under-write late passes when the essay is nearly complete and evidence is rich — notes should feel **cumulative and fuller** as the sequence advances.
• Always anchor to specific sections (intro, body 1, …, conclusion). Criterion separation: no cross-talk between A/B/C/D.

HIGH / MID / LOW DEFINITIONS (use when setting "band"):
Criterion A — Knowledge and Understanding
- Key question: How well does the candidate demonstrate understanding of the text and draw reasoned conclusions from its implications? How well are ideas supported by references to the text?
- **Position 1 / 2 / 3 within low (A):** The **deeper** into **low** the **work** **sits** (especially **position** **1** **vs** **2** **vs** **3**), the **worse** **literal** **reading** **can** **get** — not only **weak** **inference** or **scanty** **evidence**. **Lower** **positions** **within** **low** = **more** **frequent** and **more** **serious** **misreadings** of **even** **obvious** **literal** **meanings** of the **source** (what is **plainly** on the page). **Higher** **positions** **within** **low** are still **low**-**A** for **gaps** and **thinness**, but **basic** **literal** **grip** is **less** **often** **wrong** **throughout** than at the **bottom** of the **low** **band**.
- High: strong understanding of the text; **many implications**, **some subtleties**, and **some insight** — high band does **not** require perceptive interpretation everywhere, but references are well chosen and substantially support the argument.
- Mid: understanding of the literal meaning; satisfactory interpretation of SOME implications; references generally relevant and mostly support ideas.
- Low: some understanding of the LITERAL meaning; references at times appropriate but often surface-level or infrequent; sometimes misinterpretation.

Criterion B — Analysis and Interpretation
- Key question: To what extent does the candidate analyse and evaluate how textual features and/or authorial choices shape meaning?
- **"Description" (B):** In borderline B language, this means **narration, paraphrase, plot beats, or literal summary of the source** where the task calls for **authorial choice, textual features, and how they shape meaning** — not "any describing" in general. **Description ≠ "no evaluation"** as a rule: a student can **analyse in plain language** by **naming a technique and explaining an effect** (even **simply**). Contrast **B_D** in annotations: "description" there is **summary/narration in place of** analysis, **worse** than an answer that at least **gestures** at effect.
- **What counts toward "competent" B (and the mid / mid-position-1 track):** A technique+effect move **only** **counts** when the **label** is **at least** **plausible** for the **text** and the **effect** is **defensible** and **grounded** in the passage. **Incorrect** or **unjustified** effect; **misidentification** of device or method; or **muddled** / **confusing** technique talk **does** **not** count — do **not** treat a **sprinkling** of **wrong** or **vague** pairings as **"sustained competence."** (Align with **B✓** / **B✗** / **B?** in annotations.)
- **Where bands differ:** **High vs mid** — **mainly** the **sustained depth** of **evaluation** (how/why a choice **achieves** its effect) and **broader** **weighing** of **patterns** / **several** choices — **not** whether the essay ever "describes." **Mid vs low** — whether **justified, clearly identified** **technique**+**effect** work is **sustained** enough. A response that **repeatedly** and **competently** (per the **rule** **above**) **names** **techniques** and **explains** **effects** (even if **basic**) is **on track** for **mid** and often **warrants** at least **mid position 1**; **chronic** **wrong** labels, **unjustified** **effects**, or **confusing** **mixes** of **techniques** **block** that **reading** and **point** to **low** (or only **isolated** **mid**-**level** **moments** amid **failure** **elsewhere**).
- High: **Good evaluation of effects** in **many** places; awareness of **broader authorial strategies** to create meaning, plus **some genuine insight** and explanation of how effects are produced. Does **not** need evaluation on every occasion or in every paragraph.
- Mid: **Competent** (see **"what** **counts"** **above**) **identification and explanation** of **authorial** **techniques** and **effects** across **much** of the essay; **evaluation of how** those effects are **produced** may be **thin**, **inconsistent**, or **basic** — that **tends to cap** a response in **mid**. **Sustained** **justified** technique + **defensible** effect, **even** where **"how"** is **uneven**, typically maps to **mid position 1**+; **higher** **mid** (and **high**) need **stronger** / **more** **frequent** **"how"** / **"why"** **evaluation** — **not** **filler** from **B✗/B?-heavy** work.
- Low: **Large stretches** of **literal** retelling, **plot** **summary**, or **paraphrase** with **little** **authorial** **analysis**; **or** **sustained** **failure** to **justify** **technique**+**effect** (wrong, **muddled**, or **asserted** **effects**); **or** only **rare** **patches** of **sound** B work amid **the** **rest** **failing** the **"what** **counts"** test. **Do not** use a **shallow** "how" **alone** to push **low** if **identification+effect** are **repeatedly** **plausible** and **defensible** — that **still** **leans** **mid** per **the** **rule** **above** (unless **errors** are **frequent** enough to **void** **competence** **overall**).

Criterion C — Focus and Organisation
- Key question: How well organised, coherent and focused is the presentation of ideas?
- **What "effective organisation" means (C):** **Mirrors** and **sustains** an **argument** — a **line of reasoning** in which **paragraphs** and **moves** **build** a **thesis**-led **case**. It is **not** the same as **covering** the source text **in chronological** (or **sequential** / **blow-by-blow**) **order**; that pattern can be **narrative** **tracking** with **mediocre** **C** even when the order feels **tidy**.
- **Reasoning map in notes (C — mid-upper / high-lower / high-mid, and position 1/2/3):** The **\`reasoning\`** list is a **key** **signal** for **borderline** **C**. A **comparatively** **compact** **tree** with **clear** **priority** — **fewer** top-**level** **(depth 0) nodes** and **deeper** **sub-nodes (depth 1/2) drilling into a move** **rather** **than** **adding** **new** **parallel** **moves** — **usually** **matches** **stronger** **overallImpression** **C** (tighter **argument** **discipline**). A **broad**, **flat** **map** (many **sibling** **moves** **at** **depth 0** with **only** **thin** **sub-points**) **suggests** **expansive** **sweep** over the **source** **instead** of **a** **tightly** **controlled** **line** of **thesis-led** **argument**; when **C** is **in** **doubt** (e.g. **mid** **position** **3** **vs** **high** **position** **1** **vs** **high** **position** **2**), **favour** **higher** **C** for **compact+deep** and **caution** for **expansive+shallow** unless the **prose** **itself** **is** **clearly** **superior** **on** **C**.
- **Position 1 / 2 / 3 (within band):** Reflects the **extent** of what you see in **reasoning** and the holistic note: **tighter** **organisational discipline**, **sustained focus**, and **clearer** **argument structure** (scope under control) → **higher** **position** within the band. Broader, looser, or more **fragmented** **coverage** of the same band → **lower** **position**. **When** **band** is **high —** **position 1** and **2** do **not** need **seamless** local **readability** in **every** **sentence**; they **do** need **effective** **structure** that **mirrors** the **line of** **reasoning**, **highly** **sustained** **focus**, and **very** **clear** **relations** (how **paragraphs** and **moves** **link** the **thesis** and **each** **other**). **Position 3** in **high** is **harder** to **earn** (a **higher** **bar**): expect **nearer**-**seamless** **coherence** and **tighter** **structural** **unity** for **most** of the **essay** — not **seamless** in **every** line, but **closer** to it than high **1** or **2**.
- **High vs mid (contrast):** **High** requires **sustained** **effective** organisation and/or **strong, consistent focus** across the essay. The **mirror** of the **line of reasoning** (how paragraphs **track** the **thesis** and **build**) should be **clear**; the **span** of what the essay tries to do (scope) must **not** be **so broad** that the argument **thins** or **diffuses** — high is **disciplined** in **breadth** as well as **clarity**. **Mid** is **weaker** on all of this: it is only **generally** coherent, with **only** **some** **focus** and **local** **drifts** or **fragments**; the structure is **not** **extremely** **clear** or **tight**, but it remains **understandable** and **not** **confusing**; it does **not** show the **sustained** **effectiveness** and **clarity of mirror** of high, yet it is **not** **largely** **contradictory** (that leans **low**).
- High: **Sustained** **effective** organisation and/or **high** **focus** in **most** of the essay; the **line of reasoning** (how the argument **unfolds** and **connects** to the thesis) is **evident** and **the mirror is clear**; **scope** is **controlled** — **not** **over-broad** in a way that blurs the argument. For **C**, **see** the **position** line for **how** **high 1/2** **differs** from **high 3**; **seamless** every sentence is **not** **required** for **high 1** or **2**.
- Mid: **Generally** **coherent** **structure** and **some** **focus**, but with **notable** **drifts**, **loose** **joins**, or **fragmented** **moments**; organisation is **not** **extremely** **clear** or **tight** and **not** as **effectively** **sustained** as high, yet the reader can **follow**; **not** **confusing** and **not** **self-contradicting** in the way that characterises **low**. This is the **"some discipline, but patchy"** band.
- Low: **Little** coherent organisation or **sustained** **focus**; the **line of argument** is **hard** to see; may **contradict** the thesis, **wander** badly, or read as **largely** **disconnected** / **chronology without argument**. **Low** **position 1** or **2** (the **harsher** end of the **low** **band**): **warrant** only when **reader** **reasoning** and the **essay** together show **genuinely** **incoherent**, **confusing**, **contradictory**, or **stream**-**of**-**consciousness**-**level** **structure** — **not** for **broad** or **loose** but **still** **followable** **argument** (that usually **belongs** **higher** **in** **low** or **in** **mid**).

Criterion D — Language
- Key question: How clear, varied and accurate is the language? How appropriate is register and style?
- **Position 1 / 2 / 3 (within high, mid, and low):** In **high** and **mid**, use **feeling** notes and a **global** read: **higher** **position** = **tighter** **syntax**, **more** **precise** **vocabulary**, **stronger** **register**, and a **pleasanter** **read** on **balance**. For **high** especially: **do not** be **timid** about **position** **2** or **3** when the **essay** **mostly** (≥ **~50%** of the text by space) **meets** the **high** **picture** and the **rest** is **not** a **sustained** **pull** **down** — **perfection** in **every** sentence is **not** **required** for **upper** **thirds** of **high**. **Within** **low:** **lower** **position** = **language** that **frequently** **gets** **in** **the** **way** and **impedes** **understanding**; **higher** **position** **within** **low** = still **below** **mid** and **distracting** / **clumsy**, but does **not** as **often** **block** the **reader** — **nuisance** and **lumps** more than **chronic** **unreadability**.
- **High vs mid (D — contrast):** **High** — **Syntax** is **largely** **highly** **accurate**; **many** **uses** of **sharp**, **precise** **vocabulary**; **register** is **effective**; the prose is **pleasing** to read for an examiner. **Mid** — **Syntax** is **adequately** **fit**; **vocabulary** is **academic** but **not** **especially** **precise**; **register** is **appropriate**; the read is **not** **strongly** **distracting**, but it is **not** **pleasing** or **engaging** in the **high** **sense** — it is **workable**, **not** **polished** or **lively** on the **word** **level**.

- High: **Syntax** **mostly** **highly** **accurate**; **many** **precise** **lexical** **choices**; **register** **effective**; **pleasing** to read. **(See** **position** **rule** **above** **—** **≥~50%** of the **essay** at this **level** can **support** **high** **2/3** when **warranted.)**
- Mid: **Syntax** **adequately** **appropriate**; **vocabulary** **broadly** **academic** but **not** **precise**; **register** **appropriate**; **not** **highly** **distracting** to read, but **not** **pleasing** or **engaging** **either** — **competent** but **plain**.
- Low: Stays **below** **mid**-level **control** (see **position** **rule**). **Worse** **(lower** **1)** end of the **band** — **vocabulary** / **syntax** / **register** **often** **get** **in** **the** **way**; **clarity** is **frequently** **impeded**. **Stronger** **(2** or **3)** end of **low** — still **distracting** and **lumpy** **D**-level work, but **impedes** **understanding** only **intermittently**; the **read** is **bumpy**, **not** **globally** **broken**.

CONCLUSION WEIGHTING: A Paper 1 conclusion alone rarely warrants a **large** **non-zero** **"shift"** (big **rung** **move**); a **small** **+1** or **hold** is possible when the **closing** **materially** **changes** the **read** of **placement** for that **criterion** — do not let a **polished** **but** **thin** **closing** alone **drive** a **multi-rung** **jump**.

Return ONLY a JSON object: **overallImpression** with A, B, C, D each an object with keys **band**, **position**, **confidence**, **shift** (string: **"unknown"** or **signed** **integer** **"-8"**…**"8"** as **in** the **API** **schema**), and **note** (string, no [SHIFT: …] suffix). The **app** will **recompute** **shift** from your **previous** and **new** **band+position** (**9-rung** **rung** **delta**) and **clamp** **confidence** to the **%**-read **rules** — still output **fields** **as** **if** final. No markdown. No other keys.`;
}

function buildHolisticPassUserMessage(sourceText, chunks, paraStartSet, chunkIndexEnd, totalChunks, notes, allAnnotations) {
  const notesLight = {
    thesis: notes.thesis,
    reasoning: notes.reasoning,
    readerState: notes.readerState,
    concerns: notes.concerns,
    feeling: notes.feeling,
  };
  return `SOURCE PASSAGE (for reference):
${sourceText}

---
MOST RECENT STUDENT ESSAY CHUNKS (prioritise these for fresh evidence; combine with everything below for whole-essay judgement):
${buildHolisticChunkWindowMarkdown(chunks, paraStartSet, chunkIndexEnd)}

---
SEQUENTIAL READ PROGRESS: chunk ${chunkIndexEnd + 1} of ${totalChunks} just completed.

---
ACCUMULATED NOTES (no overallImpression here — it is supplied separately):
${JSON.stringify(notesLight, null, 2)}

---
PRIOR overallImpression (refine in place — preserve continuity unless evidence demands change):
${JSON.stringify(notes.overallImpression ?? initialNotes().overallImpression, null, 2)}

---
ALL ANNOTATIONS SO FAR (${allAnnotations.length}):
${JSON.stringify(annotationsForHolisticPrompt(allAnnotations), null, 2)}`;
}

/**
 * Dedicated API call: refine overallImpression only (after each pair of reading chunks).
 */
async function updateHolisticImpressionPass(sourceText, chunks, paraStartSet, chunkIndexEnd, totalChunks, notes, allAnnotations) {
  const system = buildHolisticImpressionSystemPrompt(chunkIndexEnd, totalChunks);
  const user = buildHolisticPassUserMessage(sourceText, chunks, paraStartSet, chunkIndexEnd, totalChunks, notes, allAnnotations);

  const parsed = await withRetry(async (attempt) => {
    const raw = await callApi(system, user, HOLISTIC_PASS_SCHEMA);
    try {
      return parseJson(raw);
    } catch (e) {
      console.error(`updateHolisticImpressionPass JSON parse failed (attempt ${attempt}). Raw:`, raw);
      throw new Error(`Holistic pass after chunk ${chunkIndexEnd + 1} — JSON parse error: ${e.message}`);
    }
  }, { label: `holisticPass@${chunkIndexEnd + 1}`, tries: 3, baseMs: 1500 });

  const readPct = totalChunks > 0
    ? Math.min(100, Math.round(((chunkIndexEnd + 1) / totalChunks) * 100))
    : 0;
  return mergeHolisticOverallImpression(notes.overallImpression, parsed, readPct);
}

/**
 * Run the full sequential reading pass over the student's essay.
 * One API call per chunk for notes + annotations; a second call every 2 chunks for holistic impression, **only after ≥20% of chunks** have been read (impression not formed before that; enforced in code).
 *
 * @param {{ onBefore?: Function, onAfter?: Function, onHolisticBefore?: Function, onHolisticAfter?: Function }} [callbacks]
 *   onBefore(chunkIdx, totalChunks, currentNotes) — before reading chunk i
 *   onAfter(chunkIdx, totalChunks, updatedNotes, chunkAnnotations, allAnnotations) — after chunk + any holistic update for that step
 *   onHolisticBefore(chunkIdx, totalChunks, notes) — before the dedicated holistic API call (chunkIdx = index just finished)
 *   onHolisticAfter(chunkIdx, totalChunks, notes, allAnnotations) — after holistic merge (notes include new overallImpression)
 */
async function readEssaySequentiallyFromChunks(sourceText, chunks, paraStartSet, startIndex, startNotes, existingAnnotations, callbacks = {}) {
  const { onBefore, onAfter, onHolisticBefore, onHolisticAfter } = callbacks;
  let notes = startNotes ?? initialNotes();
  const allAnnotations = Array.isArray(existingAnnotations) ? [...existingAnnotations] : [];

  const start = clampInt(startIndex ?? 0, 0, chunks.length);
  for (let i = start; i < chunks.length; i++) {
    if (onBefore) onBefore(i, chunks.length, notes);
    const prev   = i > 0 ? chunks[i - 1] : null;
    const prev2  = i > 1 ? chunks[i - 2] : null;
    const next   = i < chunks.length - 1 ? chunks[i + 1] : null;
    const paraLabel = getParaLabel(i, paraStartSet);
    const result = await readOneChunk(sourceText, chunks[i], prev, prev2, next, notes, i, chunks.length, paraLabel);
    const u = result.notes ?? {};
    notes = { ...notes, ...u, overallImpression: notes.overallImpression };
    const chunkAnns = result.annotations ?? [];
    allAnnotations.push(...chunkAnns);

    const runHolistic = (i + 1) % 2 === 0 || i === chunks.length - 1;
    /** Holistic pass only after ≥20% of the essay (by chunk count); prior passes keep initial OI (band/shift unknown). */
    const chunkPct = (i + 1) / chunks.length;
    const holisticMinPct = 0.2;
    const doHolistic = runHolistic && chunkPct >= holisticMinPct;
    if (doHolistic) {
      if (onHolisticBefore) onHolisticBefore(i, chunks.length, notes);
      const oi = await updateHolisticImpressionPass(
        sourceText,
        chunks,
        paraStartSet,
        i,
        chunks.length,
        notes,
        allAnnotations,
      );
      notes = { ...notes, overallImpression: oi };
      if (onHolisticAfter) onHolisticAfter(i, chunks.length, notes, allAnnotations);
    }

    if (onAfter) onAfter(i, chunks.length, notes, chunkAnns, allAnnotations);
  }

  return { notes, chunks, allAnnotations };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRITERION SCORING  — each criterion scored from reading notes alone
// ═══════════════════════════════════════════════════════════════════════════════

const CRITERION_DESCRIPTORS = {
  A: {
    name: 'A: Knowledge and Understanding of the Text',
    focus: `Score on: How deeply does the student understand the source text's meaning and effects?
Key distinction — literal (naming what is there) vs inferential (explaining how it works) vs perceptive (drawing larger implications about meaning, context, or human experience).
Perceptive responses unpack the *why* behind authorial choices, not just the *what*.`,
  },
  B: {
    name: 'B: Understanding of the Use and Effects of Stylistic Features',
    focus: `Score on: Does the student go beyond labelling techniques (naming a metaphor) to explaining the mechanism and effect (why this metaphor works this way, what it does to meaning)?
The critical distinction: "The author uses alliteration" (label only) vs "The alliteration in 'bleak, bare' creates a drumbeat of desolation that enacts the emptiness being described" (mechanism + effect).
Consistent mechanism-and-effect analysis across the essay is required for Band 4–5.`,
  },
  C: {
    name: 'C: Focus, Organization, and Development',
    focus: `Score on: Does the essay build a coherent analytical argument from start to finish?
Key distinction: content-tracking organisation (each paragraph covers a new technique/feature, no connecting logic) vs argument-driven organisation (each paragraph advances a developing claim, ideas build on each other).
The reader experience matters: were you guided clearly? Did you understand where the argument was going? Did the essay surprise you with insight or drift into description?`,
  },
  D: {
    name: 'D: Language',
    focus: `Score on: Is the language precise, formal, and varied? Does vocabulary do analytical work?
Key distinction: high-band vocabulary actively advances the analytical claim (the word choice itself is precise and adds meaning), vs mid-band vocabulary communicates adequately but without precision.
Register: consistently academic prose throughout, or informal intrusions? Any errors that impede communication?`,
  },
};

function buildScoreCriterionFocusBlock() {
  return ['A', 'B', 'C', 'D'].map(k => {
    const { name, focus } = CRITERION_DESCRIPTORS[k];
    return `━━ ${name} ━━\nFOCUS:\n${focus}`;
  }).join('\n\n');
}

function buildScoreAllCriteriaAnnBlock(annotations) {
  const annByCrit = { A: [], B: [], C: [], D: [] };
  for (const a of annotations) {
    if (annByCrit[a.criterion]) annByCrit[a.criterion].push(`[${a.type}] "${a.anchor}" — ${a.note}`);
  }
  return ['A', 'B', 'C', 'D']
    .map(k => `Criterion ${k}:\n${annByCrit[k].length ? annByCrit[k].join('\n') : '(none)'}`)
    .join('\n\n');
}

function buildScoreAllCriteriaSystemPrompt(approxWords) {
  const focusBlock = buildScoreCriterionFocusBlock();
  return `You are a senior IB English A Paper 1 SL/HL examiner and moderator.

You have just finished a complete sequential reading of a student essay (~${approxWords} words). During reading you took progressive notes, applied examiner annotations at key moments, and formed a holistic overall impression per criterion. You are now awarding final marks **0–5** for each of the four criteria.

CONTEXT: This is a **~75-minute unseen literary analysis** (Paper 1 conditions). High marks should **mostly** reflect evaluative and insightful qualities where the rubric demands them, but **do not** expect uniform perfection, zero errors in every paragraph, or complete absence of literal or uneven moments. Judge like a senior examiner under real timed pressure — anchor to the holistic impression first, then let notes and annotations correct you when they systematically disagree.

HIGH / MID / LOW DEFINITIONS (use these together with holistic band + position to choose the mark):
Criterion A — Knowledge and Understanding
- Key question: How well does the candidate demonstrate understanding of the text and draw reasoned conclusions from its implications? How well are ideas supported by references to the text?
- **Position 1 / 2 / 3 within low (A):** The **deeper** into **low** the **work** **sits** (especially **position** **1** **vs** **2** **vs** **3**), the **worse** **literal** **reading** **can** **get** — not only **weak** **inference** or **scanty** **evidence**. **Lower** **positions** **within** **low** = **more** **frequent** and **more** **serious** **misreadings** of **even** **obvious** **literal** **meanings** of the **source** (what is **plainly** on the page). **Higher** **positions** **within** **low** are still **low**-**A** for **gaps** and **thinness**, but **basic** **literal** **grip** is **less** **often** **wrong** **throughout** than at the **bottom** of the **low** **band**.
- High: strong understanding of the text; **many implications**, **some subtleties**, and **some insight** — high band does **not** require perceptive interpretation everywhere, but references are well chosen and substantially support the argument.
- Mid: understanding of the literal meaning; satisfactory interpretation of SOME implications; references generally relevant and mostly support ideas.
- Low: some understanding of the LITERAL meaning; references at times appropriate but often surface-level or infrequent; sometimes misinterpretation.

Criterion B — Analysis and Interpretation
- Key question: To what extent does the candidate analyse and evaluate how textual features and/or authorial choices shape meaning?
- **"Description" (B):** In borderline B language, this means **narration, paraphrase, plot beats, or literal summary of the source** where the task calls for **authorial choice, textual features, and how they shape meaning** — not "any describing" in general. **Description ≠ "no evaluation"** as a rule: a student can **analyse in plain language** by **naming a technique and explaining an effect** (even **simply**). Contrast **B_D** in annotations: "description" there is **summary/narration in place of** analysis, **worse** than an answer that at least **gestures** at effect.
- **What counts toward "competent" B (and the mid / mid-position-1 track):** A technique+effect move **only** **counts** when the **label** is **at least** **plausible** for the **text** and the **effect** is **defensible** and **grounded** in the passage. **Incorrect** or **unjustified** effect; **misidentification** of device or method; or **muddled** / **confusing** technique talk **does** **not** count — do **not** treat a **sprinkling** of **wrong** or **vague** pairings as **"sustained competence."** (Align with **B✓** / **B✗** / **B?** in annotations.)
- **Where bands differ:** **High vs mid** — **mainly** the **sustained depth** of **evaluation** (how/why a choice **achieves** its effect) and **broader** **weighing** of **patterns** / **several** choices — **not** whether the essay ever "describes." **Mid vs low** — whether **justified, clearly identified** **technique**+**effect** work is **sustained** enough. A response that **repeatedly** and **competently** (per the **rule** **above**) **names** **techniques** and **explains** **effects** (even if **basic**) is **on track** for **mid** and often **warrants** at least **mid position 1**; **chronic** **wrong** labels, **unjustified** **effects**, or **confusing** **mixes** of **techniques** **block** that **reading** and **point** to **low** (or only **isolated** **mid**-**level** **moments** amid **failure** **elsewhere**).
- High: **Good evaluation of effects** in **many** places; awareness of **broader authorial strategies** to create meaning, plus **some genuine insight** and explanation of how effects are produced. Does **not** need evaluation on every occasion or in every paragraph.
- Mid: **Competent** (see **"what** **counts"** **above**) **identification and explanation** of **authorial** **techniques** and **effects** across **much** of the essay; **evaluation of how** those effects are **produced** may be **thin**, **inconsistent**, or **basic** — that **tends to cap** a response in **mid**. **Sustained** **justified** technique + **defensible** effect, **even** where **"how"** is **uneven**, typically maps to **mid position 1**+; **higher** **mid** (and **high**) need **stronger** / **more** **frequent** **"how"** / **"why"** **evaluation** — **not** **filler** from **B✗/B?-heavy** work.
- Low: **Large stretches** of **literal** retelling, **plot** **summary**, or **paraphrase** with **little** **authorial** **analysis**; **or** **sustained** **failure** to **justify** **technique**+**effect** (wrong, **muddled**, or **asserted** **effects**); **or** only **rare** **patches** of **sound** B work amid **the** **rest** **failing** the **"what** **counts"** test. **Do not** use a **shallow** "how" **alone** to push **low** if **identification+effect** are **repeatedly** **plausible** and **defensible** — that **still** **leans** **mid** per **the** **rule** **above** (unless **errors** are **frequent** enough to **void** **competence** **overall**).

Criterion C — Focus and Organisation
- Key question: How well organised, coherent and focused is the presentation of ideas?
- **What "effective organisation" means (C):** **Mirrors** and **sustains** an **argument** — a **line of reasoning** in which **paragraphs** and **moves** **build** a **thesis**-led **case**. It is **not** the same as **covering** the source text **in chronological** (or **sequential** / **blow-by-blow**) **order**; that pattern can be **narrative** **tracking** with **mediocre** **C** even when the order feels **tidy**.
- **Reasoning map in notes (C — mid-upper / high-lower / high-mid, and position 1/2/3):** The **\`reasoning\`** list is a **key** **signal** for **borderline** **C**. A **comparatively** **compact** **tree** with **clear** **priority** — **fewer** top-**level** **(depth 0) nodes** and **deeper** **sub-nodes (depth 1/2) drilling into a move** **rather** **than** **adding** **new** **parallel** **moves** — **usually** **matches** **stronger** **overallImpression** **C** (tighter **argument** **discipline**). A **broad**, **flat** **map** (many **sibling** **moves** **at** **depth 0** with **only** **thin** **sub-points**) **suggests** **expansive** **sweep** over the **source** **instead** of **a** **tightly** **controlled** **line** of **thesis-led** **argument**; when **C** is **in** **doubt** (e.g. **mid** **position** **3** **vs** **high** **position** **1** **vs** **high** **position** **2**), **favour** **higher** **C** for **compact+deep** and **caution** for **expansive+shallow** unless the **prose** **itself** **is** **clearly** **superior** **on** **C**.
- **Position 1 / 2 / 3 (within band):** Reflects the **extent** of what you see in **reasoning** and the holistic note: **tighter** **organisational discipline**, **sustained focus**, and **clearer** **argument structure** (scope under control) → **higher** **position** within the band. Broader, looser, or more **fragmented** **coverage** of the same band → **lower** **position**. **When** **band** is **high —** **position 1** and **2** do **not** need **seamless** local **readability** in **every** **sentence**; they **do** need **effective** **structure** that **mirrors** the **line of** **reasoning**, **highly** **sustained** **focus**, and **very** **clear** **relations** (how **paragraphs** and **moves** **link** the **thesis** and **each** **other**). **Position 3** in **high** is **harder** to **earn** (a **higher** **bar**): expect **nearer**-**seamless** **coherence** and **tighter** **structural** **unity** for **most** of the **essay** — not **seamless** in **every** line, but **closer** to it than high **1** or **2**.
- **High vs mid (contrast):** **High** requires **sustained** **effective** organisation and/or **strong, consistent focus** across the essay. The **mirror** of the **line of reasoning** (how paragraphs **track** the **thesis** and **build**) should be **clear**; the **span** of what the essay tries to do (scope) must **not** be **so broad** that the argument **thins** or **diffuses** — high is **disciplined** in **breadth** as well as **clarity**. **Mid** is **weaker** on all of this: it is only **generally** coherent, with **only** **some** **focus** and **local** **drifts** or **fragments**; the structure is **not** **extremely** **clear** or **tight**, but it remains **understandable** and **not** **confusing**; it does **not** show the **sustained** **effectiveness** and **clarity of mirror** of high, yet it is **not** **largely** **contradictory** (that leans **low**).
- High: **Sustained** **effective** organisation and/or **high** **focus** in **most** of the essay; the **line of reasoning** (how the argument **unfolds** and **connects** to the thesis) is **evident** and **the mirror is clear**; **scope** is **controlled** — **not** **over-broad** in a way that blurs the argument. For **C**, **see** the **position** line for **how** **high 1/2** **differs** from **high 3**; **seamless** every sentence is **not** **required** for **high 1** or **2**.
- Mid: **Generally** **coherent** **structure** and **some** **focus**, but with **notable** **drifts**, **loose** **joins**, or **fragmented** **moments**; organisation is **not** **extremely** **clear** or **tight** and **not** as **effectively** **sustained** as high, yet the reader can **follow**; **not** **confusing** and **not** **self-contradicting** in the way that characterises **low**. This is the **"some discipline, but patchy"** band.
- Low: **Little** coherent organisation or **sustained** **focus**; the **line of argument** is **hard** to see; may **contradict** the thesis, **wander** badly, or read as **largely** **disconnected** / **chronology without argument**. **Low** **position 1** or **2** (the **harsher** end of the **low** **band**): **warrant** only when **reader** **reasoning** and the **essay** together show **genuinely** **incoherent**, **confusing**, **contradictory**, or **stream**-**of**-**consciousness**-**level** **structure** — **not** for **broad** or **loose** but **still** **followable** **argument** (that usually **belongs** **higher** **in** **low** or **in** **mid**).

Criterion D — Language
- Key question: How clear, varied and accurate is the language? How appropriate is register and style?
- **Position 1 / 2 / 3 (within high, mid, and low):** In **high** and **mid**, use **feeling** notes and a **global** read: **higher** **position** = **tighter** **syntax**, **more** **precise** **vocabulary**, **stronger** **register**, and a **pleasanter** **read** on **balance**. For **high** especially: **do not** be **timid** about **position** **2** or **3** when the **essay** **mostly** (≥ **~50%** of the text by space) **meets** the **high** **picture** and the **rest** is **not** a **sustained** **pull** **down** — **perfection** in **every** sentence is **not** **required** for **upper** **thirds** of **high**. **Within** **low:** **lower** **position** = **language** that **frequently** **gets** **in** **the** **way** and **impedes** **understanding**; **higher** **position** **within** **low** = still **below** **mid** and **distracting** / **clumsy**, but does **not** as **often** **block** the **reader** — **nuisance** and **lumps** more than **chronic** **unreadability**.
- **High vs mid (D — contrast):** **High** — **Syntax** is **largely** **highly** **accurate**; **many** **uses** of **sharp**, **precise** **vocabulary**; **register** is **effective**; the prose is **pleasing** to read for an examiner. **Mid** — **Syntax** is **adequately** **fit**; **vocabulary** is **academic** but **not** **especially** **precise**; **register** is **appropriate**; the read is **not** **strongly** **distracting**, but it is **not** **pleasing** or **engaging** in the **high** **sense** — it is **workable**, **not** **polished** or **lively** on the **word** **level**.

- High: **Syntax** **mostly** **highly** **accurate**; **many** **precise** **lexical** **choices**; **register** **effective**; **pleasing** to read. **(See** **position** **rule** **above** **—** **≥~50%** of the **essay** at this **level** can **support** **high** **2/3** when **warranted.)**
- Mid: **Syntax** **adequately** **appropriate**; **vocabulary** **broadly** **academic** but **not** **precise**; **register** **appropriate**; **not** **highly** **distracting** to read, but **not** **pleasing** or **engaging** **either** — **competent** but **plain**.
- Low: Stays **below** **mid**-level **control** (see **position** **rule**). **Worse** **(lower** **1)** end of the **band** — **vocabulary** / **syntax** / **register** **often** **get** **in** **the** **way**; **clarity** is **frequently** **impeded**. **Stronger** **(2** or **3)** end of **low** — still **distracting** and **lumpy** **D**-level work, but **impedes** **understanding** only **intermittently**; the **read** is **bumpy**, **not** **globally** **broken**.

PRINCIPAL BENCHMARK — HOLISTIC IMPRESSION (mandatory anchor):
For each criterion, treat **overallImpression** (band, position, confidence, the **shift** field from the last holistic pass, and the **wording of the holistic note**) as the **main** determinant of the mark. If **shift** is **"unknown"** (holistic **rung** **change** not yet judgable), rely on **band**, **position**, and the **note**; do not treat **unknown** as a directional signal. Start from that snapshot and the HIGH/MID/LOW definitions above — align your score with what the holistic pass already argued.

SECONDARY ADJUSTMENT — READING NOTES + ANNOTATIONS:
Use **reasoning, concerns, feeling**, and **annotations** to **raise or lower** the mark **only when** there is a **clear, repeated pattern** that **does not fit** the holistic call (e.g. many more negative markers than the holistic note suggests, or sustained strengths the holistic note underplayed). Small local noise should not override holistic. When you adjust, say so plainly in the justification (without meta-phrases like "the overallImpression field").

SCORING SCALE (map holistic **band + position** first; then apply secondary adjustment if warranted):
• **5** — **High** band with **position 2 or 3** (middle or upper third of high).
• **4** — **Ambiguous / borderline**: typically **high** band **position 1** OR **mid** band **position 3** (straddles 4–5 or 3–4 territory); use notes + annotations to settle which side of the boundary.
• **3** — **Mid** band with **position 1 or 2**.
• **2** — **Low** band with **position 2 or 3**.
• **1** — **Low** band **position 1**.
• **0** — **Very poor**: the work **does not meaningfully engage** with this criterion in a way that could be credited, or is **egregiously** off-task for that criterion. **Rare** — use only when the response truly fails the criterion, not merely weak.

Holistic **unknown** band early in the essay: infer cautiously from notes and annotations until holistic stabilises; once holistic assigns a band, follow the table.

${focusBlock}

INDEPENDENT CRITERIA: Award A, B, C, and D separately. Do not conflate criteria. Use only evidence relevant to each letter.

REMINDER — overallImpression **position** (within-band, integers 1–3; 0 if band is unknown):
- position 1 = lower third of that band
- position 2 = middle third
- position 3 = upper third

For EACH criterion return:
• score: integer **0–5** (use the scale above)
• keyStrengths: 1–3 short bullet points — concrete strengths (annotation codes in brackets allowed, e.g. [C_SIGNPOST])
• keyWeaknesses: 1–3 short bullet points — concrete weaknesses (same)
• bandBoundary: one sentence — why this score and not the adjacent score (e.g. why 4 not 5, or why 0 not 1)
• justification: 3–5 sentences — professional IB feedback; lead from holistic quality, then note any upward/downward adjustment from the pattern in notes or annotations; avoid meta-phrases like "as noted in the reading notes".`;
}

function buildScoreAllCriteriaUserMessage(notes, annBlock) {
  return `HOLISTIC IMPRESSION (per criterion):
${JSON.stringify(notes.overallImpression ?? {}, null, 2)}

READING NOTES:
${JSON.stringify({ thesis: notes.thesis, reasoning: notes.reasoning, concerns: notes.concerns, feeling: notes.feeling }, null, 2)}

ANNOTATION EVIDENCE:
${annBlock}`;
}

/**
 * Score all four criteria in a single API call.
 * Uses reading notes, holistic impression, and annotation evidence.
 */
async function scoreAllCriteria(notes, annotations, chunks) {
  const approxWords = chunks.length * CHUNK_TARGET_WORDS;
  const annBlock = buildScoreAllCriteriaAnnBlock(annotations);
  const system = buildScoreAllCriteriaSystemPrompt(approxWords);
  const user = buildScoreAllCriteriaUserMessage(notes, annBlock);

  const raw = await callApi(system, user, SCORE_ALL_SCHEMA);
  return parseJson(raw);
}

/** Bills are per token; in-browser we measure UTF-16 code units then convert (see TYPICAL_RUN_PROFILE.methodologyLabel). */
function approxInputTokensFromChars(charCount) {
  return Math.max(0, Math.ceil(charCount / 4));
}

function approxOutputTokensFromChars(charCount) {
  return Math.max(0, Math.ceil(charCount / 3.5));
}

function typicalRunSyntheticWordBlob(targetWords, seedPrefix) {
  const cycl = ['analysis', 'argument', 'author', 'image', 'reader', 'essay', 'meaning', 'effect', 'structure', 'language', 'source', 'passage', 'technique', 'claim', 'evidence'];
  const parts = [];
  for (let w = 0; w < targetWords; w++) {
    parts.push(`${cycl[w % cycl.length]}-${seedPrefix}${w}`);
  }
  return parts.join(' ');
}

function typicalRunSyntheticEssayForSplit(totalWords, paragraphs) {
  const per = Math.floor(totalWords / paragraphs);
  const paras = [];
  for (let p = 0; p < paragraphs; p++) {
    const extra = p === paragraphs - 1 ? totalWords - per * paragraphs : 0;
    paras.push(typicalRunSyntheticWordBlob(per + extra, `p${p}`));
  }
  return paras.join('\n\n');
}

function syntheticNotesForTypicalRun(chunkIndex, totalChunks) {
  const pct = Math.round(((chunkIndex + 1) / totalChunks) * 100);
  const thesis = chunkIndex >= 2
    ? 'The student argues that the author uses patterning and contrast to qualify human frustration within social order.'
    : '';
  const nodeCount = Math.max(1, Math.min(20, Math.round((chunkIndex + 1) * (20 / totalChunks))));
  const reasoning = Array.from({ length: nodeCount }, (_, i) => ({
    text: `Reasoning node ${i + 1}: links ${['motif', 'structure', 'register', 'tone'][i % 4]} to the essay’s line on meaning; execution reads ${['thin', 'mixed', 'competent', 'clear'][i % 4]} at ${pct}% read.`,
    depth: i % 3,
  }));
  const concerns = chunkIndex >= Math.floor(totalChunks * 0.3)
    ? ['Macro concern: evidence sometimes outpaces interpretive control.', 'Some paragraphs repeat moves without advancing the thesis line.']
    : [];
  return {
    thesis,
    reasoning,
    readerState: `First-read state at chunk ${chunkIndex + 1}/${totalChunks} (~${pct}%): tracking cumulative quality and argument shape.`,
    concerns,
    feeling: {
      A: chunkIndex > 0 ? 'A: local interpretation mostly anchored; occasional generalisation.' : '',
      B: chunkIndex > 0 ? 'B: technique naming uneven; some sound mechanism–effect, some shallow.' : '',
      C: chunkIndex > 0 ? 'C: organisation broadly followable; mid-essay drift in focus.' : '',
      D: chunkIndex > 0 ? 'D: academic register held; phrasing sometimes imprecise.' : '',
    },
    overallImpression: initialNotes().overallImpression,
  };
}

function syntheticOverallImpressionForTypicalRun(chunkIndexEnd, totalChunks) {
  const pct = Math.round(((chunkIndexEnd + 1) / totalChunks) * 100);
  const para = (band, pos) => {
    const base = 'Holistic read: extent and quality across the essay so far; anchor to intro and body balance. ';
    const filler = 'Wording scales with read progress. '.repeat(3) + 'x'.repeat(Math.min(320, 80 + pct * 3));
    return {
      band, position: pos, confidence: pct <= 40 ? 'low' : pct < 70 ? 'medium' : 'medium',
      shift: '0',
      note: base + filler,
    };
  };
  return {
    A: para('mid', 2),
    B: para('mid', 2),
    C: para('mid', 2),
    D: para('mid', 2),
  };
}

function syntheticAnnotationsForTypicalRunUpTo(endChunkIdx) {
  const types = ['A_CHECK', 'B_CHECK', 'B_CROSS', 'C_CHECK', 'D_CHECK', 'A_STAR'];
  const out = [];
  for (let c = 0; c <= endChunkIdx; c++) {
    const count = 4 + (c % 3);
    for (let j = 0; j < count; j++) {
      out.push({
        chunkIndex: c,
        criterion: ['A', 'B', 'C', 'D'][j % 4],
        type: types[(c + j) % types.length],
        anchor: `anchor phrase chunk ${c} mark ${j}`,
        note: 'Examiner note: ties observation to criterion expectations for calibration.',
      });
    }
  }
  return out;
}

function syntheticChunkReadResponseJson(totalChunks, chunkIndex) {
  const notes = syntheticNotesForTypicalRun(chunkIndex, totalChunks);
  const annotations = Array.from({ length: 5 }, (_, j) => ({
    target: j % 2 === 0 ? 'current' : 'prev',
    anchor: `short anchor text ${chunkIndex} ${j}`,
    criterion: ['A', 'B', 'C', 'D'][j % 4],
    type: ['A_CHECK', 'B_CHECK', 'C_SIGNPOST', 'D_AWK', 'B_STAR'][j],
    note: 'Brief rationale for this mark.',
  }));
  return JSON.stringify({ notes, annotations });
}

function syntheticHolisticResponseJson(totalChunks, chunkIndexEnd) {
  return JSON.stringify({ overallImpression: syntheticOverallImpressionForTypicalRun(chunkIndexEnd, totalChunks) });
}

function syntheticScoreAllResponseJson() {
  const mk = (s) => ({
    score: s,
    keyStrengths: ['Sustained argument discipline on key paragraphs.', 'Some precise technique–effect moves in the body.'],
    keyWeaknesses: ['Uneven depth when moving beyond literal reading.', 'Organisation drifts in later sections.'],
    bandBoundary: 'This is a representative boundary sentence for cost sizing, not a real mark.',
    justification: 'Representative four-sentence justification body for token estimate. '.repeat(2)
      + 'It mirrors the requested length in the scorer prompt without claiming a real essay result.',
  });
  return JSON.stringify({ A: mk(3), B: mk(3), C: mk(3), D: mk(3) });
}

/**
 * Sizes the “typical essay run” by concatenating the **exact** strings this app sends (examiner background + builders),
 * using a synthetic source/essay run through `splitIntoChunks`. Output side uses **representative JSON** matching each schema’s shape.
 */
function computeTypicalRunProfileFromPrompts() {
  const scenario = {
    sourceWords: 650,
    essayWords: 900,
    bodyParagraphs: 4,
  };
  const sourceText = typicalRunSyntheticWordBlob(scenario.sourceWords, 'src');
  const studentText = typicalRunSyntheticEssayForSplit(scenario.essayWords, scenario.bodyParagraphs);
  const { chunks, paraStartSet } = splitIntoChunks(studentText);
  const nChunks = chunks.length;
  const holistics = countHolisticPassesForChunkCount(nChunks);
  const bg = EXAMINER_TRAINING_BACKGROUND;

  let sumInputChars = 0;
  let sumOutChars = 0;

  for (let i = 0; i < nChunks; i++) {
    const notes = syntheticNotesForTypicalRun(i, nChunks);
    const prev = i > 0 ? chunks[i - 1] : null;
    const prev2 = i > 1 ? chunks[i - 2] : null;
    const next = i < nChunks - 1 ? chunks[i + 1] : null;
    const paraLabel = getParaLabel(i, paraStartSet);
    const sys = buildReadChunkSystemPrompt(i, nChunks, paraLabel);
    const usr = buildReadChunkUserMessage(sourceText, prev2, prev, chunks[i], next, notes, i, nChunks, paraLabel);
    sumInputChars += (bg + sys + usr).length;
    sumOutChars += syntheticChunkReadResponseJson(nChunks, i).length;
  }

  for (let i = 0; i < nChunks; i++) {
    const runHolistic = (i + 1) % 2 === 0 || i === nChunks - 1;
    const chunkPct = (i + 1) / nChunks;
    if (!(runHolistic && chunkPct >= 0.2)) continue;

    const chunkIndexEnd = i;
    const annotations = syntheticAnnotationsForTypicalRunUpTo(chunkIndexEnd);
    const priorOi = chunkIndexEnd > 0
      ? syntheticOverallImpressionForTypicalRun(chunkIndexEnd - 1, nChunks)
      : initialNotes().overallImpression;
    const notesForHolistic = {
      ...syntheticNotesForTypicalRun(chunkIndexEnd, nChunks),
      overallImpression: priorOi,
    };

    const hSys = buildHolisticImpressionSystemPrompt(chunkIndexEnd, nChunks);
    const hUsr = buildHolisticPassUserMessage(sourceText, chunks, paraStartSet, chunkIndexEnd, nChunks, notesForHolistic, annotations);
    sumInputChars += (bg + hSys + hUsr).length;
    sumOutChars += syntheticHolisticResponseJson(nChunks, chunkIndexEnd).length;
  }

  const finalNotes = {
    ...syntheticNotesForTypicalRun(nChunks - 1, nChunks),
    overallImpression: syntheticOverallImpressionForTypicalRun(nChunks - 1, nChunks),
  };
  const finalAnnotations = syntheticAnnotationsForTypicalRunUpTo(nChunks - 1);
  const approxWords = nChunks * CHUNK_TARGET_WORDS;
  const sSys = buildScoreAllCriteriaSystemPrompt(approxWords);
  const sUsr = buildScoreAllCriteriaUserMessage(finalNotes, buildScoreAllCriteriaAnnBlock(finalAnnotations));
  sumInputChars += (bg + sSys + sUsr).length;
  sumOutChars += syntheticScoreAllResponseJson().length;

  const totalCalls = nChunks + holistics + 1;
  const inputTok = approxInputTokensFromChars(sumInputChars);
  const outputTok = approxOutputTokensFromChars(sumOutChars);

  return {
    nChunks,
    holistics,
    readCalls: nChunks,
    scoreCalls: 1,
    totalCalls,
    inputTok,
    outputTok,
    inputCharsTotal: sumInputChars,
    outputCharsTotal: sumOutChars,
    scenario,
    methodologyLabel:
      `Prompts: synthetic ${scenario.sourceWords}-word source + ${scenario.essayWords}-word essay → ${nChunks} chunks via splitIntoChunks. `
      + `Input = Σ char length of EXAMINER_TRAINING_BACKGROUND + each system + user (UTF-16 code units). `
      + `Output = representative JSON per step; tokens ≈ input_chars÷4, output_chars÷3.5 (real BPE ±~10–25%).`,
  };
}

const TYPICAL_RUN_PROFILE = computeTypicalRunProfileFromPrompts();

/** Legacy per-criterion scorer kept for compatibility (not used by new Score button). */
async function scoreFromNotes(criterion, notes, chunks) {
  const { name, focus } = CRITERION_DESCRIPTORS[criterion];
  const system = `You are a senior IB English A Paper 1 examiner.\n${name}\n${focus}`;
  const user = JSON.stringify(notes, null, 2);
  const raw = await callApi(system, user, SCORE_SCHEMA);
  return parseJson(raw);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRITERION RUNNERS
// ═══════════════════════════════════════════════════════════════════════════════

const NOTES_CACHE_KEY       = 'ib-grader-reading-notes-cache';
const ANNOTATIONS_CACHE_KEY = 'ib-grader-annotations';

/** Stable fingerprint, whitespace-normalised and content-hashed (FNV-1a 32-bit). */
function normaliseStudentText(studentText) {
  return String(studentText ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function getTextFingerprint(studentText) {
  const norm = normaliseStudentText(studentText);
  return norm.length + ':' + fnv1a(norm);
}

function loadReadingCache() {
  try {
    return JSON.parse(localStorage.getItem(NOTES_CACHE_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function isReadingCacheForText(studentText) {
  const c = loadReadingCache();
  return !!(c.fingerprint && c.fingerprint === getTextFingerprint(studentText));
}

function isReadingCacheComplete(studentText) {
  const c = loadReadingCache();
  if (!c || c.fingerprint !== getTextFingerprint(studentText)) return false;
  const chunksLen = Array.isArray(c.chunks) ? c.chunks.length : 0;
  // Legacy cache (no nextChunkIndex) represents a completed pass.
  if (!('nextChunkIndex' in c)) return !!(c.notes && chunksLen > 0);
  const nextIdx = Number(c.nextChunkIndex ?? 0);
  if (!Number.isFinite(nextIdx)) return !!(c.notes && chunksLen > 0);
  return !!(c.notes && chunksLen > 0 && nextIdx >= chunksLen);
}

/** True if localStorage has a completed reading pass (notes + fingerprint). */
function hasReadingNotesCache() {
  try {
    // Use the same normalised fingerprint as handleRunAll so they agree.
    const studentText = (localStorage.getItem(KEY_STUDENT) ?? '').trim();
    return isReadingCacheComplete(studentText);
  } catch {
    return false;
  }
}

function saveReadingCache({ fingerprint, notes, chunks, nextChunkIndex, paraStarts }) {
  localStorage.setItem(NOTES_CACHE_KEY, JSON.stringify({
    fingerprint,
    notes,
    chunks,
    nextChunkIndex,
    paraStarts: Array.isArray(paraStarts) ? paraStarts : [...(paraStarts ?? [])],
  }));
}

function loadFixedChunksForStudentText(studentText) {
  const fp = getTextFingerprint(studentText);
  try {
    const c = JSON.parse(localStorage.getItem(NOTES_CACHE_KEY) ?? '{}');
    if (c?.fingerprint === fp && Array.isArray(c.chunks) && c.chunks.length) return c.chunks;
  } catch { /* */ }
  return splitIntoChunks(studentText).chunks;
}

/**
 * Get or run the sequential reading pass.
 * Caches notes + annotations in localStorage so re-running a different
 * criterion doesn't re-read the whole essay.
 */
/**
 * @param {string} sourceText
 * @param {string} studentText
 * @param {{ onBefore?: Function, onAfter?: Function, onHolisticBefore?: Function, onHolisticAfter?: Function }} [callbacks]  — forwarded to readEssaySequentially
 * @returns {{ notes, chunks, allAnnotations, fromCache: boolean }}
 */
async function getReadingNotes(sourceText, studentText, callbacks = {}) {
  const textFingerprint = getTextFingerprint(studentText);
  const cached = localStorage.getItem(NOTES_CACHE_KEY);

  if (cached) {
    try {
      const { fingerprint, notes, chunks, nextChunkIndex, paraStarts } = JSON.parse(cached);
      if (fingerprint === textFingerprint && Array.isArray(chunks) && chunks.length) {
        const allAnnotations = JSON.parse(localStorage.getItem(ANNOTATIONS_CACHE_KEY) ?? '[]');
        // Legacy cache (no nextChunkIndex) represents a completed pass.
        const isLegacy = nextChunkIndex === undefined || nextChunkIndex === null;
        const nextIdx = Number(isLegacy ? chunks.length : nextChunkIndex);
        const isComplete = isLegacy || (Number.isFinite(nextIdx) && nextIdx >= chunks.length);
        if (isComplete) {
          const paraStartsArr = Array.isArray(paraStarts) ? paraStarts : null;
          return { notes, chunks, allAnnotations, paraStarts: paraStartsArr, fromCache: true };
        }

        // Partial cache — resume using the SAME fixed chunking as the first run.
        // If paraStarts is missing (older cache), recompute once ONLY to validate chunking still matches.
        let paraStartSet = Array.isArray(paraStarts) ? new Set(paraStarts.map(n => Number(n)).filter(n => Number.isFinite(n))) : null;
        if (!paraStartSet || paraStartSet.size === 0) {
          const fresh = splitIntoChunks(studentText);
          const freshSig = studentEssaySig(fresh.chunks.join('\n'));
          const cachedSig = studentEssaySig(chunks.join('\n'));
          if (freshSig !== cachedSig || fresh.chunks.length !== chunks.length) {
            // Essay text changed relative to cached chunking — drop both caches together.
            localStorage.removeItem(NOTES_CACHE_KEY);
            localStorage.removeItem(ANNOTATIONS_CACHE_KEY);
            // Fall through to a fresh read below.
          } else {
            paraStartSet = fresh.paraStartSet;
            saveReadingCache({
              fingerprint: textFingerprint,
              notes,
              chunks,
              nextChunkIndex: clampInt(Number.isFinite(nextIdx) ? nextIdx : 0, 0, chunks.length),
              paraStarts: [...paraStartSet],
            });
          }
        }

        if (paraStartSet && paraStartSet.size) {
          const safeNext = clampInt(Number.isFinite(nextIdx) ? nextIdx : 0, 0, chunks.length);
          const resumed = await readEssaySequentiallyFromChunks(
            sourceText,
            chunks,
            paraStartSet,
            safeNext,
            notes ?? initialNotes(),
            allAnnotations ?? [],
            {
              onBefore: callbacks.onBefore,
              onHolisticBefore: callbacks.onHolisticBefore,
              onHolisticAfter: callbacks.onHolisticAfter,
              onAfter(chunkIdx, total, updatedNotes, chunkAnnotations, updatedAll) {
                // Persist progress after each successfully-read chunk.
                saveReadingCache({
                  fingerprint: textFingerprint,
                  notes: updatedNotes,
                  chunks,
                  nextChunkIndex: chunkIdx + 1,
                  paraStarts: [...paraStartSet],
                });
                localStorage.setItem(ANNOTATIONS_CACHE_KEY, JSON.stringify(updatedAll ?? []));
                callbacks.onAfter?.(chunkIdx, total, updatedNotes, chunkAnnotations, updatedAll);
              },
            },
          );
          return { ...resumed, paraStarts: [...paraStartSet], fromCache: false };
        }
      }
    } catch { /* ignore corrupt cache */ }
  }

  const { chunks, paraStartSet } = splitIntoChunks(studentText);
  let nextChunkIndex = 0;
  const result = await readEssaySequentiallyFromChunks(
    sourceText,
    chunks,
    paraStartSet,
    nextChunkIndex,
    initialNotes(),
    [],
    {
      onBefore: callbacks.onBefore,
      onHolisticBefore: callbacks.onHolisticBefore,
      onHolisticAfter: callbacks.onHolisticAfter,
      onAfter(chunkIdx, total, updatedNotes, chunkAnnotations, updatedAll) {
        saveReadingCache({
          fingerprint: textFingerprint,
          notes: updatedNotes,
          chunks,
          nextChunkIndex: chunkIdx + 1,
          paraStarts: [...paraStartSet],
        });
        localStorage.setItem(ANNOTATIONS_CACHE_KEY, JSON.stringify(updatedAll ?? []));
        callbacks.onAfter?.(chunkIdx, total, updatedNotes, chunkAnnotations, updatedAll);
      },
    },
  );
  // Ensure final cache is marked complete.
  saveReadingCache({
    fingerprint: textFingerprint,
    notes: result.notes,
    chunks: result.chunks,
    nextChunkIndex: result.chunks.length,
    paraStarts: [...paraStartSet],
  });
  localStorage.setItem(ANNOTATIONS_CACHE_KEY, JSON.stringify(result.allAnnotations ?? []));
  return { ...result, paraStarts: [...paraStartSet], fromCache: false };
}

/** Relaxed /20 → IB 1–7 (calibrated for stricter per-criterion marks). */
const IB7_BOUNDARY_TABLE = [
  { grade: 7, minTotal: 16, rangeLabel: '16–20' },
  { grade: 6, minTotal: 13, rangeLabel: '13–15' },
  { grade: 5, minTotal: 11, rangeLabel: '11–12' },
  { grade: 4, minTotal: 8,  rangeLabel: '8–10' },
  { grade: 3, minTotal: 6,  rangeLabel: '6–7' },
  { grade: 2, minTotal: 3,  rangeLabel: '3–5' },
  { grade: 1, minTotal: 0,  rangeLabel: '0–2' },
];

/**
 * Map raw total (0–20) to IB grade (1–7). Bands are relaxed for this stricter
 * per-criterion grader. (See IB7_BOUNDARY_TABLE.)
 */
function totalToIbGrade(total) {
  for (const row of IB7_BOUNDARY_TABLE) {
    if (total >= row.minTotal) return row.grade;
  }
  return 1;
}

function renderIb7BoundaryTableHtml(achievedGrade) {
  const body = IB7_BOUNDARY_TABLE.map(
    (row) => `
    <tr class="ib-ib7-table__row${row.grade === achievedGrade ? ' ib-ib7-table__row--current' : ''}" data-ib-grade="${row.grade}"${row.grade === achievedGrade ? ' aria-current="true"' : ''}>
      <th scope="row" class="ib-ib7-table__grade">IB ${row.grade}</th>
      <td class="ib-ib7-table__range">${row.rangeLabel}</td>
    </tr>`,
  ).join('');
  return `
    <div class="ib-ib7-table-wrap" role="group" aria-label="IB overall grade from total out of 20 (this grader)">
      <h4 class="ib-ib7-table__title">IB grade (1–7) from total /20</h4>
      <table class="ib-ib7-table">
        <caption class="ib-ib7-table__caption">Band boundaries; your result row is highlighted.</caption>
        <thead><tr><th scope="col">Grade</th><th scope="col">Total (of 20)</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERALL IB MODERATION
// ═══════════════════════════════════════════════════════════════════════════════

async function runOverallModeration(scores) {
  const { A, B, C, D } = scores;
  const preTotal   = (Number(A) + Number(B) + Number(C) + Number(D)) || 0;
  const preIbGrade = totalToIbGrade(Math.max(0, Math.min(20, preTotal)));
  // One line for the model’s arithmetic only — the app renders the full band table in the UI.
  const bandRef = IB7_BOUNDARY_TABLE.map((r) => `${r.grade}:${r.rangeLabel}`).join(', ');

  const system = `You are a senior IB English A Paper 1 chief moderator.
You have received criterion marks from an AI examiner. Your job:
1. Check that the four criterion marks are internally consistent.
2. Apply any moderation if marks seem **inconsistent** with each other.
3. Calculate the final total (A + B + C + D, out of 20) and the IB overall **1–7** using the **relaxed** mapping given in the user message (stricter per-criterion grader, so bands are relaxed in the app).
4. In your \`comment\` (3–5 sentences): **holistic** **assessment** of the **profile** only. **Do** **not** list or reproduce the 1–7 band table, bullet band rows, or ranges — the **student** **app** **shows** that table and highlights the achieved band. You may refer briefly to the final total and IB 1–7 in prose if it helps, but not as a table.

Return JSON:
{
  "moderatedA": <integer 0–5>,
  "moderatedB": <integer 0–5>,
  "moderatedC": <integer 0–5>,
  "moderatedD": <integer 0–5>,
  "total": <integer 0–20>,
  "comment": "<3–5 sentence holistic comment only; no band table>"
}`;

  const user = `Relaxed total→IB reference (for your calculations; **do** **not** copy into \`comment\`): ${bandRef}

*Initial* total: ${preTotal} / 20 (IB ${preIbGrade} *before* any mark changes).
---

Criterion marks submitted:
A (Knowledge & Understanding): ${A}/5
B (Analysis & Evaluation): ${B}/5
C (Focus, Organisation & Development): ${C}/5
D (Language): ${D}/5

Please moderate and return the final result.`;

  const raw = await callApi(system, user);
  return parseJson(raw);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORE + RESULT PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

function saveScore(key, score) { localStorage.setItem(key, String(score)); }
function loadScore(key) { const v = localStorage.getItem(key); return v !== null ? Number(v) : null; }
function allScoresSaved() {
  return [KEY_SCORE_A, KEY_SCORE_B, KEY_SCORE_C, KEY_SCORE_D].every((k) => loadScore(k) !== null);
}

const SCORE_DETAILS_KEY = 'ib-grader-score-details';
function saveScoreDetail(criterion, detail) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem(SCORE_DETAILS_KEY) ?? '{}'); } catch { /* */ }
  all[criterion] = detail;
  localStorage.setItem(SCORE_DETAILS_KEY, JSON.stringify(all));
}
function loadScoreDetails() {
  try { return JSON.parse(localStorage.getItem(SCORE_DETAILS_KEY) ?? '{}'); } catch { return {}; }
}

function clearAllScores() {
  [KEY_SCORE_A, KEY_SCORE_B, KEY_SCORE_C, KEY_SCORE_D,
   KEY_OVERALL, KEY_CLASSIFY, NOTES_CACHE_KEY, SCORE_DETAILS_KEY,
   ANNOTATIONS_CACHE_KEY, SCORE_LOCKED_KEY].forEach((k) => localStorage.removeItem(k));
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function $(id) { return document.getElementById(id); }

function showError(msg) {
  const box = $('errorBox');
  if (!box) return;
  box.textContent = msg;
  box.hidden = false;
}
function clearError() { const b = $('errorBox'); if (b) b.hidden = true; }

function setSpinner(spinnerId, visible) {
  const el = $(spinnerId);
  if (el) el.hidden = !visible;
}

function showProgress(msg, pct = null) {
  const wrap   = $('progressWrap');
  const status = $('progressStatus');
  const fill   = $('progressFill');
  const track  = $('progressTrack');
  if (!wrap) return;
  wrap.hidden = false;
  if (status) status.textContent = msg;
  if (fill && pct !== null) {
    fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    fill.classList.remove('progress-fill--indeterminate');
  } else if (fill) {
    fill.style.width = '';
    fill.classList.add('progress-fill--indeterminate');
  }
  if (track) track.setAttribute('aria-valuenow', pct ?? 0);
}
function hideProgress() {
  const wrap = $('progressWrap');
  if (wrap) wrap.hidden = true;
}
// legacy aliases used elsewhere
const showStatus = (msg) => showProgress(msg, null);
const hideStatus = hideProgress;

const TILE_IDS = {
  A: { scoreNum: 'criterionATileScoreNum',   scoreLine: 'criterionATileScoreLine',      caption: 'criterionATileScoreCaption'    },
  B: { scoreNum: 'criterionBTileScoreNum',   scoreLine: 'criterionBTileScoreLine',      caption: 'criterionBTileScoreCaption'    },
  C: { scoreNum: 'criterionCTileFinalNum',   scoreLine: 'criterionCTileFinalLine',      caption: 'criterionCTileFinalCaption'    },
  D: { scoreNum: 'criterionDTileScoreNumFinal', scoreLine: 'criterionDTileScoreLineFinal', caption: 'criterionDTileScoreCaptionFinal' },
};

function setTileScore(criterion, score) {
  const ids = TILE_IDS[criterion];
  const numEl  = $(ids.scoreNum);
  const lineEl = $(ids.scoreLine);
  const capEl  = $(ids.caption);
  if (numEl)  numEl.textContent = String(score);
  if (lineEl) lineEl.hidden = false;
  if (capEl)  capEl.hidden = false;
}

function updateOverallPanel() {
  // No-op: overall is now rendered directly by renderOverallFromScores after scoring.
}

/** Render the overall panel from the four saved criterion scores + their details. */
function renderOverallFromScores() {
  const scores = {
    A: loadScore(SCORE_KEY_MAP.A),
    B: loadScore(SCORE_KEY_MAP.B),
    C: loadScore(SCORE_KEY_MAP.C),
    D: loadScore(SCORE_KEY_MAP.D),
  };
  if (Object.values(scores).some(v => v === null)) return;

  const total   = scores.A + scores.B + scores.C + scores.D;
  const ibGrade = totalToIbGrade(total);
  const details = loadScoreDetails();

  const critNames = {
    A: 'Knowledge &amp; Understanding',
    B: 'Analysis &amp; Evaluation',
    C: 'Focus, Organisation &amp; Development',
    D: 'Language',
  };

  const rows = ['A', 'B', 'C', 'D'].map(k => `
    <tr>
      <td>${k} — ${critNames[k]}</td>
      <td class="ib-score-cell">${scores[k]}</td>
      <td class="ib-score-max">5</td>
    </tr>`).join('');

  const el = $('ibOverallResult');
  if (!el) return;

  const feedbackHtml = ['A', 'B', 'C', 'D']
    .map((k) => {
      const d = details[k];
      if (!d) return '';
      const jus = (d.justification ?? '').trim();
      const strengths = (d.keyStrengths ?? []).map((s) => DOMPurify.sanitize(s)).filter(Boolean);
      const weaknesses = (d.keyWeaknesses ?? []).map((w) => DOMPurify.sanitize(w)).filter(Boolean);
      const bb = (d.bandBoundary ?? '').trim();
      if (!jus && !strengths.length && !weaknesses.length && !bb) return '';
      return `<div class="ib-feedback-block">
        <p class="ib-feedback-crit ib-feedback-crit--${k.toLowerCase()}">Criterion ${k} — ${critNames[k]}</p>
        ${jus ? `<p class="ib-feedback-justification">${DOMPurify.sanitize(jus)}</p>` : ''}
        ${strengths.length ? `<p class="ib-feedback-line"><span class="ib-feedback-label">Strengths</span> ${strengths.join('; ')}</p>` : ''}
        ${weaknesses.length ? `<p class="ib-feedback-line"><span class="ib-feedback-label">Areas for improvement</span> ${weaknesses.join('; ')}</p>` : ''}
        ${bb ? `<p class="ib-feedback-band">${DOMPurify.sanitize(bb)}</p>` : ''}
      </div>`;
    })
    .join('');

  el.innerHTML = `
    <div class="ib-grade-block">
    <div class="ib-grade-badge-wrap">
      <span class="ib-grade-badge">IB Grade&nbsp;<strong>${ibGrade}</strong></span>
      <span class="ib-grade-total">${total}&thinsp;/&thinsp;20</span>
    </div>
    <div class="ib-overall-scoring-row">
      <div class="ib-overall-scoring-scores">
        <table class="ib-overall-score-table">
          <thead><tr><th>Criterion</th><th>Mark</th><th>Max</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr class="ib-total-row">
              <td><strong>Total</strong></td>
              <td class="ib-score-cell"><strong>${total}</strong></td>
              <td class="ib-score-max">20</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="ib-overall-scoring-thresholds">
        ${renderIb7BoundaryTableHtml(ibGrade)}
      </div>
    </div>
    <p class="ib-grade-scale-note">1–7 uses a relaxed map from /20 to grade because this per-criterion grader is stricter; see the table above.</p>
    </div>
    ${feedbackHtml ? `<div class="ib-feedback-section"><h4 class="ib-feedback-section__title">Examiner feedback</h4>${feedbackHtml}</div>` : ''}`;

  el.hidden = false;
  const lockedMsg  = $('ibOverallLockedMsg');
  const revealWrap = $('ibOverallRevealWrap');
  if (lockedMsg)  lockedMsg.hidden = true;
  if (revealWrap) revealWrap.hidden = true;
  el.focus();
}

/** @deprecated — kept so legacy localStorage data still renders. */
function renderOverallResult(result) {
  if (result?.moderatedA !== undefined) {
    // Old moderation format — convert and re-render from current scores
    renderOverallFromScores();
  }
}

/** Remove per-criterion detail cards from tiles (feedback lives under the overall table). */
function clearCriterionTileDetails() {
  for (const crit of ['A', 'B', 'C', 'D']) {
    const tileId = `criterionATile`.replace('A', crit);
    $(tileId)?.querySelector('.criterion-tile__detail-card')?.remove();
  }
}

// ── Annotation badge metadata ─────────────────────────────────────────────────

const ANNOTATION_META = {
  A_STAR:     { label: 'A★',   title: 'Criterion A — Perceptive interpretation: extends beyond literal to implication/symbolism/resonance' },
  A_CHECK:    { label: 'A✓',   title: 'Criterion A — Some implications identified but stops at first level of interpretation' },
  A_CROSS:    { label: 'A✗',   title: 'Criterion A — Predominantly literal/surface; paraphrase substitutes for interpretation; possible misreading' },
  A_QUESTION: { label: 'A?',   title: 'Criterion A — Unconvincing analysis: evidence/reasoning does not support the interpretive claim; conclusion not persuasively warranted (note: detail the gap)' },
  A_CURVY:    { label: 'A~',   title: 'Criterion A — Not the best evidence choice to support this point' },
  A_EXCLAIM:  { label: 'A!',   title: 'Criterion A — Understands local meaning but not the broader meaning of the text' },
  B_STAR:     { label: 'B★',   title: 'Criterion B — Evaluates how this authorial choice achieves effect, or weaves several choices / broader authorial pattern' },
  B_CHECK:    { label: 'B✓',   title: 'Criterion B — Identifies a technique and describes the effect correctly' },
  B_D:        { label: 'BD',   title: 'Criterion B — Description/summary where analysis is expected (not for every line; end-of-paragraph summary often OK). No analysis of how devices affect meaning; worse than B∅' },
  B_CROSS:    { label: 'B✗',   title: 'Criterion B — Technique named but effect wrong/contradictory, or device/label wrong or misapplied' },
  B_QUESTION: { label: 'B?',   title: 'Criterion B — Connection between device and meaning is tenuous or simply asserted' },
  B_NO_EVAL:  { label: 'B∅',   title: 'Criterion B — No evaluation of how the effect is achieved; may co-occur on same span as B✓' },
  B_UNSUP:    { label: 'B⚠',   title: 'Criterion B — Relies on personal/historical/trivia associations not in the text' },
  B_BR:       { label: 'BBR',  title: 'Criterion B — No effect on audience/reader: drama — no impact on stage/spectator; poetry/prose — no impact on reader' },
  C_STAR:     { label: 'C★',   title: 'Criterion C — Organisation mirrors the argument line; highly focused, clear scope, selective detailed evidence (above C✓)' },
  C_CHECK:    { label: 'C✓',   title: 'Criterion C — Clearly focused; connects to topic sentence or prior argument' },
  C_CROSS:    { label: 'C✗',   title: 'Criterion C — Contradiction with a prior claim or the thesis' },
  C_QUESTION: { label: 'C?',   title: 'Criterion C — Focus breaking down; stream-of-consciousness; main point hard to follow' },
  C_SIGNPOST: { label: 'C→',   title: 'Criterion C — Logical/argumentative transition rather than sequential ("also", "in addition")' },
  C_S:        { label: 'CS',   title: 'Criterion C — Scattered: multiple unrelated points, no clear priority or connecting logic' },
  C_DRIFT:    { label: 'C≋',   title: 'Criterion C — Drifts from thesis line of reasoning (e.g. intro promises contrast/sequence; body treats points in isolation or veers from stated argument)' },
  C_ICP:      { label: 'ICP',  title: 'Criterion C — Incomplete: paragraph unfinished or fragmentary; or essay missing/truncated intro or conclusion (structural incompleteness, not just weak focus)' },
  D_SP:       { label: 'DSP',  title: 'Criterion D — Spelling error' },
  D_AWK:      { label: 'DAWK', title: 'Criterion D — Awkward phrasing' },
  D_SD:       { label: 'DSD',  title: 'Criterion D — Sentence too dense to parse; hard to read in one breath' },
  D_WC:       { label: 'DWC',  title: 'Criterion D — Imprecise word choice' },
  D_GRA:      { label: 'DGRA', title: 'Criterion D — Minor mechanics/syntax error, but meaning remains clear' },
  D_CHECK:    { label: 'D✓',   title: 'Criterion D — Good word choice: precise and analytically effective' },
  D_V:        { label: 'DV',   title: 'Criterion D — Vague' },
  D_CROSS:    { label: 'D✗',   title: 'Criterion D — Syntax error: confusing or hard to understand' },
  D_R:        { label: 'DR',   title: 'Criterion D — Inappropriate register (informal, subjective, not grounded in authorial attribution)' },
};

// All badges are rendered in red — criterion is identifiable by the letter prefix.
const CRIT_CLASS = { A: 'ann-red', B: 'ann-red', C: 'ann-red', D: 'ann-red' };

// ── HTML helpers ──────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the student essay as HTML with inline annotation badges.
 * Each annotation's `anchor` is searched in the text; a badge is inserted
 * immediately after the first match. Multiple badges at the same point are
 * grouped. Unmatched anchors are appended as orphan badges at the very end.
 */
function buildAnnotatedHtml(studentText, annotations) {
  if (!studentText) return '';

  // Collect (insertAt, annotation) pairs
  const positioned = [];
  const orphans    = [];

  for (const ann of annotations) {
    if (!ann.anchor) { orphans.push(ann); continue; }
    const idx = studentText.toLowerCase().indexOf(ann.anchor.toLowerCase());
    if (idx === -1) { orphans.push(ann); continue; }
    positioned.push({ insertAt: idx + ann.anchor.length, ann });
  }

  // Sort by position, stable
  positioned.sort((a, b) => a.insertAt - b.insertAt);

  // Group badges that land at the same position
  const groups = [];
  for (const p of positioned) {
    const last = groups[groups.length - 1];
    if (last && last.insertAt === p.insertAt) {
      last.annotations.push(p.ann);
    } else {
      groups.push({ insertAt: p.insertAt, annotations: [p.ann] });
    }
  }

  function badgeHtml(ann, i) {
    const meta = ANNOTATION_META[ann.type] ?? { label: ann.type, title: '' };
    const cls  = CRIT_CLASS[ann.criterion] ?? '';
    const data = escapeHtml(JSON.stringify({ ...ann, chunkText: undefined }));
    return `<button class="inline-ann-badge ${cls}" data-ann="${data}" title="${escapeHtml(meta.title)}" aria-label="${escapeHtml(meta.title)}">${escapeHtml(meta.label)}</button>`;
  }

  function groupHtml(annotations) {
    return `<span class="inline-ann-group">${annotations.map(badgeHtml).join('')}</span>`;
  }

  // Build final HTML
  let html  = '';
  let cursor = 0;

  for (const g of groups) {
    // Text segment before this group — escape and preserve newlines
    const seg = studentText.slice(cursor, g.insertAt);
    html += escapeHtml(seg).replace(/\n/g, '<br>');
    html += groupHtml(g.annotations);
    cursor = g.insertAt;
  }
  // Remaining text
  html += escapeHtml(studentText.slice(cursor)).replace(/\n/g, '<br>');

  // Orphan badges (anchor not found) — append at end with a separator
  if (orphans.length) {
    html += `<span class="inline-ann-orphans">`;
    for (const ann of orphans) {
      html += badgeHtml(ann);
    }
    html += `</span>`;
  }

  return html;
}

// ── Reading panel ─────────────────────────────────────────────────────────────

/** Build a single annotation badge element (HTML string). */
function buildBadgeHtml(ann) {
  const meta = ANNOTATION_META[ann.type] ?? { label: ann.type, title: ann.type };
  const data = escapeHtml(JSON.stringify(ann));
  return `<button class="inline-ann-badge ann-red" data-ann="${data}" title="${escapeHtml(meta.title)}" aria-label="${escapeHtml(meta.title)}">${escapeHtml(meta.label)}</button>`;
}

/** Render a single chunk's text with its annotations inline. */
function renderChunkWithAnnotations(chunkText, chunkAnnotations) {
  if (!chunkAnnotations || !chunkAnnotations.length) {
    return escapeHtml(chunkText).replace(/\n/g, '<br>');
  }
  const positioned = [];
  const orphans    = [];
  for (const ann of chunkAnnotations) {
    if (!ann.anchor) { orphans.push(ann); continue; }
    const idx = chunkText.toLowerCase().indexOf(ann.anchor.toLowerCase());
    if (idx === -1) { orphans.push(ann); continue; }
    positioned.push({ insertAt: idx + ann.anchor.length, ann });
  }
  positioned.sort((a, b) => a.insertAt - b.insertAt);
  const groups = [];
  for (const p of positioned) {
    const last = groups[groups.length - 1];
    if (last && last.insertAt === p.insertAt) last.annotations.push(p.ann);
    else groups.push({ insertAt: p.insertAt, annotations: [p.ann] });
  }
  let html = '', cursor = 0;
  for (const g of groups) {
    html += escapeHtml(chunkText.slice(cursor, g.insertAt)).replace(/\n/g, '<br>');
    html += `<span class="inline-ann-group">${g.annotations.map(buildBadgeHtml).join('')}</span>`;
    cursor = g.insertAt;
  }
  html += escapeHtml(chunkText.slice(cursor)).replace(/\n/g, '<br>');
  if (orphans.length) {
    html += `<span class="inline-ann-orphans">${orphans.map(buildBadgeHtml).join('')}</span>`;
  }
  return html;
}

let _rpChunks = [];           // reading-panel chunks
let _rpChunkAnns = [];        // per-chunk annotation arrays (populated as AI reads)

/** Initial render: all chunks shown as pending (dimmed), with paragraph headers. */
function initReadingPanel(chunks, paraStartSet = new Set([0])) {
  _rpChunks    = chunks;
  _rpChunkAnns = chunks.map(() => []);

  const textEl = $('readingPanelText');
  if (textEl) {
    let paraNum = 0;
    textEl.innerHTML = chunks.map((chunk, i) => {
      let html = '';
      if (paraStartSet.has(i)) {
        paraNum++;
        html += `<div class="rp-para-header" data-para="${paraNum}">Paragraph ${paraNum}</div>`;
      }
      html += `<span class="rp-chunk rp-chunk--pending" data-idx="${i}">${escapeHtml(chunk)}</span><span class="rp-chunk-sep"> </span>`;
      return html;
    }).join('');

    textEl.addEventListener('click', (e) => {
      const badge = e.target.closest('.inline-ann-badge');
      if (!badge) return;
      e.stopPropagation();
      let ann;
      try { ann = JSON.parse(badge.dataset.ann); } catch { return; }
      showReadingPanelPopover(badge, ann);
    });
  }

  $('readingPanel').hidden = false;
}

/** Called just before the AI reads chunk `chunkIdx` — highlight it, scroll within the text column. */
function markChunkCurrent(chunkIdx) {
  const textEl = $('readingPanelText');
  if (!textEl) return;
  for (const span of textEl.querySelectorAll('.rp-chunk')) {
    const i = Number(span.dataset.idx);
    if (i === chunkIdx) {
      span.className = 'rp-chunk rp-chunk--current';
      // Scroll within the text column (not the page) so notes stay visible
      const targetTop = span.offsetTop - textEl.offsetTop;
      textEl.scrollTo({ top: Math.max(0, targetTop - 40), behavior: 'smooth' });
    } else if (i > chunkIdx) {
      span.className = 'rp-chunk rp-chunk--pending';
    }
  }
}

/** Called after the AI finishes chunk `chunkIdx` — inject annotations, mark done. */
function markChunkDone(chunkIdx, chunkAnnotations) {
  _rpChunkAnns[chunkIdx] = chunkAnnotations;
  const textEl = $('readingPanelText');
  if (!textEl) return;
  const span = textEl.querySelector(`.rp-chunk[data-idx="${chunkIdx}"]`);
  if (!span) return;
  span.className = 'rp-chunk rp-chunk--done';
  span.innerHTML = renderChunkWithAnnotations(_rpChunks[chunkIdx], chunkAnnotations);
}

/** Recursively render a reasoning node array as nested <ul> HTML. */
function renderReasoningHtml(nodes) {
  if (!nodes) return '';
  // Legacy: plain string from old cache
  if (typeof nodes === 'string') {
    return `<ul class="rp-reasoning rp-reasoning--d0"><li class="rp-reasoning__item rp-reasoning__item--d0">${escapeHtml(nodes)}</li></ul>`;
  }
  if (!Array.isArray(nodes) || !nodes.length) return '';
  // Legacy nested format: nodes have .children instead of .depth → flatten
  const flat = [];
  function flattenLegacy(arr, d) {
    for (const n of arr) {
      if (!n || typeof n !== 'object') { flat.push({ text: String(n), depth: d }); continue; }
      flat.push({ text: n.text ?? '', depth: n.depth ?? d });
      if (Array.isArray(n.children) && n.children.length) flattenLegacy(n.children, d + 1);
    }
  }
  // Detect legacy (has .children property on first node that has no .depth)
  const isLegacy = nodes[0] && typeof nodes[0] === 'object' && 'children' in nodes[0] && !('depth' in nodes[0]);
  if (isLegacy) flattenLegacy(nodes, 0);
  else for (const n of nodes) flat.push({ text: n?.text ?? String(n), depth: n?.depth ?? 0 });

  const items = flat.map(n => `<li class="rp-reasoning__item rp-reasoning__item--d${n.depth}">${escapeHtml(n.text)}</li>`).join('');
  return `<ul class="rp-reasoning">${items}</ul>`;
}

function renderBandPositionBar(band, position) {
  if (!band || band === 'unknown') return '';
  const pos = normalizeHolisticPosition(position);
  if (pos <= 0) return '';
  const tierWords = ['lower', 'middle', 'upper'];
  const tierLetters = ['L', 'M', 'U'];
  const word = tierWords[pos - 1];
  const segs = [1, 2, 3]
    .map(i => {
      const filled = i <= pos ? ' rp-bandpos__seg--filled' : '';
      const ch = tierLetters[i - 1];
      return `<span class="rp-bandpos__seg${filled}" aria-hidden="true"><span class="rp-bandpos__seg-label">${ch}</span></span>`;
    })
    .join('');
  const title = `Within band: ${word} third (${pos}/3) — vs ${band} band descriptors`;
  return `<span class="rp-bandpos" title="${escapeHtml(title)}" aria-label="${escapeHtml(`Within band: ${word} third, ${pos} of 3`)}">${segs}</span>`;
}

/**
 * Holistic pass net *rung* change vs prior on the 9-rung scale (low1…high3) — UI chip.
 * @param {string} band — current band (for normalising empty shift)
 */
function renderHolisticShiftChip(shift, band) {
  const s = normalizeHolisticShift(shift, band);
  if (s === 'unknown') {
    const label = 'Shift: not determined yet (or placement not on the 9-rung scale for this pass)';
    return `<span class="rp-overall-shift rp-overall-shift--unk" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">?</span>`;
  }
  if (typeof s !== 'number' || !Number.isFinite(s)) {
    const label = 'Shift: not determined';
    return `<span class="rp-overall-shift rp-overall-shift--unk" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">?</span>`;
  }
  const n = s;
  const label =
    n === 0
      ? 'Shift: 0 (same rung: band + within-band position unchanged vs prior pass)'
      : `Shift: ${n > 0 ? '+' : '−'}${Math.abs(n)} on 9-rung scale (low1→low2→…→high3) vs prior pass`;
  if (n === 0) {
    return `<span class="rp-overall-shift rp-overall-shift--0" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">0</span>`;
  }
  const text = n > 0 ? `+${n}` : `−${Math.abs(n)}`;
  const al = `${n > 0 ? 'Plus' : 'Minus'} ${Math.abs(n)} on 9-rung scale vs prior pass`;
  if (n > 0) {
    const mod = n === 1 ? 'p1' : 'p-pos';
    return `<span class="rp-overall-shift rp-overall-shift--${mod}" title="${escapeHtml(label)}" aria-label="${escapeHtml(al)}">${text}</span>`;
  }
  const mod = n === -1 ? 'm1' : 'm-neg';
  return `<span class="rp-overall-shift rp-overall-shift--${mod}" title="${escapeHtml(label)}" aria-label="${escapeHtml(al)}">${text}</span>`;
}

/** Render overallImpression into the dedicated right-hand box. */
function updateOverallImpressionBox(notes) {
  const el = $('readingPanelOverall');
  if (!el || !notes) return;
  const oi = notes.overallImpression ?? {};
  const rows = ['A', 'B', 'C', 'D']
    .filter(k => oi[k]?.band && oi[k].band !== 'unknown')
    .map(k => {
      const { band, position, confidence, note, shift } = oi[k];
      const confLabel = confidence === 'unknown' ? '' : confidence;
      return `<div class="rp-overall-crit-block">
        <div class="rp-overall-crit-header">
          <span class="rp-feeling-crit rp-feeling-crit--${k.toLowerCase()}">${k}</span>
          <span class="rp-overall-band rp-overall-band--${band}">${band}</span>
          ${renderBandPositionBar(band, position)}
          ${renderHolisticShiftChip(shift, band)}
          ${confLabel ? `<span class="rp-overall-conf">${confLabel} confidence</span>` : ''}
        </div>
        ${note ? `<p class="rp-overall-crit-note">${escapeHtml(note)}</p>` : ''}
      </div>`;
    }).join('');
  el.innerHTML = rows || '<p class="reading-panel__notes-empty">Builds as evidence accumulates…</p>';
}

/** Refresh the notes column with the latest notes object. */
function updateReadingNotes(notes) {
  const el = $('readingPanelNotes');
  if (!el || !notes) return;

  const simpleRows = [
    ['Thesis',       notes.thesis?.trim() || null],
    ['Reader state', notes.readerState],
    ['Concerns',     Array.isArray(notes.concerns) ? notes.concerns.map(c => `• ${c}`).join('\n') : notes.concerns],
  ];

  const reasoningHtml = renderReasoningHtml(notes.reasoning);

  const f = notes.feeling ?? {};
  const feelingHtml = ['A', 'B', 'C', 'D']
    .filter(k => f[k]?.trim())
    .map(k => `<div class="rp-feeling-row"><span class="rp-feeling-crit rp-feeling-crit--${k.toLowerCase()}">${k}</span><span class="rp-feeling-text">${escapeHtml(f[k])}</span></div>`)
    .join('');

  el.innerHTML =
    simpleRows
      .filter(([, v]) => v)
      .map(([label, value]) => `
        <div class="rp-note-row">
          <p class="rp-note-label">${escapeHtml(label)}</p>
          <p class="rp-note-value">${escapeHtml(String(value))}</p>
        </div>`)
      .join('') +
    (reasoningHtml
      ? `<div class="rp-note-row">
           <p class="rp-note-label">Reasoning</p>
           ${reasoningHtml}
         </div>`
      : '') +
    (feelingHtml
      ? `<div class="rp-note-row">
           <p class="rp-note-label">Current impression</p>
           <div class="rp-feeling-list">${feelingHtml}</div>
         </div>`
      : '');

  updateOverallImpressionBox(notes);
}

/** After a cache hit, render all chunks as done with their annotations. */
function finalizeReadingPanel(chunks, paraStartSet, allAnnotations, notes) {
  initReadingPanel(chunks, paraStartSet);
  // Assign annotations to chunks by anchor search
  for (const ann of allAnnotations) {
    if (!ann.anchor) continue;
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].toLowerCase().includes(ann.anchor.toLowerCase())) {
        _rpChunkAnns[i].push(ann);
        break;
      }
    }
  }
  const textEl = $('readingPanelText');
  if (textEl) {
    for (let i = 0; i < chunks.length; i++) {
      const span = textEl.querySelector(`.rp-chunk[data-idx="${i}"]`);
      if (!span) continue;
      span.className = 'rp-chunk rp-chunk--done';
      span.innerHTML = renderChunkWithAnnotations(chunks[i], _rpChunkAnns[i]);
    }
  }
  updateReadingNotes(notes);
}

// ── Reading panel badge popover ───────────────────────────────────────────────

let _rpPopover = null;
function getRpPopover() {
  if (_rpPopover) return _rpPopover;
  const el = document.createElement('div');
  el.id        = 'rpPopover';
  el.className = 'ann-popover rp-popover';
  el.hidden    = true;
  el.setAttribute('role', 'tooltip');
  el.innerHTML = `
    <button class="ann-popover__close" aria-label="Close">&#x2715;</button>
    <div class="ann-popover__badge-row">
      <span class="ann-popover__badge ann-red" id="rpPopoverBadge"></span>
      <span class="ann-popover__type" id="rpPopoverType"></span>
    </div>
    <p class="ann-popover__anchor" id="rpPopoverAnchor"></p>
    <p class="ann-popover__note"   id="rpPopoverNote"></p>`;
  document.body.appendChild(el);
  el.querySelector('.ann-popover__close').addEventListener('click', () => { el.hidden = true; });
  document.addEventListener('click', (e) => {
    if (!el.hidden && !el.contains(e.target) && !e.target.closest('.inline-ann-badge')) {
      el.hidden = true;
    }
  });
  _rpPopover = el;
  return el;
}

function showReadingPanelPopover(badgeEl, ann) {
  const pop  = getRpPopover();
  const meta = ANNOTATION_META[ann.type] ?? { label: ann.type, title: ann.type };
  pop.querySelector('#rpPopoverBadge').textContent  = meta.label;
  pop.querySelector('#rpPopoverType').textContent   = meta.title;
  pop.querySelector('#rpPopoverAnchor').textContent = ann.anchor ? `"${ann.anchor}"` : '';
  pop.querySelector('#rpPopoverNote').textContent   = ann.note ?? '';

  pop.hidden = false;
  const rect = badgeEl.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top      = `${rect.bottom + window.scrollY + 6}px`;
  pop.style.left     = `${Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - 300))}px`;
  pop.style.zIndex   = '200';
}

// ── Detail modal ──────────────────────────────────────────────────────────────

let _detailModalReady = false;

function initDetailView() {
  if (_detailModalReady) return;
  _detailModalReady = true;

  // ── Create modal DOM ───────────────────────────────────────────────────────
  const modal = document.createElement('div');
  modal.id = 'detailModal';
  modal.className = 'detail-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'detailModalTitle');
  modal.innerHTML = `
    <div class="detail-modal__backdrop"></div>
    <div class="detail-modal__panel">
      <div class="detail-modal__header">
        <h2 id="detailModalTitle" class="detail-modal__title">Examiner Reading Notes</h2>
        <button class="detail-modal__close" aria-label="Close">&#x2715;</button>
      </div>
      <div class="detail-modal__body">
        <div class="detail-modal__col detail-modal__col--notes">
          <h3 class="detail-col-title">Notes</h3>
          <div id="detailNotes" class="detail-notes-content"></div>
        </div>
        <div class="detail-modal__col detail-modal__col--overall">
          <h3 class="detail-col-title">Holistic Impression</h3>
          <div id="detailOverall" class="detail-overall-content"></div>
        </div>
        <div class="detail-modal__col detail-modal__col--essay">
          <h3 class="detail-col-title">Annotated Essay</h3>
          <div id="detailEssay" class="detail-essay-content"></div>
        </div>
      </div>
    </div>
    <div class="ann-popover" id="annPopover" hidden role="tooltip">
      <button class="ann-popover__close" aria-label="Close">&#x2715;</button>
      <div class="ann-popover__badge-row">
        <span class="ann-popover__badge" id="annPopoverBadge"></span>
        <span class="ann-popover__type" id="annPopoverType"></span>
      </div>
      <p class="ann-popover__anchor" id="annPopoverAnchor"></p>
      <p class="ann-popover__note" id="annPopoverNote"></p>
    </div>`;
  document.body.appendChild(modal);

  // ── Close button ───────────────────────────────────────────────────────────
  const closeModal = () => { modal.hidden = true; };
  modal.querySelector('.detail-modal__close').addEventListener('click', closeModal);
  modal.querySelector('.detail-modal__backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  // ── Popover on badge click ─────────────────────────────────────────────────
  const popover  = modal.querySelector('#annPopover');
  const closePopover = () => { popover.hidden = true; };

  popover.querySelector('.ann-popover__close').addEventListener('click', closePopover);

  modal.querySelector('.detail-modal__panel').addEventListener('click', (e) => {
    const badge = e.target.closest('.inline-ann-badge');
    if (!badge) { closePopover(); return; }
    e.stopPropagation();

    let ann;
    try { ann = JSON.parse(badge.dataset.ann); } catch { return; }
    const meta = ANNOTATION_META[ann.type] ?? { label: ann.type, title: ann.type };

    const badgeEl = popover.querySelector('#annPopoverBadge');
    badgeEl.textContent = meta.label;
    badgeEl.className   = `ann-popover__badge ${CRIT_CLASS[ann.criterion] ?? ''}`;

    popover.querySelector('#annPopoverType').textContent   = meta.title;
    popover.querySelector('#annPopoverAnchor').textContent = ann.anchor ? `"${ann.anchor}"` : '';
    popover.querySelector('#annPopoverNote').textContent   = ann.note ?? '';

    // Position popover near badge
    const rect    = badge.getBoundingClientRect();
    const modalEl = modal.querySelector('.detail-modal__panel');
    const mRect   = modalEl.getBoundingClientRect();

    popover.hidden = false;
    // Place below the badge, clamped within modal
    const top  = rect.bottom - mRect.top + 6;
    const left = Math.max(0, Math.min(rect.left - mRect.left, mRect.width - 280));
    popover.style.top  = `${top}px`;
    popover.style.left = `${left}px`;
  });
}

/** Open the detail modal and populate it with current notes + annotated essay. */
function showDetailModal() {
  initDetailView();

  const notes     = (() => {
    try { return JSON.parse(localStorage.getItem(NOTES_CACHE_KEY) ?? '{}').notes ?? null; } catch { return null; }
  })();
  const anns      = (() => {
    try { return JSON.parse(localStorage.getItem(ANNOTATIONS_CACHE_KEY) ?? '[]'); } catch { return []; }
  })();
  const essayText = localStorage.getItem(KEY_STUDENT) ?? '';

  // ── Notes panel ────────────────────────────────────────────────────────────
  const notesEl = document.getElementById('detailNotes');
  if (notesEl && notes) {
    const simpleRows = [
      ['Thesis',       notes.thesis?.trim() || null],
      ['Reader state', notes.readerState],
      ['Concerns',     Array.isArray(notes.concerns) ? notes.concerns.map((c) => `• ${c}`).join('\n') : notes.concerns],
    ];
    const reasoningHtml = renderReasoningHtml(notes.reasoning);
    const f = notes.feeling ?? {};
    const feelingHtml = ['A', 'B', 'C', 'D']
      .filter(k => f[k]?.trim())
      .map(k => `<div class="rp-feeling-row"><span class="rp-feeling-crit rp-feeling-crit--${k.toLowerCase()}">${k}</span><span class="rp-feeling-text">${escapeHtml(f[k])}</span></div>`)
      .join('');
    notesEl.innerHTML =
      simpleRows
        .filter(([, v]) => v)
        .map(([label, value]) => `
          <div class="detail-note-row">
            <p class="detail-note-label">${escapeHtml(label)}</p>
            <p class="detail-note-value">${escapeHtml(String(value))}</p>
          </div>`)
        .join('') +
      (reasoningHtml
        ? `<div class="detail-note-row">
             <p class="detail-note-label">Reasoning</p>
             ${reasoningHtml}
           </div>`
        : '') +
      (feelingHtml
        ? `<div class="detail-note-row">
             <p class="detail-note-label">Current impression</p>
             <div class="rp-feeling-list">${feelingHtml}</div>
           </div>`
        : '');

    // ── Holistic impression column ──────────────────────────────────────────
    const overallEl = document.getElementById('detailOverall');
    if (overallEl) {
      const oi = notes.overallImpression ?? {};
      const rows = ['A', 'B', 'C', 'D']
        .filter(k => oi[k]?.band && oi[k].band !== 'unknown')
        .map(k => {
          const { band, position, confidence, note, shift } = oi[k];
          const confLabel = confidence === 'unknown' ? '' : confidence;
          return `<div class="rp-overall-crit-block">
            <div class="rp-overall-crit-header">
              <span class="rp-feeling-crit rp-feeling-crit--${k.toLowerCase()}">${k}</span>
              <span class="rp-overall-band rp-overall-band--${band}">${band}</span>
              ${renderBandPositionBar(band, position)}
              ${renderHolisticShiftChip(shift, band)}
              ${confLabel ? `<span class="rp-overall-conf">${confLabel} confidence</span>` : ''}
            </div>
            ${note ? `<p class="rp-overall-crit-note">${escapeHtml(note)}</p>` : ''}
          </div>`;
        }).join('');
      overallEl.innerHTML = rows || '<p class="detail-empty">No holistic impression yet.</p>';
    }
  } else if (notesEl) {
    notesEl.textContent = 'No reading notes available yet. Run the analysis first.';
  }

  // ── Annotated essay panel ──────────────────────────────────────────────────
  const essayEl = document.getElementById('detailEssay');
  if (essayEl) {
    essayEl.innerHTML = buildAnnotatedHtml(essayText, anns);
  }

  document.getElementById('detailModal').hidden = false;
}

/** Show or hide the "View details" button (now always present in HTML). */
function setViewDetailsBtnVisible(visible) {
  const btn = document.getElementById('viewDetailsBtn');
  if (btn) btn.hidden = !visible;
}

/** No-op kept so existing call sites don't break; detail is now in the modal. */
function renderAnnotationsPanel() { /* annotations are shown in the detail modal */ }

function renderClassification(result) {
  const labelWrap = $('paragraphFormatLabelWrap');
  const label     = $('paragraphFormatLabel');
  const rationale = $('paragraphFormatRationale');
  if (!labelWrap || !label) return;
  label.textContent = result.type === 'essay'
    ? `Essay detected — ${result.paragraphs?.length ?? '?'} body paragraph(s)`
    : 'Single analytical paragraph detected';
  if (rationale) { rationale.textContent = result.rationale ?? ''; rationale.hidden = false; }
  labelWrap.hidden = false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRITERION RUN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

const SCORE_KEY_MAP = { A: KEY_SCORE_A, B: KEY_SCORE_B, C: KEY_SCORE_C, D: KEY_SCORE_D };
const SPINNER_IDS  = {
  A: 'criterionATileSpinner', B: 'criterionBTileSpinner',
  C: 'criterionCTileSpinner', D: 'criterionDTileSpinner',
};
const RUN_BTN_IDS  = {
  A: 'criterionATileRun', B: 'criterionBTileRun',
  C: 'criterionCTileRun', D: 'criterionDTileRun',
};

function setRunBtnBusy(busy) {
  const btn     = $('runAnalysisBtn');
  const spinner = $('runAnalysisSpinner');
  const label   = $('runAnalysisBtnLabel');
  if (btn)     btn.disabled      = busy;
  if (spinner) spinner.hidden    = !busy;
  if (label)   label.textContent = busy ? 'Reading…' : 'Run analysis';
}

/**
 * Lock / unlock the source and student textareas. Locked from the moment the
 * user hits "Run analysis" until they hit "Clear all" — this guarantees the
 * text the model read is the text that stays on screen (and matches the
 * cached fingerprint, so resumes can't be corrupted by accidental edits).
 */
function setInputsLocked(locked) {
  const sourceEl  = $('sourceText');
  const studentEl = $('studentParagraph');
  const panel     = sourceEl?.closest('.input-panel') ?? studentEl?.closest('.input-panel');
  if (sourceEl)  sourceEl.readOnly  = !!locked;
  if (studentEl) studentEl.readOnly = !!locked;
  if (panel) panel.classList.toggle('input-panel--classified-locked', !!locked);
}

const SCORE_LOCKED_KEY = 'ib-grader-score-locked';

function setScoreBtnVisible(visible) {
  const btn = $('scoreBtn');
  if (!btn) return;
  btn.hidden = !visible;
  if (!visible) return;
  // HTML starts with disabled — must enable when showing (unless already scored & locked).
  if (localStorage.getItem(SCORE_LOCKED_KEY)) {
    btn.disabled = true;
    btn.classList.add('btn--locked');
    const label = $('scoreBtnLabel');
    if (label) label.textContent = 'Scored ✓';
  } else {
    btn.disabled = false;
    btn.classList.remove('btn--locked');
    const label = $('scoreBtnLabel');
    const spinner = $('scoreBtnSpinner');
    const busy = spinner && !spinner.hidden;
    if (label && !busy) label.textContent = 'Score A–D';
  }
}

function setScoreBtnBusy(busy) {
  const btn     = $('scoreBtn');
  const label   = $('scoreBtnLabel');
  const spinner = $('scoreBtnSpinner');
  if (btn)     btn.disabled = busy;
  if (label)   label.textContent = busy ? 'Scoring…' : 'Score A–D';
  if (spinner) spinner.hidden = !busy;
}

function lockScoreBtn() {
  const btn     = $('scoreBtn');
  const label   = $('scoreBtnLabel');
  const spinner = $('scoreBtnSpinner');
  if (spinner) spinner.hidden = true;
  if (btn)   { btn.disabled = true; btn.classList.add('btn--locked'); }
  if (label) label.textContent = 'Scored ✓';
  localStorage.setItem(SCORE_LOCKED_KEY, '1');
}

/** Score all four criteria in one API call, then populate tiles and lock. */
async function handleScore() {
  clearError();
  const notes = (() => {
    try { return JSON.parse(localStorage.getItem(NOTES_CACHE_KEY) ?? '{}').notes ?? null; } catch { return null; }
  })();
  const annotations = (() => {
    try { return JSON.parse(localStorage.getItem(ANNOTATIONS_CACHE_KEY) ?? '[]'); } catch { return []; }
  })();
  if (!notes) return showError('No reading notes found — run the analysis first.');

  // Reconstruct chunks just for word-count estimate
  const studentText = localStorage.getItem(KEY_STUDENT) ?? '';
  const chunks = loadFixedChunksForStudentText(studentText);

  setScoreBtnBusy(true);
  showProgress('Scoring A–D…', null);

  try {
    const result = await scoreAllCriteria(notes, annotations, chunks);

    for (const crit of ['A', 'B', 'C', 'D']) {
      const detail = result[crit];
      if (!detail) continue;
      const score = Math.max(0, Math.min(5, Math.round(detail.score)));
      saveScore(SCORE_KEY_MAP[crit], score);
      saveScoreDetail(crit, detail);
      setTileScore(crit, score);
    }
    clearCriterionTileDetails();

    showProgress('Scored', 100);
    setTimeout(hideProgress, 800);
    setScoreBtnBusy(false);
    lockScoreBtn();
    renderOverallFromScores();
  } catch (err) {
    showError(`Scoring failed: ${err.message}`);
    hideProgress();
    setScoreBtnBusy(false);
  }
}

/** Reading-only pass. Drives the real-time reading panel. */
let _readingInFlight = false;
async function handleRunAll() {
  clearError();
  if (_readingInFlight) {
    showError('A reading pass is already running — please wait for it to finish.');
    return;
  }
  const sourceText  = $('sourceText')?.value?.trim() ?? '';
  const studentText = $('studentParagraph')?.value?.trim() ?? '';

  if (!sourceText)  return showError('Please paste the source text first.');
  if (!studentText) return showError('Please paste the student response first.');

  _readingInFlight = true;
  setRunBtnBusy(true);
  // Lock inputs until "Clear all" — the text the model read must match what
  // stays on screen (and what the fingerprint cache expects on resume).
  setInputsLocked(true);

  // ── Cache hit (complete) — render final state immediately ────────────────
  if (isReadingCacheComplete(studentText)) {
    try {
      const { notes, chunks, allAnnotations, paraStarts } = await getReadingNotes(sourceText, studentText);
      const paraStartSet = Array.isArray(paraStarts) && paraStarts.length
        ? new Set(paraStarts.map(n => Number(n)).filter(n => Number.isFinite(n)))
        : splitIntoChunks(studentText).paraStartSet;
      showProgress('Loaded from cache', 100);
      finalizeReadingPanel(chunks, paraStartSet, allAnnotations, notes);
      setViewDetailsBtnVisible(true);
      setScoreBtnVisible(true);
      setTimeout(hideProgress, 800);
    } catch (err) {
      showError(`Failed to load cache: ${err.message}`);
      hideProgress();
    }
    setRunBtnBusy(false);
    _readingInFlight = false;
    return;
  }

  // ── Fresh read — live panel updates ─────────────────────────────────────
  showProgress(isReadingCacheForText(studentText) ? 'Resuming…' : 'Starting…', null);

  // Pre-split to know chunk count for progress % and to init the reading panel.
  const cachedForUi = loadReadingCache();
  const fixedFp = getTextFingerprint(studentText);
  const { chunks: preChunks, paraStartSet } = (cachedForUi?.fingerprint === fixedFp && Array.isArray(cachedForUi.chunks) && cachedForUi.chunks.length)
    ? {
        chunks: cachedForUi.chunks,
        paraStartSet: Array.isArray(cachedForUi.paraStarts) && cachedForUi.paraStarts.length
          ? new Set(cachedForUi.paraStarts.map(n => Number(n)).filter(n => Number.isFinite(n)))
          : splitIntoChunks(studentText).paraStartSet,
      }
    : splitIntoChunks(studentText);
  initReadingPanel(preChunks, paraStartSet);

  // If we're resuming mid-essay, repaint previously-read chunks as "done"
  // with their cached annotations, and show the last-saved notes immediately.
  try {
    const resumeNext = Number(cachedForUi?.nextChunkIndex ?? 0);
    if (Number.isFinite(resumeNext) && resumeNext > 0) {
      const priorAnns = (() => {
        try { return JSON.parse(localStorage.getItem(ANNOTATIONS_CACHE_KEY) ?? '[]'); } catch { return []; }
      })();
      const byChunk = new Map();
      for (const a of priorAnns) {
        const idx = Number(a?.chunkIndex);
        if (!Number.isFinite(idx)) continue;
        if (!byChunk.has(idx)) byChunk.set(idx, []);
        byChunk.get(idx).push(a);
      }
      for (let i = 0; i < Math.min(resumeNext, preChunks.length); i++) {
        markChunkDone(i, byChunk.get(i) ?? []);
      }
      if (cachedForUi?.notes) updateReadingNotes(cachedForUi.notes);
    }
  } catch { /* non-fatal */ }

  let totalChunks = preChunks.length;

  try {
    const { notes, chunks, allAnnotations } = await getReadingNotes(
      sourceText,
      studentText,
      {
        onBefore(chunkIdx, total, currentNotes) {
          totalChunks = total;
          const pct = (chunkIdx / total) * 100;
          showProgress(`Reading chunk ${chunkIdx + 1} of ${total}…`, pct);
          markChunkCurrent(chunkIdx);
          // Show notes from previous chunk immediately as context while AI reads
          if (chunkIdx > 0) updateReadingNotes(currentNotes);
        },
        onHolisticBefore(chunkIdx, total) {
          const pct = ((chunkIdx + 1) / total) * 100;
          showProgress(`Holistic impression (after chunk ${chunkIdx + 1} of ${total})…`, pct);
        },
        onHolisticAfter(_chunkIdx, _total, updatedNotes) {
          updateReadingNotes(updatedNotes);
        },
        onAfter(chunkIdx, total, updatedNotes, chunkAnnotations) {
          markChunkDone(chunkIdx, chunkAnnotations);
          updateReadingNotes(updatedNotes);
        },
      },
    );

    showProgress('Reading complete', 100);
    setViewDetailsBtnVisible(true);
    setScoreBtnVisible(true);
    setTimeout(hideProgress, 1000);
  } catch (err) {
    // Progress is checkpointed after each successful chunk; rerun will resume.
    showError(`Reading pass failed (progress saved): ${err.message}`);
    hideProgress();
  } finally {
    setRunBtnBusy(false);
    _readingInFlight = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════════

const MODEL_TIER_COPY = {
  premium:    { lead: 'Premium tier',    rest: ' — Strong commercial models on OpenRouter (higher per-token cost than Accessible / Free).' },
  accessible: { lead: 'Accessible tier', rest: ' — Mid-cost options with solid capability.' },
  free:       { lead: 'Free routing',    rest: ' — Uses OpenRouter :free endpoints (shared quotas, variable latency).' },
};

async function updateModelCostPanel(modelId) {
  const callsEl = $('modelCostCalls');
  const inEl    = $('modelCostIn');
  const outEl   = $('modelCostOut');
  const usdEl   = $('modelCostUsd');
  const rateEl  = $('modelCostRates');
  const errEl   = $('modelCostError');
  const methEl  = $('modelCostMethodology');
  const p = TYPICAL_RUN_PROFILE;
  if (callsEl) {
    callsEl.textContent = `${p.totalCalls} total (${p.readCalls} chunk reads + ${p.holistics} holistic + ${p.scoreCalls} score)`;
  }
  if (inEl) {
    inEl.textContent = `~${p.inputTok.toLocaleString()} prompt tok (≈${p.inputCharsTotal.toLocaleString()} chars ÷4)`;
  }
  if (outEl) {
    outEl.textContent = `~${p.outputTok.toLocaleString()} completion tok (≈${p.outputCharsTotal.toLocaleString()} chars ÷3.5)`;
  }
  if (methEl) methEl.textContent = p.methodologyLabel ?? '';
  if (usdEl) usdEl.textContent = '…';
  if (rateEl) rateEl.textContent = '';
  if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

  try {
    const map = await fetchOpenRouterPricingMap();
    if (!map[modelId]) {
      if (usdEl) usdEl.textContent = '—';
      if (rateEl) {
        rateEl.textContent = `No pricing row for “${modelId}” on OpenRouter — check the slug at openrouter.ai/models.`;
      }
      return;
    }
    const pr = map[modelId] ?? {};
    const pin = parseOpenRouterUsdPerToken(pr.prompt);
    const pout = parseOpenRouterUsdPerToken(pr.completion);
    const cost = p.inputTok * pin + p.outputTok * pout;
    if (usdEl) usdEl.textContent = formatUsdEstimate(cost);
    if (rateEl) {
      const pm = pin * 1e6;
      const cm = pout * 1e6;
      rateEl.textContent = `OpenRouter list: $${pm.toFixed(4)}/M prompt · $${cm.toFixed(4)}/M completion`;
    }
  } catch (e) {
    if (usdEl) usdEl.textContent = '—';
    if (rateEl) rateEl.textContent = '';
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = `Could not load live rates: ${e?.message ?? e}. Cost left blank — see openrouter.ai/models.`;
    }
  }
}

function boot() {
  const apiKeyEl  = $('apiKey');
  const modelEl   = $('modelSelect');
  const tierBar   = $('modelTierBar');
  const sourceEl  = $('sourceText');
  const studentEl = $('studentParagraph');

  // Restore persisted inputs
  if (apiKeyEl)  apiKeyEl.value  = getApiKey();

  const knownIds = allKnownOpenRouterModelIds();
  let savedModel = getModel();
  const legacy = LEGACY_OPENROUTER_MODEL_ID[savedModel];
  if (legacy) {
    savedModel = legacy;
    setModel(savedModel);
  }
  if (!knownIds.has(savedModel)) {
    savedModel = DEFAULT_OPENROUTER_MODEL;
    setModel(savedModel);
  }

  let storedTier = localStorage.getItem(KEY_MODEL_TIER);
  if (storedTier === 'paid') {
    storedTier = 'premium';
    localStorage.setItem(KEY_MODEL_TIER, 'premium');
  }

  let tier = tierForModelId(savedModel) ?? storedTier ?? 'free';
  if (!MODEL_TIER_ORDER.includes(tier)) tier = 'free';
  localStorage.setItem(KEY_MODEL_TIER, tier);

  if (modelEl) {
    populateModelSelectForTier(modelEl, tier, savedModel);
  }
  setActiveTierButton(tierBar, tier);
  if (sourceEl)  sourceEl.value  = localStorage.getItem(KEY_SOURCE) ?? '';
  if (studentEl) studentEl.value = localStorage.getItem(KEY_STUDENT) ?? '';

  // If a reading pass exists (complete or partially checkpointed) for the
  // current student text, re-lock the inputs so their content keeps matching
  // the cached fingerprint. Unlocked only by "Clear all".
  try {
    const trimmedStudent = (studentEl?.value ?? '').trim();
    if (trimmedStudent && isReadingCacheForText(trimmedStudent)) {
      setInputsLocked(true);
    }
  } catch { /* non-fatal */ }

  // Restore saved scores; feedback is under the overall table, not on tiles
  for (const crit of ['A', 'B', 'C', 'D']) {
    const saved = loadScore(SCORE_KEY_MAP[crit]);
    if (saved !== null) setTileScore(crit, saved);
  }
  clearCriterionTileDetails();

  // Restore classification
  const savedClassify = localStorage.getItem(KEY_CLASSIFY);
  if (savedClassify) {
    try { renderClassification(JSON.parse(savedClassify)); } catch { /* */ }
  }

  // Restore overall result (computed from saved scores, no moderation needed)
  if (allScoresSaved()) renderOverallFromScores();

  // Restore View Details + Score buttons if a reading pass is cached (notes, not only annotations)
  if (hasReadingNotesCache()) {
    setViewDetailsBtnVisible(true);
    setScoreBtnVisible(true);
    if (localStorage.getItem(SCORE_LOCKED_KEY)) lockScoreBtn();
  }

  updateOverallPanel();
  initDetailView();

  // Char counters
  function wireCounter(taId, ccId) {
    const ta = $(taId), cc = $(ccId);
    if (!ta || !cc) return;
    const upd = () => { cc.textContent = `${ta.value.length.toLocaleString()} characters`; };
    ta.addEventListener('input', upd);
    upd();
  }
  wireCounter('sourceText', 'charCount');
  wireCounter('studentParagraph', 'paraCharCount');

  // Persist inputs
  apiKeyEl?.addEventListener('change', () => setApiKey(apiKeyEl.value));
  modelEl?.addEventListener('change',  () => {
    setModel(modelEl.value);
    updateModelNote();
    void updateModelCostPanel(modelEl.value);
  });
  sourceEl?.addEventListener('input',  () => localStorage.setItem(KEY_SOURCE, sourceEl.value));
  studentEl?.addEventListener('input', () => {
    localStorage.setItem(KEY_STUDENT, studentEl.value);
    // IMPORTANT: do NOT wipe the reading cache here.
    // The cache is keyed by a content fingerprint; if the essay changes in any
    // meaningful way, getReadingNotes() will detect the mismatch and start fresh.
    // Wiping on every keystroke would destroy in-progress resume state.
  });

  function currentUiTier() {
    const active = tierBar?.querySelector('.model-tier-btn--active');
    return active?.dataset?.tier ?? localStorage.getItem(KEY_MODEL_TIER) ?? 'free';
  }

  function updateModelNote() {
    const noteEl = $('modelTierNote');
    if (!noteEl) return;
    const tier = currentUiTier();
    noteEl.className = `model-tier-note model-tier-note--${tier}`;
    const copy = MODEL_TIER_COPY[tier];
    const leadEl = noteEl.querySelector('.model-tier-note__lead');
    const restEl = noteEl.querySelector('.model-tier-note__rest');
    if (copy && leadEl && restEl) {
      leadEl.textContent = copy.lead;
      restEl.textContent = copy.rest;
    } else if (leadEl && restEl) {
      leadEl.textContent = '';
      restEl.textContent = '';
    }
  }

  tierBar?.addEventListener('click', (e) => {
    const btn = e.target.closest('.model-tier-btn');
    if (!btn || !tierBar.contains(btn)) return;
    const newTier = btn.dataset.tier;
    if (!newTier || !MODEL_TIER_ORDER.includes(newTier)) return;
    localStorage.setItem(KEY_MODEL_TIER, newTier);
    setActiveTierButton(tierBar, newTier);
    const keep = tierForModelId(getModel()) === newTier ? getModel() : null;
    populateModelSelectForTier(modelEl, newTier, keep);
    updateModelNote();
    void updateModelCostPanel(modelEl?.value ?? getModel());
  });

  updateModelNote();
  void updateModelCostPanel(modelEl?.value ?? getModel());

  // Clear all
  $('clearBtn')?.addEventListener('click', () => {
    if (!confirm('Clear all inputs, scores, and classification?')) return;
    [KEY_SOURCE, KEY_STUDENT].forEach((k) => localStorage.removeItem(k));
    clearAllScores();
    if (sourceEl)  sourceEl.value  = '';
    if (studentEl) studentEl.value = '';
    setInputsLocked(false);

    for (const crit of ['A', 'B', 'C', 'D']) {
      const ids = TILE_IDS[crit];
      const numEl  = $(ids.scoreNum);
      const lineEl = $(ids.scoreLine);
      const capEl  = $(ids.caption);
      if (numEl)  numEl.textContent = '';
      if (lineEl) lineEl.hidden = true;
      if (capEl)  capEl.hidden = true;
      // Remove detail card
      const tileId = `criterionATile`.replace('A', crit);
      $(tileId)?.querySelector('.criterion-tile__detail-card')?.remove();
    }

    const overallResult = $('ibOverallResult');
    if (overallResult) { overallResult.innerHTML = ''; overallResult.hidden = true; }
    const lockedMsg  = $('ibOverallLockedMsg');
    const revealWrap = $('ibOverallRevealWrap');
    if (lockedMsg)  lockedMsg.hidden = false;
    if (revealWrap) revealWrap.hidden = true;

    setViewDetailsBtnVisible(false);
    setScoreBtnVisible(false);
    const scoreBtn = $('scoreBtn');
    if (scoreBtn) { scoreBtn.disabled = false; scoreBtn.classList.remove('btn--locked'); }
    const scoreBtnLabel = $('scoreBtnLabel');
    if (scoreBtnLabel) scoreBtnLabel.textContent = 'Score A–D';

    updateOverallPanel();
    clearError();
    hideStatus();
  });

  // Single run button
  $('runAnalysisBtn')?.addEventListener('click', handleRunAll);

  // Score button (shown after reading complete)
  $('scoreBtn')?.addEventListener('click', handleScore);

  // View details button (in HTML; shown after first reading pass)
  $('viewDetailsBtn')?.addEventListener('click', showDetailModal);

  const tos = $('termsOfService');
  if (tos?.tagName === 'DETAILS') {
    const openTos = () => {
      tos.open = true;
    };
    if (window.location.hash === '#termsOfService') {
      openTos();
    }
    window.addEventListener('hashchange', () => {
      if (window.location.hash === '#termsOfService') openTos();
    });
  }
}

boot();
