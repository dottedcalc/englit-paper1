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
const EMPTY_BAND = { band: 'unknown', position: 0, confidence: 'unknown', note: '' };
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

// ── Response schemas (Gemini enforces these server-side; Claude sees them via prompt) ──

const ANNOTATION_TYPES = [
  'A_STAR','A_CHECK','A_CROSS','A_QUESTION','A_CURVY','A_EXCLAIM',
  'B_STAR','B_CHECK','B_D','B_CROSS','B_QUESTION','B_NO_EVAL','B_UNSUP','B_BR',
  'C_CHECK','C_CROSS','C_QUESTION','C_SIGNPOST','C_S','C_DRIFT',
  'D_SP','D_AWK','D_WC','D_GRA','D_CHECK','D_V','D_CROSS','D_R',
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
        overallImpression: {
          type: 'OBJECT',
          properties: {
            A: { type: 'OBJECT', properties: { band: { type: 'STRING', enum: ['high','mid','low','unknown'] }, position: { type: 'INTEGER' }, confidence: { type: 'STRING', enum: ['high','medium','low','unknown'] }, note: { type: 'STRING' } }, required: ['band','position','confidence','note'] },
            B: { type: 'OBJECT', properties: { band: { type: 'STRING', enum: ['high','mid','low','unknown'] }, position: { type: 'INTEGER' }, confidence: { type: 'STRING', enum: ['high','medium','low','unknown'] }, note: { type: 'STRING' } }, required: ['band','position','confidence','note'] },
            C: { type: 'OBJECT', properties: { band: { type: 'STRING', enum: ['high','mid','low','unknown'] }, position: { type: 'INTEGER' }, confidence: { type: 'STRING', enum: ['high','medium','low','unknown'] }, note: { type: 'STRING' } }, required: ['band','position','confidence','note'] },
            D: { type: 'OBJECT', properties: { band: { type: 'STRING', enum: ['high','mid','low','unknown'] }, position: { type: 'INTEGER' }, confidence: { type: 'STRING', enum: ['high','medium','low','unknown'] }, note: { type: 'STRING' } }, required: ['band','position','confidence','note'] },
          },
          required: ['A', 'B', 'C', 'D'],
        },
      },
      required: ['thesis', 'reasoning', 'readerState', 'concerns', 'feeling', 'overallImpression'],
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
 * Read one chunk. Returns { notes, annotations }.
 * Notes are passed forward to the next chunk. Annotations are not.
 * @param {string}  sourceText
 * @param {string}  currentChunk
 * @param {string|null} prevChunk      — 1 chunk before current
 * @param {string|null} prev2Chunk     — 2 chunks before current
 * @param {string|null} nextChunk      — 1 chunk after current (lookahead, do not annotate)
 * @param {object}  notes
 * @param {number}  chunkIndex
 * @param {number}  totalChunks
 * @param {string}  paraLabel          — e.g. "Introduction", "Body paragraph 2", "Conclusion"
 */
async function readOneChunk(sourceText, currentChunk, prevChunk, prev2Chunk, nextChunk, notes, chunkIndex, totalChunks, paraLabel) {
  const system = `You are an IB English A Paper 1 examiner reading a complete student essay for the first time.

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

• overallImpression — HOLISTIC cumulative estimate of the essay's likely final band per criterion. Four fields A, B, C, D, each with:
  - "band": current best estimate — "high", "mid", "low", or "unknown" if too early to say
  - "position": relative position within the chosen high/mid/low band, represented as a 4-square bar:
      1 = low side of the band
      2 = mid side (slightly lower)
      3 = mid side (slightly higher)
      4 = high side of the band
    If band is "unknown", set position to 0.
  - "confidence": how certain you are that this band estimate will hold — "high", "medium", "low", or "unknown" if too early to say. Confidence depends on TWO factors: (1) how far through the essay you are, and (2) how consistent the writing has been. It can go UP (pattern is clear and stable) or DOWN (the essay is shifting, contradicting earlier quality, or showing unexpected inconsistency). High confidence early requires extreme consistency; low confidence late is valid if the essay is volatile.
  - "note": a nuanced summary (see below)

  HIGH / MID / LOW DEFINITIONS (use these when setting "band"):
  Criterion A — Knowledge and Understanding
  - Key question: How well does the candidate demonstrate understanding of the text and draw reasoned conclusions from its implications? How well are ideas supported by references to the text?
  - High: thorough AND perceptive understanding; convincing and insightful interpretation of larger implications and subtleties; references well-chosen and effectively support ideas.
  - Mid: understanding of the literal meaning; satisfactory interpretation of SOME implications; references generally relevant and mostly support ideas.
  - Low: some understanding of the LITERAL meaning; references at times appropriate but often surface-level or infrequent; sometimes misinterpretation.

  Criterion B — Analysis and Interpretation
  - Key question: To what extent does the candidate analyse and evaluate how textual features and/or authorial choices shape meaning?
  - High: insightful and convincing analysis of textual features and/or authorial choices; VERY GOOD evaluation of how such features shape meaning.
  - Mid: generally appropriate analysis of textual features and/or authorial choices; evaluation is sometimes present.
  - Low: some appropriate analysis but is RELIANT ON DESCRIPTION; evaluation of how features shape meaning is largely absent.

  Criterion C — Focus and Organisation
  - Key question: How well organised, coherent and focused is the presentation of ideas?
  - High: presentation is effectively organised and coherent; analysis is WELL FOCUSED throughout.
  - Mid: presentation is adequately organised in a generally coherent manner; SOME focus in the analysis.
  - Low: ONLY SOME organisation apparent; LITTLE focus in the analysis.

  Criterion D — Language
  - Key question: How clear, varied and accurate is the language? How appropriate is register and style?
  - High: vocab very clear, effective, carefully chosen and PRECISE; HIGH degree of accuracy in grammar, vocabulary and construction; register and style effective and appropriate.
  - Mid: vocab clear and carefully chosen; ADEQUATE accuracy despite some lapses; register mostly appropriate; still academic and mostly accurate.
  - Low: vocab sometimes clear and carefully chosen; FAIRLY accurate but errors and inconsistencies apparent; register to SOME EXTENT appropriate; becomes confusing and distracting at times.

  RULES FOR overallImpression:
  1. Does NOT count toward the 350-word limit — write as fully as the evidence warrants.
  2. Only UPDATE a criterion's band/note when you have SUSTAINED evidence across multiple chunks — a single impressive or weak moment is not enough. Hold your previous estimate unless a consistent pattern confirms a change.
  3. The "note" must be BRIEF but CUMULATIVE: keep it short (phrase-heavy) while integrating the full essay-so-far (intro/body 1/body 2/... as available). Do not erase prior conditions; instead ADD to them, or compress/summarise earlier points as the picture stabilises. A reader should be able to understand the prior pattern from the note alone when moving into the next chunk.
     The note must always cover BOTH sides — what is working AND what is not — with specific evidence for each. Use short phrases where appropriate (full sentences not required). The note must convey:
     - GOOD SIDE: which specific sections/moments showed strength, with a brief phrase indicating evidence (e.g. "intro + body 1: perceptive unpacking of imagery")
     - BAD SIDE: which specific sections/moments fell short, with a phrase indicating the problem (e.g. "body 2–3: device-labelling only, no mechanism")
     - PREVALENCE: roughly how much of the essay so far is each side (e.g. "~2/3 strong, ~1/3 surface-level" or "mostly mid with one high moment in body 1")
     - POSITION WITHIN BAND: where in the band the essay sits (e.g. "solid mid, upper edge" or "low-mid, not yet convincing")
     - PROPORTIONAL COVERAGE: devote space roughly in proportion to how much of the essay you have actually read. Do not oversqueeze earlier paragraphs and overemphasise later parts (especially the conclusion) just because they are recent; keep the note balanced across the essay-so-far.
     - PARAGRAPH DEPTH: whenever the note names a paragraph or section (introduction, body paragraph N, conclusion), do not collapse that paragraph to a single word, bare tag, or acronym with no substance — see rule 8.
  4. WORD COUNT by essay position (you are at ${Math.round((chunkIndex + 1) / totalChunks * 100)}% through):
     - Opening (0–15%): use "unknown" for band — too little seen; leave note as "".
     - Before halfway (15–50%): ~35 words — early signal, both sides if visible.
     - After halfway (50–80%): ~70 words — clear picture of good/bad prevalence.
     - Near end (80–100%): ~100-120 words — full accounting with specific section references.
     These targets are flexible: if rule 8 (per-paragraph minimum) requires more words, exceed the band target rather than shrinking named paragraphs to stubs.
  5. Always reference SPECIFIC sections (introduction, body paragraph 1, body paragraph 2, conclusion) — no vague impressions.
  6. Integrate ALL prior evidence using the majority pattern across the essay so far to determine each overallImpression — not one local passage in isolation. You must NOT rapidly shift band from a single chunk (e.g. jumping from mid-band position 1 straight to high-band position 4 in one update). You CAN and SHOULD adjust position (the 1–4 "squares" within the current band) gradually: typically add or subtract at most 1–2 position steps per chunk when evidence warrants, and only when the current chunk corroborates what earlier chunks already suggested — not from a purely local spike or dip. When quality is sustained across multiple chunks/paragraphs and the majority picture clearly shifts, you may then move to a higher or lower band; until then, refine placement mainly within the band (and use confidence to reflect uncertainty).
  7. CRITERION SEPARATION — Treat A, B, C, and D as four independent marks. Each overallImpression field (A, B, C, D) must judge only that criterion using its own rubric above. Do not conflate criteria: e.g. do not raise A or B because language is strong (that belongs in D only), do not lower D because argument is weak (address that in A/B/C as appropriate), and do not merge organisation issues into the language note or vice versa. Evidence for one criterion may appear in the same paragraph as another, but the band, position, confidence, and note for each letter must stay faithful to that letter alone.
  8. PER-PARAGRAPH MINIMUM IN EACH NOTE — For every essay paragraph or section you explicitly reference in an overallImpression note (per criterion), include at least roughly 10–15 words of substantive, criterion-relevant description for that paragraph. Summarising is fine, but not one-word or label-only summaries (e.g. "body 2: weak" alone is invalid). Main body paragraphs especially need this floor even when you compress earlier material. Introduction and conclusion may use the same floor when you name them; if a section is not named, you need not allocate words to it. If many paragraphs are in scope, the note may grow beyond the rule 4 band targets — always prefer meeting this minimum over staying under a soft word target.

ESSAY STRUCTURE AWARENESS:
Essays will have an introduction, body paragraphs, and a conclusion. Treat these differently in your reasoning:
- Introduction: the thesis (if stated) lives here; note the framing and scope but do not treat introductory sentences as analytical moves. Set the thesis field if clearly stated.
- Body paragraphs: the core analytical work — each paragraph typically advances a claim, applies a technique, and develops its significance. This is where reasoning nodes should be richest.
- Conclusion: typically restates or synthesises rather than adding new analysis. Note whether it adds genuine insight or merely repeats. Do not create new top-level reasoning nodes for points already established in the body; add a single conclusion node only if the student does something analytically new or if there is a notable quality observation.

NOTES RULES:
1. NO quotes or verbatim text from the student essay in notes. Paraphrase everything.
2. Notes describe analytical moves and reasoning only — not examples or evidence.
3. Start very short (~20–30 words for chunk 1). Grow only when genuinely new information arrives.
4. HARD LIMIT: total words across thesis + reasoning + readerState + concerns combined must NEVER exceed 350. The "feeling" field does NOT count toward this limit — write it as fully as needed. If near the 350-word limit, compress the other fields by removing filler words and shortening earlier entries. Never reorder the reasoning sequence.

════════════════════════════════════════════════
PART 2 — PLACE ANNOTATIONS
════════════════════════════════════════════════

After updating your notes, place 0–4 annotations on the CURRENT chunk or the PREVIOUS chunk (only if directly triggered by what you just read in the current chunk).

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
A_QUESTION ?  Reasoning is tenuous or unconvincing; cannot see the relationship between evidence and claim
A_CURVY    ~  Not the best quote/evidence choice to support this point
A_EXCLAIM  !  Understands local meaning and implications but not the broader meaning of the text

── Criterion B (Stylistic Features) ──
B_STAR     ★  Devices related to each other and to the text's larger argument — not analysed in isolation
B_CHECK    ✓  Identifies not just WHAT devices are present but WHY effective and HOW they construct meaning
B_D        D  Largely descriptive: notes what is in the text rather than analysing how it functions
B_CROSS    ✗  Device labels are incorrect, conflated, or applied to the wrong element
B_QUESTION ?  Connection between device and meaning is tenuous, unsupported, or simply asserted
B_NO_EVAL  ∅  Evaluation of how features shape meaning is absent — tells effect but not how achieved
B_UNSUP    ⚠  Relies on personal/historical/trivia associations not within the text
B_BR       BR  Fails to connect the device to its effect on the audience/reader — for drama: no effect on stage or spectator; for poetry/prose: no effect on the reader

── Criterion C (Focus & Organisation) ──
C_CHECK    ✓  Clearly focused; connects to topic sentence or prior argument
C_CROSS    ✗  Contradiction with a prior claim or the thesis
C_QUESTION ?  Focus is breaking down; stream-of-consciousness; main point is hard to follow. When evaluating C, consult your current reasoning notes — if the argument map shows the essay has already covered this territory or is wandering without clear direction, this annotation is appropriate.
C_SIGNPOST →  Logical/argumentative transitions ("building on this", "by contrast") rather than just sequential ("also", "in addition")
C_S        S  Analysis scattered — multiple unrelated points, no clear priority or connecting logic. Cross-check your reasoning map: if it shows several disconnected nodes in the same paragraph, C_S is likely appropriate.
C_DRIFT    ≋  Drifts from thesis: this content or ordering no longer follows the thesis as stated in the introduction — the essay has wandered away from its own stated argument. Cross-check your reasoning map and the thesis field to judge whether this paragraph is still serving the essay's stated central argument.

── Criterion D (Language) ──
D_SP       SP   Spelling error
D_AWK      AWK  Awkward phrasing — feels off
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

"notes" must contain: thesis, reasoning, readerState, concerns, feeling (A/B/C/D strings), overallImpression (A/B/C/D objects each with band/position/confidence/note).

Each annotation: target ("current"|"prev"), anchor (3–8 verbatim words), criterion ("A"|"B"|"C"|"D"), type (one of the annotation codes), note (brief examiner note).

No markdown. No extra fields. No commentary outside the JSON.`;

  const user = `SOURCE PASSAGE (for reference):
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

  // Wrap API call + JSON parse in retry-with-backoff so a single transient
  // glitch (5xx, timeout, truncated JSON, rate-limit) doesn't abort the pass.
  const parsed = await withRetry(async (attempt) => {
    const raw = await callApi(system, user, READ_CHUNK_SCHEMA);
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

/**
 * Run the full sequential reading pass over the student's essay.
 * Calls the API once per chunk. Calls onProgress(chunkIndex, totalChunks) after each chunk.
 *
 * @param {string} sourceText
 * @param {string} studentText
 * @param {function} onProgress  - (current: number, total: number) => void
 * @returns {Promise<{ notes: object, chunks: string[] }>}
 */
/**
 * @param {string} sourceText
 * @param {string} studentText
 * @param {{ onBefore?: Function, onAfter?: Function }} [callbacks]
 *   onBefore(chunkIdx, totalChunks, currentNotes)       — called just before reading chunk i
 *   onAfter(chunkIdx, totalChunks, updatedNotes, chunkAnnotations, allAnnotations) — called after
 */
async function readEssaySequentiallyFromChunks(sourceText, chunks, paraStartSet, startIndex, startNotes, existingAnnotations, callbacks = {}) {
  const { onBefore, onAfter } = callbacks;
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
    notes = result.notes;
    const chunkAnns = result.annotations ?? [];
    allAnnotations.push(...chunkAnns);
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

/**
 * Score all four criteria in a single API call.
 * Uses reading notes, holistic impression, and annotation evidence.
 *
 * @param {object}   notes       - Final accumulated reading notes.
 * @param {object[]} annotations - All annotations from the reading pass.
 * @param {string[]} chunks      - Essay chunks (used for word-count estimate).
 * @returns {Promise<{ A, B, C, D }>}  Each value: { score, keyStrengths, keyWeaknesses, bandBoundary, justification }
 */
async function scoreAllCriteria(notes, annotations, chunks) {
  const approxWords = chunks.length * CHUNK_TARGET_WORDS;

  const focusBlock = ['A', 'B', 'C', 'D'].map(k => {
    const { name, focus } = CRITERION_DESCRIPTORS[k];
    return `━━ ${name} ━━\nFOCUS:\n${focus}`;
  }).join('\n\n');

  // Summarise annotations per criterion for the prompt
  const annByCrit = { A: [], B: [], C: [], D: [] };
  for (const a of annotations) {
    if (annByCrit[a.criterion]) annByCrit[a.criterion].push(`[${a.type}] "${a.anchor}" — ${a.note}`);
  }
  const annBlock = ['A', 'B', 'C', 'D']
    .map(k => `Criterion ${k}:\n${annByCrit[k].length ? annByCrit[k].join('\n') : '(none)'}`)
    .join('\n\n');

  const system = `You are a senior IB English A Paper 1 SL/HL examiner and moderator.

You have just finished a complete sequential reading of a student essay (~${approxWords} words). During reading you took progressive notes, applied examiner annotations at key moments, and formed a holistic overall impression per criterion. You are now awarding final marks 1–5 for each of the four criteria.

HIGH / MID / LOW DEFINITIONS (use these to map performance to a 1–5 score):
Criterion A — Knowledge and Understanding
- Key question: How well does the candidate demonstrate understanding of the text and draw reasoned conclusions from its implications? How well are ideas supported by references to the text?
- High: thorough AND perceptive understanding; convincing and insightful interpretation of larger implications and subtleties; references well-chosen and effectively support ideas.
- Mid: understanding of the literal meaning; satisfactory interpretation of SOME implications; references generally relevant and mostly support ideas.
- Low: some understanding of the LITERAL meaning; references at times appropriate but often surface-level or infrequent; sometimes misinterpretation.

Criterion B — Analysis and Interpretation
- Key question: To what extent does the candidate analyse and evaluate how textual features and/or authorial choices shape meaning?
- High: insightful and convincing analysis of textual features and/or authorial choices; VERY GOOD evaluation of how such features shape meaning.
- Mid: generally appropriate analysis of textual features and/or authorial choices; evaluation is sometimes present.
- Low: some appropriate analysis but is RELIANT ON DESCRIPTION; evaluation of how features shape meaning is largely absent.

Criterion C — Focus and Organisation
- Key question: How well organised, coherent and focused is the presentation of ideas?
- High: presentation is effectively organised and coherent; analysis is WELL FOCUSED throughout.
- Mid: presentation is adequately organised in a generally coherent manner; SOME focus in the analysis.
- Low: SOME organisation apparent; LITTLE focus in the analysis.

Criterion D — Language
- Key question: How clear, varied and accurate is the language? How appropriate is register and style?
- High: vocab very clear, effective, carefully chosen and PRECISE; HIGH degree of accuracy in grammar, vocabulary and construction; register and style effective and appropriate.
- Mid: vocab clear and carefully chosen; ADEQUATE accuracy despite some lapses; register mostly appropriate; still academic and mostly accurate.
- Low: vocab sometimes clear and carefully chosen; FAIRLY accurate but errors and inconsistencies apparent; register to SOME EXTENT appropriate; becomes confusing and highly distracting at times.

SCORING SCALE:
• 5 — Mostly high-band throughout: perceptive, convincing, well-supported.
• 4 — Roughly 2/3 mid-band, 1/3 high-band elements: generally competent with clear high-band moments but not sustained enough to award 5.
• 3 — Normal Mid-band: adequate but not consistently strong; weaknesses present but manageable.
• 2 — Normal Low-band: limited engagement; surface-level or mostly descriptive; some partial attempts.
• 1 — Very limited; lower end of the low band;
(Use 0 only if the criterion is entirely absent.)

${focusBlock}

WEIGHTING EVIDENCE — you have three evidence sources; weight them carefully:
1. HOLISTIC IMPRESSION (overallImpression field) — your sustained cumulative judgement after full reading; highest weight for band placement.
2. READING NOTES (reasoning, concerns, feeling) — the argument map and pattern observations; high weight for C and for A/B analytical quality.
3. ANNOTATIONS — fine-grained positive/negative markers at specific moments; use to confirm or adjust band boundary (e.g. many A? or BD annotations push toward lower band; many A★ or B★ push toward upper).

Do NOT average the evidence mechanically — weigh it as a senior moderator would: look for the dominant pattern, account for consistency, and use annotations to resolve boundary calls.

INDEPENDENT CRITERIA: Award A, B, C, and D separately. Do not conflate them when scoring — e.g. strong language must not inflate A or B; thin analysis must not be excused by good organisation; errors in D must not be used to mark down A–C unless they genuinely obscure meaning for that criterion. Use only evidence that belongs under each criterion's rubric for that criterion's score and justification.

IMPORTANT — overallImpression "position" SCALE (within-band level):
The reading-phase holistic impression includes per-criterion { band, position, confidence, note }.
Interpret "position" as relative placement WITHIN the chosen band, not a separate band:
- position 1 = low side of that band
- position 2 = mid (slightly lower)
- position 3 = mid (slightly higher)
- position 4 = high side of that band
Use position (and confidence) as a tie-breaker for boundary scores (e.g. mid-band position 4 often indicates a 4 rather than a 3, if evidence supports it).

For EACH criterion return:
• score: integer 1–5
• keyStrengths: 1–3 short bullet points — concrete strengths (annotation codes in brackets allowed, e.g. [C_SIGNPOST])
• keyWeaknesses: 1–3 short bullet points — concrete weaknesses (same)
• bandBoundary: one sentence — why this score and NOT the one above (or why 5 is fully earned)
• justification: 3–5 sentences — holistic examiner reasoning for this criterion; weight the evidence; avoid meta-phrases like "as noted in the reading notes" or "the overallImpression field"; write as professional IB feedback prose (this text is shown in the report below the marks table).`;

  const user = `HOLISTIC IMPRESSION (per criterion):
${JSON.stringify(notes.overallImpression ?? {}, null, 2)}

READING NOTES:
${JSON.stringify({ thesis: notes.thesis, reasoning: notes.reasoning, concerns: notes.concerns, feeling: notes.feeling }, null, 2)}

ANNOTATION EVIDENCE:
${annBlock}`;

  const raw = await callApi(system, user, SCORE_ALL_SCHEMA);
  return parseJson(raw);
}

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
 * @param {{ onBefore?: Function, onAfter?: Function }} [callbacks]  — forwarded to readEssaySequentially
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



// ═══════════════════════════════════════════════════════════════════════════════
// OVERALL IB MODERATION
// ═══════════════════════════════════════════════════════════════════════════════

async function runOverallModeration(scores) {
  const { A, B, C, D } = scores;

  const system = `You are a senior IB English A Paper 1 chief moderator.
You have received criterion marks from an AI examiner. Your job:
1. Check that the four criterion marks are internally consistent.
2. Apply any moderation if marks seem inconsistent with each other.
3. Calculate the total (A + B + C + D, out of 20).
4. Give a brief holistic comment (3–5 sentences) on what this score profile means.

Return JSON:
{
  "moderatedA": <integer 0–5>,
  "moderatedB": <integer 0–5>,
  "moderatedC": <integer 0–5>,
  "moderatedD": <integer 0–5>,
  "total": <integer 0–20>,
  "comment": "<3–5 sentence holistic assessment>"
}`;

  const user = `Criterion marks submitted:
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

/** Map raw total (0-20) to IB grade (1-7). */
function totalToIbGrade(total) {
  if (total >= 18) return 7;
  if (total >= 15) return 6;
  if (total >= 12) return 5;
  if (total >= 9)  return 4;
  if (total >= 6)  return 3;
  if (total >= 3)  return 2;
  return 1;
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
    <div class="ib-grade-badge-wrap">
      <span class="ib-grade-badge">IB Grade&nbsp;<strong>${ibGrade}</strong></span>
      <span class="ib-grade-total">${total}&thinsp;/&thinsp;20</span>
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
  A_QUESTION: { label: 'A?',   title: 'Criterion A — Tenuous or unconvincing reasoning; relationship between evidence and claim unclear' },
  A_CURVY:    { label: 'A~',   title: 'Criterion A — Not the best evidence choice to support this point' },
  A_EXCLAIM:  { label: 'A!',   title: 'Criterion A — Understands local meaning but not the broader meaning of the text' },
  B_STAR:     { label: 'B★',   title: 'Criterion B — Devices related to each other and the text\'s larger argument; not in isolation' },
  B_CHECK:    { label: 'B✓',   title: 'Criterion B — Identifies WHAT, WHY, and HOW: device, effectiveness, and meaning' },
  B_D:        { label: 'BD',   title: 'Criterion B — Descriptive: notes what is in the text rather than how it functions' },
  B_CROSS:    { label: 'B✗',   title: 'Criterion B — Device label incorrect, conflated, or applied to wrong element' },
  B_QUESTION: { label: 'B?',   title: 'Criterion B — Connection between device and meaning is tenuous or simply asserted' },
  B_NO_EVAL:  { label: 'B∅',   title: 'Criterion B — Evaluation absent: tells effect but not how it is achieved' },
  B_UNSUP:    { label: 'B⚠',   title: 'Criterion B — Relies on personal/historical/trivia associations not in the text' },
  B_BR:       { label: 'BBR',  title: 'Criterion B — No effect on audience/reader: drama — no impact on stage/spectator; poetry/prose — no impact on reader' },
  C_CHECK:    { label: 'C✓',   title: 'Criterion C — Clearly focused; connects to topic sentence or prior argument' },
  C_CROSS:    { label: 'C✗',   title: 'Criterion C — Contradiction with a prior claim or the thesis' },
  C_QUESTION: { label: 'C?',   title: 'Criterion C — Focus breaking down; stream-of-consciousness; main point hard to follow' },
  C_SIGNPOST: { label: 'C→',   title: 'Criterion C — Logical/argumentative transition rather than sequential ("also", "in addition")' },
  C_S:        { label: 'CS',   title: 'Criterion C — Scattered: multiple unrelated points, no clear priority or connecting logic' },
  C_DRIFT:    { label: 'C≋',   title: 'Criterion C — Drifts from thesis: content or order no longer follows the thesis as stated in the introduction' },
  D_SP:       { label: 'DSP',  title: 'Criterion D — Spelling error' },
  D_AWK:      { label: 'DAWK', title: 'Criterion D — Awkward phrasing' },
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
  const pos = clampInt(position ?? 0, 0, 4);
  if (pos <= 0) return '';
  const squares = [1, 2, 3, 4].map(i => {
    const filled = i <= pos ? ' rp-bandpos__sq--filled' : '';
    return `<span class="rp-bandpos__sq${filled}" aria-hidden="true"></span>`;
  }).join('');
  return `<span class="rp-bandpos rp-bandpos--${band}" title="Position in band: ${pos}/4" aria-label="Position in band: ${pos} out of 4">${squares}</span>`;
}

/** Render overallImpression into the dedicated right-hand box. */
function updateOverallImpressionBox(notes) {
  const el = $('readingPanelOverall');
  if (!el || !notes) return;
  const oi = notes.overallImpression ?? {};
  const rows = ['A', 'B', 'C', 'D']
    .filter(k => oi[k]?.band && oi[k].band !== 'unknown')
    .map(k => {
      const { band, position, confidence, note } = oi[k];
      const confLabel = confidence === 'unknown' ? '' : confidence;
      return `<div class="rp-overall-crit-block">
        <div class="rp-overall-crit-header">
          <span class="rp-feeling-crit rp-feeling-crit--${k.toLowerCase()}">${k}</span>
          <span class="rp-overall-band rp-overall-band--${band}">${band}</span>
          ${renderBandPositionBar(band, position)}
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
          const { band, position, confidence, note } = oi[k];
          const confLabel = confidence === 'unknown' ? '' : confidence;
          return `<div class="rp-overall-crit-block">
            <div class="rp-overall-crit-header">
              <span class="rp-feeling-crit rp-feeling-crit--${k.toLowerCase()}">${k}</span>
              <span class="rp-overall-band rp-overall-band--${band}">${band}</span>
              ${renderBandPositionBar(band, position)}
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
      const score = Math.max(1, Math.min(5, Math.round(detail.score)));
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

function boot() {
  const apiKeyEl  = $('apiKey');
  const modelEl   = $('modelSelect');
  const sourceEl  = $('sourceText');
  const studentEl = $('studentParagraph');

  // Restore persisted inputs
  if (apiKeyEl)  apiKeyEl.value  = getApiKey();
  if (modelEl)   modelEl.value   = getModel();
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
  modelEl?.addEventListener('change',  () => setModel(modelEl.value));
  sourceEl?.addEventListener('input',  () => localStorage.setItem(KEY_SOURCE, sourceEl.value));
  studentEl?.addEventListener('input', () => {
    localStorage.setItem(KEY_STUDENT, studentEl.value);
    // IMPORTANT: do NOT wipe the reading cache here.
    // The cache is keyed by a content fingerprint; if the essay changes in any
    // meaningful way, getReadingNotes() will detect the mismatch and start fresh.
    // Wiping on every keystroke would destroy in-progress resume state.
  });

  // Model tier note
  function updateModelNote() {
    const noteEl = $('modelTierNote');
    if (!noteEl || !modelEl) return;
    const tier = modelEl.selectedOptions[0]?.dataset?.tier ?? '';
    noteEl.className = `model-tier-note model-tier-note--${tier}`;
  }
  modelEl?.addEventListener('change', updateModelNote);
  updateModelNote();

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

}

boot();
