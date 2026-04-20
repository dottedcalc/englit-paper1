/**
 * @param {string} sourceText
 * @param {string} studentParagraph
 */
function buildCriterionCLoraMessage(sourceText, studentParagraph) {
  const s = sourceText.trim();
  const p = studentParagraph.trim();

  return `Criterion C — Line of Reasoning Auditor (single agent, two phases in one JSON response)

Act as a **logic analyst** and an **experienced IB English A examiner**. Work in **one pass** but structure your output as **Phase 1** (line of reasoning / chunks) then **Phase 2** (thematic consistency: topic ↔ conclusion), then a **scores summary** — all in the schema fields.

---

## Phase 1 — LORA audit (chunk table)

**What counts as one chunk:** A chunk is **one stretch of student text that advances the same argument premise** — the **same main part of the argument**. It is **not** “one or two sentences” by default: if the student **keeps arguing the same premise** in the same way, that material belongs in **one** chunk even when it spans **several sentences**. Split into a **new** chunk only when the premise or argumentative move **changes** (new sub-claim, new line of support, or a real **pivot** to a different focus).

Deconstruct the paragraph block into **as few chunks as possible** while preserving real complexity. For **each** chunk row in \`phase1ChunkRows\`:

- **Chunk No.** — order 1, 2, 3…
- **Student text verbatim** — NON-NEGOTIABLE exact **contiguous** substring from the student paragraph (may be **multiple sentences** if the premise is unchanged).
- **Core premise or argument of this section** — **one sentence** summary of what **this** chunk is doing (the shared premise of the verbatim span).
- **Sound or non-sequitur** — brief.
- **Pivot vs progression from last** — for chunk 1 use \`FIRST_CHUNK\` (or equivalent). After that: **PIVOT** (change of topic/focus) vs **PROGRESSION** (develops the prior chunk), with a short explanation.

Then output **globally** for Phase 1 (not per row):

- **\`phase1ClarityOfShifts\`** — *Clarity of shift:* does the student use **transitions** to make moves between chunks **clear**?
- **\`phase1PivotNote\`** — *Pivot note:* Readers struggle when a paragraph **switches topics or pivots too often**, especially **substantial** pivots: tracking **topic change** is demanding, so the **main line of argument** can fail to **stand out** or feel **buried**. Cramming many pivots into **one** paragraph also tends to make the paragraph **over-long** and **cover too much**, which **weakens** Phase 1. If this pattern is real, **lower** \`phase1ScoreStars\` to \`**\` or \`*\` according to **severity** (mild confusion vs the main argument hard to see vs chaos). A **linear** or **reasonably** pivoted paragraph can still earn \`***\` when pivots are **warranted** and **signalled**.

---

## Phase 2 — Thematic consistency

**You must weigh the full argument of the paragraph** (entire body as context) for **every** Phase 2 judgment — not topic vs conclusion in isolation.

1. Output **topic sentence** and **concluding sentence** verbatim (\`topicSentenceVerbatim\`, \`concludingSentenceVerbatim\`).
2. If there is a shift between topic and conclusion, list **bridge chunk(s)** in \`phase2BridgeChunks\`: verbatim student span(s) from the **body** that work to connect topic to conclusion, and **how** each connects (\`howItConnects\`). Use an **empty array** if there is no meaningful bridge to list.
3. Classify using \`thematicShiftClassification\`, subtypes, and \`topicConclusionMinorityQuoteNote\` per schema.

**Acceptable evolution (examples):** concession; refinement; subversion.

**Unacceptable whiplash:** name **CONTRADICTION**, **DRIFT**, **ASSUMPTION_LEAP**, **DANGLING_NODE** when applicable (including dangling-node: new quote/analysis at the end with no closure).

---

## Phase 1 band — \`phase1ScoreStars\` (exactly \`*\`, \`**\`, or \`***\`)

- **\`***\`:** The line of reasoning **can be summarized clearly and linearly**. Pivots/transitions are **granted** where fairly signalled; **almost no** logical errors; **premise does not fluctuate** incoherently. The **main argument** stays **apparent**; pivots (if any) are **not excessive** for one paragraph.
- **\`**\`:** **Somewhat summarizable**, but **minor** logical errors or non sequiturs **or** the reasoning is **complex/convoluted** with **too many** sections/pivots (e.g. **about 3 or 4+** distinct chunks in **one** paragraph) so it is **harder to grasp simply** — including when **too many topic switches or pivots** (especially **substantial** pivots), an **over-long** paragraph, or **too much** scope **mutes** the main premise; **severity** guides \`**\` vs \`*\`.
- **\`*\`:** So **obscure** it **cannot** be summarized clearly; argument **fragmented** or hard to follow; **logic** (not content alone) makes the paragraph **unconvincing** due to **logical breakdowns** — including **severe** pivot/topic-churn where the **main argument** does not read clearly and the reader cannot see **one** controlling premise.

---

## Phase 2 band — \`phase2ScoreStars\` (exactly \`*\`, \`**\`, or \`***\`)

**Weigh the full argument of the paragraph for all three bands.**

- **\`***\`:** Thematic shift is **acceptable** (nuanced evolution), **earned by the body** where that matters.
- **\`**\`:** **No meaningful thematic shift** — topic and conclusion **mostly repeat** the same premise (**mostly repeat**) without real development **or** evolution is **muted / thin** (repetition or under-development, not full whiplash). Do **not** assign **\`**\`** on TS/CS wording alone if the body justifies a nuanced conclusion — that can still be **\`***\`**.
- **\`*\`:** **Unacceptable** shift, or TS/CS **absent**, or **ABSENT_OR_QUOTE_SHELL** / quote-hiding.

---

## Scores summary (required)

Fill \`phase1ScoreStars\`, \`phase1ScoreReasoning\`, \`phase2ScoreStars\`, \`phase2ScoreReasoning\`.

- Each reasoning field must be **4–5 sentences**.
- Each must follow: **A student earns [*, **, or ***] in Phase [1 or 2] because …** and ground the claim in the relevant phase (Phase 1: table + pivot note; Phase 2: TS, CS, bridges, categories).

Use **asterisk bands** (\`*\` / \`**\` / \`***\`) in JSON — **not** integers for these star fields.

Do **not** output a final IB Criterion C mark (**0–5**) here — that is computed in the app after later steps.

---

## Segmentation

- **One** pasted paragraph → **one** \`bodyParagraphs\` item.
- **Multiple** paragraphs separated by blank lines → **one** item per block; first sentence of each block = topic sentence for that block.

---

## Output

Return **only** valid JSON matching the schema. No markdown outside JSON.

[Source Text]

${s}

[Student paragraph(s)]

${p}`;
}

/**
 * Phase 1 chunk rows reduced to alignment fields only (no prior-agent judgments).
 * @param {unknown} rows
 * @returns {{ chunkNumber: unknown, studentTextVerbatim: string }[]}
 */
function scrubCriterionCPhase1ChunkRowsMinimal(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  return arr.map((r) =>
    r && typeof r === "object"
      ? {
          chunkNumber: r.chunkNumber,
          studentTextVerbatim: r.studentTextVerbatim != null ? String(r.studentTextVerbatim) : "",
        }
      : { chunkNumber: undefined, studentTextVerbatim: "" }
  );
}

/**
 * Step 2 input only: chunk boundaries from step 1 — no thematic fields, no pivot/clarity notes, no per-chunk judgments.
 * @param {object | null | undefined} loraData
 * @returns {object}
 */
function projectCriterionCLoraForTangentAgent(loraData) {
  const raw = JSON.parse(JSON.stringify(loraData && typeof loraData === "object" ? loraData : {}));
  const paras = Array.isArray(raw.bodyParagraphs) ? raw.bodyParagraphs : [];
  raw.bodyParagraphs = paras.map((block) => {
    if (!block || typeof block !== "object") return block;
    return {
      paragraphIndex: block.paragraphIndex,
      phase1ChunkRows: scrubCriterionCPhase1ChunkRowsMinimal(block.phase1ChunkRows),
    };
  });
  return raw;
}

/**
 * Step 3 input: strip scores, star reasoning, judge-y / band-hinting notes, and legacy derived fields.
 * Phase 1 chunk rows are minimal (chunk # + verbatim only); Phase 2 labels (TS/CS/bridges/classification) stay as non-numeric structure.
 * @param {object | null | undefined} loraData
 * @returns {object}
 */
function stripCriterionCLoraForStrategicEvaluator(loraData) {
  const raw = JSON.parse(JSON.stringify(loraData && typeof loraData === "object" ? loraData : {}));
  const paras = Array.isArray(raw.bodyParagraphs) ? raw.bodyParagraphs : [];
  for (const block of paras) {
    if (!block || typeof block !== "object") continue;
    delete block.lineOfReasoningClarityScore;
    delete block.lineOfReasoningClarityJustification;
    delete block.thematicConsistencyScore;
    delete block.thematicConsistencyJustification;
    delete block.phase1ScoreStars;
    delete block.phase1ScoreReasoning;
    delete block.phase2ScoreStars;
    delete block.phase2ScoreReasoning;
    delete block.phase1ClarityOfShifts;
    delete block.phase1PivotNote;
    delete block.reasoningSteps;
    delete block.shiftClarityNotes;
    if (Array.isArray(block.phase1ChunkRows)) {
      block.phase1ChunkRows = scrubCriterionCPhase1ChunkRowsMinimal(block.phase1ChunkRows);
    }
  }
  return raw;
}

/**
 * Step 3 input: strip tangent tiers and paragraph-level audit prose (can echo / prime scores).
 * @param {object | null | undefined} tangentData
 * @returns {object}
 */
function stripCriterionCTangentForStrategicEvaluator(tangentData) {
  const raw = JSON.parse(JSON.stringify(tangentData && typeof tangentData === "object" ? tangentData : {}));
  const paras = Array.isArray(raw.bodyParagraphs) ? raw.bodyParagraphs : [];
  for (const block of paras) {
    if (!block || typeof block !== "object") continue;
    delete block.tangentRepetitionScore;
    delete block.tangentRepetitionJustification;
    delete block.tangentRepetitionScoreStars;
    delete block.tangentRepetitionScoreReasoning;
    delete block.auditSummary;
  }
  return raw;
}

/**
 * Prior steps’ structural JSON for the Strategic Evaluator — scores and judge notes omitted (not full saved bundles).
 * @param {object | null | undefined} loraData
 * @param {object | null | undefined} tangentData
 */
function formatCriterionCStrategicEvaluatorPriorContext(loraData, tangentData) {
  const l = stripCriterionCLoraForStrategicEvaluator(loraData);
  const t = stripCriterionCTangentForStrategicEvaluator(tangentData);
  return `#### Line of Reasoning Auditor (step 1) — structure for alignment (tier scores, pivot/clarity commentary, and per-chunk logic judgments omitted; Phase 1 rows are chunk # + verbatim only)

\`\`\`json
${JSON.stringify(l, null, 2)}
\`\`\`

#### Tangent / Repetition (step 2) — per-chunk audit table only (tier scores and paragraph audit summary omitted)

\`\`\`json
${JSON.stringify(t, null, 2)}
\`\`\``;
}

/**
 * Step 2/3 — Tangent and Repetition Detector (uses Line of Reasoning Auditor JSON + same source/student text).
 * @param {string} sourceText
 * @param {string} studentParagraph
 * @param {object} loraData
 */
function buildCriterionCTangentRepetitionMessage(sourceText, studentParagraph, loraData) {
  const s = sourceText.trim();
  const p = studentParagraph.trim();
  const loraJson = JSON.stringify(projectCriterionCLoraForTangentAgent(loraData), null, 0);

  return `Criterion C — Step 2 of 3 (Tangent and Repetition Detector)

Act as a **Senior IB English A Examiner**. You are auditing a **deconstructed argument** for logical cohesion and **Criterion C (Organization and Development)**.

## Non-negotiable rule

Every chunk must **explicitly signal its purpose** and its **direct connection to the Topic Sentence or central argument**. You are **strictly forbidden** from filling in the blanks for the student.

## Student-voice requirement

To count as a **valid connection**, the explanation must consist of the **majority of the student’s own words**. If the student merely rephrases the quote or relies on the author’s vocabulary to bridge the gap, it **does not** count as an explicit connection.

## Task — \`chunkAuditRows\` (full table, not a waste-only list)

Use the **same chunking as step 1** (\`phase1ChunkRows\` / chunk boundaries). Output **one table row per chunk** in \`chunkAuditRows\` for **every** body chunk — **not** only failures.

**Coverage rule:** The **concatenation** of all \`studentTextVerbatim\` cells must cover **all** of the student’s paragraph text **except** the **topic sentence** (first sentence of the block). Do **not** leave gaps; do **not** duplicate the topic sentence as its own row unless your step-1 alignment requires splitting it out (prefer **omitting** the topic sentence from the table and covering **only** post–topic-sentence text across rows).

**Columns (schema fields):**

| Column | JSON field |
|--------|------------|
| Chunk # | \`chunkNumber\` — align with step 1 chunk order (1, 2, 3…) |
| Student verbatim | \`studentTextVerbatim\` — exact substring |
| What the student is talking about | \`studentTalkingAbout\` |
| Connects to argument / broader TS? | \`connectsToArgumentOrBroaderTS\` — exactly **Yes** or **No** |
| Verbatim evidence (student’s own words) | \`connectionEvidenceOwnWords\` — **If Yes:** required verbatim **student** wording proving the link (not authorial quoted text as the only bridge). **If No:** explain why there is no defensible connection. |
| What purpose it serves | \`purposeItServes\` |
| Evidence that doesn’t connect to purpose (verbatim) | \`driftOrIrrelevantStudentVerbatim\` — **quote student verbatim** wherever the writing offers **evidence or prose that does not connect** to the chunk’s argumentative purpose: **tangents**, **trivial** throat-clearing or padding, and **egregious** patterns called out below (unrelated **historical** digressions, **definitions**, **biographical** trivia, **loose opinion** with no TS tie). Use \`""\` only when there is no separable offending span (whole chunk cleanly on-purpose). |
| **Assessment** | \`chunkAssessment\` — **one array, all flags that apply** (see rules). Allowed values: **PASS**, **REPETITION**, **TANGENT**, **MILD_TANGENT**. **REPETITION** and **TANGENT** may both be listed when both are true (e.g. the chunk repeats a prior premise **and** drifts or fails connection). |

**Connection rule (non-negotiable)**

- If \`connectsToArgumentOrBroaderTS\` is **No** → \`chunkAssessment\` **must include TANGENT**. You may also include **REPETITION** and/or **MILD_TANGENT** when applicable.
- If **Yes** → you **must** supply real **verbatim student evidence** in \`connectionEvidenceOwnWords\` showing the link (majority student words). Do not mark Yes without quotable student-voice proof.

**\`chunkAssessment\` rules (single column — no separate “analyze” vs “verdict”)**

- **PASS:** Use \`["PASS"]\` **only** when the chunk is cleanly on-purpose with valid connection and purpose. **Do not** list **PASS** together with **REPETITION**, **TANGENT**, or **MILD_TANGENT**.

- **REPETITION:** The chunk’s **main argumentative premise** largely **repeats** what earlier chunk(s) already established **without adding new substance** to the line of argument (padding / circling the same claim). **REPETITION** can appear **together with TANGENT** when the chunk both repeats and goes off-purpose or fails the TS link.

- **TANGENT (strict):** Fails the connection test — including **any** row where Connects is **No**. Also: no explicit connection in the **majority of the student’s own words**; purpose not signalled; or “explanation” is only paraphrase of the passage. **Egregious** tangents (weigh harder): unrelated **historical** digressions, **definitions**, **biographical** trivia, loose **opinion** with no tie to the TS.

- **MILD_TANGENT:** Weak or fuzzy bridge but **not** a full **TANGENT** fail — use **without** **PASS** if you flag it (e.g. \`["MILD_TANGENT"]\` or \`["REPETITION", "MILD_TANGENT"]\`).

**Evidence that doesn’t connect to purpose (\`driftOrIrrelevantStudentVerbatim\`)**

- This column is **proof in the student’s own words**: any **verbatim** stretch that shows material failing the connection to argumentative purpose — not a paraphrase of your judgment.
- Include **tangents** and **trivial** filler that does not serve the line of argument; prioritize **egregious** cases (**historical** digressions, **definitions**, **biographical** trivia, **loose opinion** without a TS tie) when present — same examples as under **TANGENT** above.
- Quote the **smallest defensible substring(s)**; if the entire \`studentTextVerbatim\` is off-purpose, quote it or the worst span.

## Short examples (same logic as the table)

**Connects = No:** \`chunkAssessment\` includes **TANGENT**; \`driftOrIrrelevantStudentVerbatim\` quotes verbatim student text that fails purpose-connection; \`connectionEvidenceOwnWords\` explains the failure (no student-voice bridge).

**Connects = Yes:** \`connectionEvidenceOwnWords\` must include **verbatim student wording** proving the link — not authorial quotation alone.

**Tangent:** Student never uses **their own words** to tie imagery to the TS → include **TANGENT** in \`chunkAssessment\`; document in \`connectionEvidenceOwnWords\`; put non-connecting verbatim in \`driftOrIrrelevantStudentVerbatim\` as needed.

**Pass:** Student bridges using **own words** → \`["PASS"]\`; \`driftOrIrrelevantStudentVerbatim\` is \`""\` if there is no separable non-connecting span.

**Repetition + tangent:** When the chunk **repeats** a prior premise **and** **drifts** or fails connection → e.g. \`["REPETITION", "TANGENT"]\`.

## Output format

- **\`auditSummary\`:** Harsh overall assessment (still required).
- **\`chunkAuditRows\`:** Full table as above for **all** body chunks (aligned to step 1).

## Band — \`tangentRepetitionScoreStars\` (exactly \`*\`, \`**\`, or \`***\`)

**Set the star band from the chunk audit table** (\`chunkAuditRows\` \`chunkAssessment\` patterns). Cite **counts** (rows containing **TANGENT**, **REPETITION**, **MILD_TANGENT**, vs \`["PASS"]\`) and **which chunks** drive the band; rows may list **both** **REPETITION** and **TANGENT**. Apply **stricter penalty** when **egregious** tangent types appear (historical digression, definition, biography, loose opinion with no TS tie).

- **\`***\`:** **Cogent** organization of argument in the body. \`["PASS"]\` dominates; **TANGENT** / **REPETITION** flags are **few / occasional**, not a pattern; **no** serious egregious-tangent pattern.
- **\`**\`:** **Some** chunks with **TANGENT** and/or **REPETITION**, but the paragraph **largely** stays on task; egregious types **limited** or **contained**.
- **\`*\`:** **Many** chunks with **TANGENT** and/or **REPETITION** **or** a **serious** egregious-tangent pattern; **hinders** how evidence proves the topic sentence.

## Reasoning — \`tangentRepetitionScoreReasoning\` (**4–5 sentences**, required)

Must **explicitly** ground the star band in **\`chunkAuditRows\`**: \`chunkAssessment\` tallies (including combined **REPETITION**+**TANGENT** rows), notable chunk numbers, and egregious types where relevant. Open with: **A student earns [*, **, or ***] because …**

Use **asterisk bands** in JSON — **not** an integer field for the star output.

---

Return **only** valid JSON matching the schema. **bodyParagraphs** must align **one-to-one** with the Line of Reasoning Auditor blocks (same \`paragraphIndex\` order).

[Source Text]

${s}

[Full student paragraph(s) — same paste as step 1]

${p}

[Line of Reasoning Auditor — **chunk alignment only** (\`paragraphIndex\` + \`phase1ChunkRows\` with chunk # and student verbatim per chunk). No Phase 2 fields, no pivot/clarity notes, and no step 1 per-chunk logic judgments — infer connections from the student text and these boundaries.]

${loraJson}`;
}

/**
 * Criterion C — Step 3 of 3 (Strategic Evaluator — emphasis vs. contextualization). Final IB 0–5 is not model output.
 * @param {string} sourceText
 * @param {string} studentParagraph
 * @param {object} loraData
 * @param {object} tangentData
 */
function buildCriterionCStrategicEvaluatorMessage(sourceText, studentParagraph, loraData, tangentData) {
  const s = sourceText.trim();
  const p = studentParagraph.trim();
  const prior = formatCriterionCStrategicEvaluatorPriorContext(loraData, tangentData);

  return `Criterion C — Step 3 of 3 (Strategic Evaluator)

Act as a **Strategic Evaluator**. Your goal is to determine whether the student understands **Emphasis vs. Contextualization** in service of **Criterion C (Organization and Development)**.

You have **[Source Text]**, the **full student paragraph(s)**, and **structural JSON** from step 1 and step 2 below. **Tier scores and judge summaries that could mirror those tiers are intentionally withheld** — do not infer them; base your judgment on the **student text** and the **structural fields provided** (Phase 1 chunk alignment + Phase 2 labels from step 1; step 2 per-chunk audit **table** rows only — no paragraph-level audit summary).

**Do not** output any final IB Criterion C mark (**0–5**). The application computes that from the four pipeline tiers.

---

## Evaluation metrics

**The Gloss check:** Identify the **menial** or **contextual** parts of the paragraph (setting the scene, plot summary, throat-clearing). The student should **gloss** over these with **brief, efficient** treatment—not equal billing with analysis.

**The Depth check:** Identify the **core argument** or **analytical pivot**. The student must **deep-dive** here with sustained, substantive unpacking.

**The Uniformity penalty — “Low Focus”:** Flag analysis as **Low Focus** if the student applies the **same level of detail** to setup/context as they do to the conclusion or analytical core. Also flag when **quote analysis is spread so thin** that **every** quote gets only shallow treatment and **no** line achieves sufficient depth (**pattern**).

---

## Output score — \`strategicFocusScore\` (integer **1**, **2**, or **3** only)

- **3 (***):** The student **clearly** knows how to **strategize** focus and **emphasize** what matters; menial material stays brief; core claims earn depth.

- **2 (**):** The student **does not** sharply strategize, but they **do not** over-focus on menial detail; the lack of strategy **does not** seriously undermine the paragraph’s overall organization.

- **1 (*):** The student **dwells excessively** on menial detail and it becomes a **pattern** **OR** quote analysis is **spread so thin** that every quote is analyzed **without sufficient depth** (thin uniformity).

---

## Prior structural output (steps 1–2, scores omitted)

${prior}

---

## Output — JSON only

Return **one** object matching the schema (gloss/depth/uniformity fields, \`lowFocusFlag\`, \`strategicFocusScore\`, \`strategicFocusJustification\`).

[Source Text]

${s}

[Student paragraph(s)]

${p}`;
}

/**
 * @param {object} tangentData
 * @returns {number | null}
 */
function computeCriterionCTangentMean(tangentData) {
  const paras = Array.isArray(tangentData?.bodyParagraphs) ? tangentData.bodyParagraphs : [];
  if (!paras.length) return null;
  const scores = [];
  for (const p of paras) {
    const v = normalizeCriterionCLoraTier123(p.tangentRepetitionScore);
    if (v != null) scores.push(v);
  }
  if (!scores.length) return null;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(mean * 10) / 10;
}

/**
 * @param {object | null} moderatorData
 * @returns {number | null}
 */
function getCriterionCModeratorFinalIbMark(moderatorData) {
  if (!moderatorData || typeof moderatorData !== "object") return null;
  return normalizeFinalCriterionCMark(moderatorData.finalIbMark);
}

/**
 * @param {object} bundle
 * @returns {number | null}
 */
function getCriterionCFinalIbMarkFromBundle(bundle) {
  if (!bundle || typeof bundle !== "object") return null;
  if (
    bundle.essayMode &&
    bundle.criterionCEssayFinalIbExaminer &&
    typeof bundle.criterionCEssayFinalIbExaminer === "object" &&
    bundle.criterionCEssayFinalIbExaminer.score != null
  ) {
    const v = normalizeFinalCriterionCMark(bundle.criterionCEssayFinalIbExaminer.score);
    if (v != null) return v;
  }
  if (bundle.finalCriterionCMark != null && Number.isFinite(bundle.finalCriterionCMark)) {
    return bundle.finalCriterionCMark;
  }
  const m = getCriterionCModeratorFinalIbMark(bundle.criterionCModeratorData);
  if (m != null) return m;
  const legacyLora = getCriterionCLoraFinalIbMarkFromData(bundle.criterionCLoraData);
  if (legacyLora != null) return legacyLora;
  if (bundle.criterionCStep5Data && bundle.criterionCStep5Data.finalIbMark != null) {
    return normalizeFinalCriterionCMark(bundle.criterionCStep5Data.finalIbMark);
  }
  return null;
}

/**
 * @param {unknown} n
 * @returns {number | null}
 */
function normalizeFinalCriterionCMark(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const c = Math.max(0, Math.min(5, x));
  return Math.round(c * 2) / 2;
}

/**
 * @param {unknown} n
 * @returns {number | null}
 */
function normalizeCriterionCLoraTier123(n) {
  const r = Math.round(Number(n));
  if (!Number.isFinite(r) || r < 1 || r > 3) return null;
  return r;
}

/**
 * Map LORA star band to integer 1–3 for downstream formulas.
 * @param {unknown} stars
 * @returns {number | null}
 */
function normalizeCriterionCStarBandTo123(stars) {
  const t = String(stars ?? "").trim();
  if (t === "***") return 3;
  if (t === "**") return 2;
  if (t === "*") return 1;
  return null;
}

/**
 * @param {number | null} t
 * @returns {string}
 */
function criterionCLoraTier123ToStarBand(t) {
  if (t === 3) return "***";
  if (t === 2) return "**";
  if (t === 1) return "*";
  return "—";
}

/**
 * Derive integer tier fields and compatibility \`reasoningSteps\` / \`shiftClarityNotes\` from Phase 1/2 output.
 * @param {object} loraData
 * @returns {object}
 */
function enrichCriterionCLoraDataFromPhaseOutput(loraData) {
  if (!loraData || typeof loraData !== "object") return loraData;
  const paras = Array.isArray(loraData.bodyParagraphs) ? loraData.bodyParagraphs : [];
  for (const block of paras) {
    if (!block || typeof block !== "object") continue;
    const p1 = normalizeCriterionCStarBandTo123(block.phase1ScoreStars);
    const p2 = normalizeCriterionCStarBandTo123(block.phase2ScoreStars);
    if (p1 != null) block.lineOfReasoningClarityScore = p1;
    if (p2 != null) block.thematicConsistencyScore = p2;
    const rows = Array.isArray(block.phase1ChunkRows) ? block.phase1ChunkRows : [];
    if (rows.length) {
      block.reasoningSteps = rows.map((r, i) => {
        const n = r.chunkNumber != null ? Number(r.chunkNumber) : i + 1;
        const lab = `Chunk ${Number.isFinite(n) && n > 0 ? n : i + 1}`;
        const verb = r.studentTextVerbatim != null ? String(r.studentTextVerbatim) : "";
        const core = r.corePremiseOrArgumentOneSentence != null ? String(r.corePremiseOrArgumentOneSentence) : "";
        const snd = r.soundOrNonSequitur != null ? String(r.soundOrNonSequitur) : "";
        const piv = r.pivotOrProgressionFromPrevious != null ? String(r.pivotOrProgressionFromPrevious) : "";
        return {
          stepLabel: lab,
          studentTextVerbatim: verb,
          quoteVsParaphraseTag: "MIXED",
          whySingleSection: core,
          stepToLogicLine: core,
          faultOrNonSequiturNote: snd,
          pivotOrProgressionFromPrevious: piv,
        };
      });
    }
    const clarityParts = [block.phase1ClarityOfShifts, block.phase1PivotNote].filter(Boolean);
    if (clarityParts.length) {
      block.shiftClarityNotes = clarityParts.join("\n\n");
    }
  }
  return loraData;
}

/**
 * Derive \`tangentRepetitionScore\` (1–3) from \`tangentRepetitionScoreStars\` after step 2 parse.
 * @param {object} tangentData
 * @returns {object}
 */
function enrichCriterionCTangentDataFromStarOutput(tangentData) {
  if (!tangentData || typeof tangentData !== "object") return tangentData;
  const paras = Array.isArray(tangentData.bodyParagraphs) ? tangentData.bodyParagraphs : [];
  for (const block of paras) {
    if (!block || typeof block !== "object") continue;
    const tr = normalizeCriterionCStarBandTo123(block.tangentRepetitionScoreStars);
    if (tr != null) block.tangentRepetitionScore = tr;
  }
  return tangentData;
}

/**
 * One-column summary for chunk audit rows: \`chunkAssessment\`, or legacy \`verdict\` + \`analysisTags\`.
 * @param {object} row
 * @returns {string}
 */
function formatCriterionCTangentChunkAssessmentForDisplay(row) {
  if (!row || typeof row !== "object") return "—";
  if (Array.isArray(row.chunkAssessment) && row.chunkAssessment.length > 0) {
    return row.chunkAssessment
      .map((x) => String(x).trim().toUpperCase())
      .filter(Boolean)
      .join(", ");
  }
  const parts = [];
  const verdict = row.verdict != null ? String(row.verdict).trim().toUpperCase() : "";
  if (verdict) parts.push(verdict);
  if (Array.isArray(row.analysisTags)) {
    for (const raw of row.analysisTags) {
      const t = String(raw).trim();
      if (!t) continue;
      let u = t.toUpperCase();
      if (u === "REPEAT") u = "REPETITION";
      if (u === "MILD_TANGENT") {
        if (!parts.includes("MILD_TANGENT")) parts.push("MILD_TANGENT");
      } else if (u === "REPETITION") {
        if (!parts.includes("REPETITION")) parts.push("REPETITION");
      } else if (u === "TANGENT") {
        if (!parts.includes("TANGENT")) parts.push("TANGENT");
      }
    }
  }
  const deduped = [];
  const seen = new Set();
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      deduped.push(p);
    }
  }
  return deduped.length ? deduped.join(", ") : "—";
}

/**
 * Mean of per-block tier scores, rounded to the nearest integer 1–3 (for multi-block paragraphs).
 * @param {unknown[]} blocks
 * @param {string} field
 * @returns {number | null}
 */
function meanRoundedCriterionCTier123FromBlocks(blocks, field) {
  const paras = Array.isArray(blocks) ? blocks : [];
  const vals = [];
  for (const p of paras) {
    const v = normalizeCriterionCLoraTier123(p[field]);
    if (v != null) vals.push(v);
  }
  if (!vals.length) return null;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const r = Math.round(m);
  return Math.max(1, Math.min(3, r));
}

/**
 * Criterion C v4 — paragraph IB mark (0–5) from four pipeline tiers (* / ** / *** ≡ 1 / 2 / 3):
 * start at **5**; each ** deducts **0.5**; among the four tiers, count of *: one → −1.5, two → −2.5, three → −4, four → **0**; *** deducts nothing.
 * @param {unknown} lineClarity
 * @param {unknown} thematic
 * @param {unknown} tangentRep
 * @param {unknown} strategic
 * @returns {number | null}
 */
function computeCriterionCV4FinalIbMarkFromFourTiers(lineClarity, thematic, tangentRep, strategic) {
  const a = normalizeCriterionCLoraTier123(lineClarity);
  const b = normalizeCriterionCLoraTier123(thematic);
  const c = normalizeCriterionCLoraTier123(tangentRep);
  const d = normalizeCriterionCLoraTier123(strategic);
  if (a == null || b == null || c == null || d == null) return null;
  const tiers = [a, b, c, d];
  const n1 = tiers.filter((t) => t === 1).length;
  const n2 = tiers.filter((t) => t === 2).length;
  if (n1 === 4) return 0;
  const deductStars =
    n1 === 0 ? 0 : n1 === 1 ? 1.5 : n1 === 2 ? 2.5 : n1 === 3 ? 4 : 0;
  const deductDoubles = n2 * 0.5;
  const raw = 5 - deductStars - deductDoubles;
  return normalizeFinalCriterionCMark(raw);
}

/**
 * Aggregates step 1–3 tier scores for one paragraph run, then applies {@link computeCriterionCV4FinalIbMarkFromFourTiers}.
 * @param {object | null | undefined} loraData
 * @param {object | null | undefined} tangentData
 * @param {object | null | undefined} moderatorData
 * @returns {number | null}
 */
function getCriterionCV4FinalIbMarkFromPipelineData(loraData, tangentData, moderatorData) {
  const loras = Array.isArray(loraData?.bodyParagraphs) ? loraData.bodyParagraphs : [];
  const tangs = Array.isArray(tangentData?.bodyParagraphs) ? tangentData.bodyParagraphs : [];
  const cl = meanRoundedCriterionCTier123FromBlocks(loras, "lineOfReasoningClarityScore");
  const th = meanRoundedCriterionCTier123FromBlocks(loras, "thematicConsistencyScore");
  const tg = meanRoundedCriterionCTier123FromBlocks(tangs, "tangentRepetitionScore");
  const sf = normalizeCriterionCLoraTier123(moderatorData?.strategicFocusScore);
  return computeCriterionCV4FinalIbMarkFromFourTiers(cl, th, tg, sf);
}

/**
 * Sets `moderatorData.finalIbMark` from the four-tier formula only (agents do not assign the IB mark).
 * @param {object | null | undefined} loraData
 * @param {object | null | undefined} tangentData
 * @param {object | null | undefined} moderatorData
 * @returns {number | null}
 */
function applyCriterionCV4FormulaFinalMark(loraData, tangentData, moderatorData) {
  if (!moderatorData || typeof moderatorData !== "object") return null;
  delete moderatorData.finalIbMark;
  delete moderatorData.finalIbMarkJustification;
  const computed = getCriterionCV4FinalIbMarkFromPipelineData(loraData, tangentData, moderatorData);
  if (computed != null) {
    moderatorData.finalIbMark = computed;
    return computed;
  }
  return null;
}

/**
 * @param {object} loraData
 * @returns {number | null} Mean of per-block clarity scores.
 */
function computeCriterionCLoraClarityMean(loraData) {
  const paras = Array.isArray(loraData?.bodyParagraphs) ? loraData.bodyParagraphs : [];
  if (!paras.length) return null;
  const scores = [];
  for (const p of paras) {
    const v = normalizeCriterionCLoraTier123(p.lineOfReasoningClarityScore);
    if (v != null) scores.push(v);
  }
  if (!scores.length) return null;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(mean * 10) / 10;
}

/**
 * @param {object} loraData
 * @returns {number | null} Mean of per-block thematic consistency scores.
 */
function computeCriterionCLoraThematicMean(loraData) {
  const paras = Array.isArray(loraData?.bodyParagraphs) ? loraData.bodyParagraphs : [];
  if (!paras.length) return null;
  const scores = [];
  for (const p of paras) {
    const v = normalizeCriterionCLoraTier123(p.thematicConsistencyScore);
    if (v != null) scores.push(v);
  }
  if (!scores.length) return null;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(mean * 10) / 10;
}

/**
 * @param {object} loraData
 * @returns {number | null} Legacy v3 bundles only (finalIbMark embedded in LORA).
 */
function getCriterionCLoraFinalIbMarkFromData(loraData) {
  if (!loraData || typeof loraData !== "object") return null;
  if (loraData.finalIbMark == null) return null;
  return normalizeFinalCriterionCMark(loraData.finalIbMark);
}

/**
 * @param {string} full
 * @returns {string[]}
 */
function splitStudentParagraphIntoBlocks(full) {
  return String(full || "")
    .trim()
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * @param {string} fullStudent
 * @param {number} paragraphIndex
 */
function blockTextForCriterionCParagraph(fullStudent, paragraphIndex) {
  const blocks = splitStudentParagraphIntoBlocks(fullStudent);
  const idx = paragraphIndex != null ? Number(paragraphIndex) : 0;
  if (Number.isFinite(idx) && blocks[idx]) return blocks[idx];
  if (blocks.length === 1) return blocks[0];
  return String(fullStudent || "").trim();
}

/**
 * @param {string} sourceText
 * @param {string} fullEssay
 * @param {{ intro: string, conclusion: string, bodyParagraphs: string[] }} meta
 */
function buildCriterionCEssayHolistic1ThesisTopicsMessage(sourceText, fullEssay, meta) {
  const s = sourceText.trim();
  const e = fullEssay.trim();
  const bodies = Array.isArray(meta.bodyParagraphs) ? meta.bodyParagraphs : [];
  const bodyList = bodies.map((p, i) => `--- Body paragraph ${i + 1} (verbatim slice) ---\n${String(p).trim()}`).join("\n\n");
  return `Criterion C — Whole-essay holistic check **1 of 3**: Thesis and topics consistency (IB Paper 1)

You receive the **full student essay** after per–body-paragraph Criterion C work has been done elsewhere. Your job is a **standalone** holistic pass: **thesis vs what each body paragraph actually does**.

---

## Step A — Thesis (verbatim)

1. From the **introduction** (or, if clearly marked, a stated thesis elsewhere), extract the **thesis / controlling interpretive claim** **verbatim** (exact student substring from the full essay paste).
2. Classify \`thesisStatus\`:
   - **OK_FUNCTIONAL** — a defensible **interpretive** claim the body paragraphs could answer (not mere plot summary).
   - **ABSENT** — no defensible thesis.
   - **PROMPT_REPETITION** — largely repeats the task wording with no interpretive stance.
   - **DESCRIPTIVE_ONLY** — thesis is only plot/description, not an argument.
   - **OTHER_NONFUNCTIONAL** — otherwise unusable as a contract for the essay.
3. If the thesis is **not** OK_FUNCTIONAL, you **must** output **\`thesisTopicsConsistencyRating\`: \`*\`** (lowest tier) and explain in \`thesisTopicsConsistencyJustification\` — still fill the table rows honestly.

---

## Step B — The “promise” (reader contract)

**Looking only at the thesis**, list what each **body paragraph** should plausibly deliver — as if the writer made a **contract** with the reader. Output **\`readerContractBullets\`**: one string per body paragraph **in order** (same count as body paragraphs). Example style: \`Paragraph 1 must establish X and link to Y.\`

---

## Step C — What paragraphs actually do

For **each body paragraph**, **without** letting the thesis bias you, summarize **what that paragraph actually discusses as a whole** (enter in table field \`paragraphActuallyDiscusses\`).

---

## Step D — Comparison table

Fill \`thesisVsParagraphsTable\`: one row per body paragraph (\`bodyParagraphIndex1Based\` = 1…N). Columns:
- **thesisPromiseForThisParagraph** — from the contract (Step B).
- **paragraphActuallyDiscusses** — neutral summary (Step C).
- **lineOfReasoningComparison** — compare line of reasoning: exact wording need not match, but **key terms** from the thesis should **repeat or clearly map**. Flag added topics, derailment, reordering that breaks the contract, or mild mismatch.

---

## Step E — Star band

Assign **\`thesisTopicsConsistencyRating\`** exactly **\`*\`**, **\`**\`**, or **\`***\`**:
- **\`***\`** — Strong consistency: promises match delivery; keywords recur or map; structure follows the contract.
- **\`**\`** — Mild inconsistency: some slippage but essay largely on track.
- **\`*\`** — Derails thesis, adds major new lines of argument, destructive reordering, or thesis absent/non-functional (required if thesis not OK_FUNCTIONAL).

\`thesisTopicsConsistencyJustification\`: **4–6 sentences** grounding the band in the table.

---

## Output

Return **only** valid JSON matching the schema. No markdown outside JSON.

[Source text]

${s}

[Full student essay — complete paste]

${e}

[Introduction slice — context only]

${String(meta.intro || "").trim()}

[Conclusion slice — context only]

${String(meta.conclusion || "").trim()}

[Body paragraphs — enumerated slices for alignment]

${bodyList || "(no body slices — still return valid JSON with empty arrays if impossible.)"}`;
}

/**
 * @param {string} sourceText
 * @param {string} fullEssay
 * @param {{ intro: string, conclusion: string, bodyParagraphs: string[] }} meta
 */
function buildCriterionCEssayHolistic2ParagraphSwappingMessage(sourceText, fullEssay, meta) {
  const s = sourceText.trim();
  const e = fullEssay.trim();
  const bodies = Array.isArray(meta.bodyParagraphs) ? meta.bodyParagraphs : [];
  const bodyList = bodies.map((p, i) => `--- Body ${i + 1} ---\n${String(p).trim()}`).join("\n\n");
  return `Criterion C — Whole-essay holistic check **2 of 3**: Paragraph order, argumentative structure & shuffle test (macro only)

You are an **IB English A Paper 1 examiner** with **20+ years** of experience. Judge **only macro structure** — not micro sentence logic inside paragraphs, and **not** thesis–topic fit (holistic 1).

---

**NON-NEGOTIABLE — Comparative / contrast-thesis body structure (\`COMPARATIVE\`)**

Use this when the **thesis** (or opening argumentative contract) **establishes a contrast between two aspects** **A** and **B** (e.g. two focal images, two registers, two worlds, two guitars, past vs present as a **paired** claim — **not** a loose “also discusses Y”).

- **Integrated contrast (required for credit at \`***\` when this applies):** **Every body paragraph** must **sustain** that **A vs B** contract through **juxtaposition, weighing, or interlocking analysis** — **A** and **B** stay in **active relation** within the paragraph’s movement. **Paragraphs must not** primarily treat **A alone**, then **B alone**, as **separate silos** (e.g. body 1–2 only on A, body 3–4 only on B) **unless** the thesis explicitly licenses a different architecture (rare; say so if you claim it).
- **Deny credit (mandatory \`*\` for \`macroStructurePhase1Rating\`):** If the thesis **does** promise **A vs B** contrast but the body **fails** integrated contrast — **split** treatment, **parallel** blocks without ongoing comparative synthesis, or **abandoning** the paired frame — set **\`macroStructurePhase1Rating\`** to **\`*\`** **only** (not \`**\`**, not \`***\`). Say so plainly in **\`macroStructurePhase1Justification\`** (name **A**, **B**, and **split vs integrated**).
- **Label:** Set **\`argumentativeStructureType\`** to **\`COMPARATIVE\`** when the essay’s **dominant** macro scaffold is **sustained A/B contrast** (whether successful or **failed** under this rule). **\`***\`** for structure is appropriate **only** when **COMPARATIVE** is **well executed** under the integrated-contrast rule **or** when a **non-comparative** pattern (e.g. **\`CUMULATIVE_LENS\`**) earns strong structure on its own terms.

---

## Part A — Paragraph order and argumentative structure

1. Summarize **body paragraph order** and each paragraph’s **role** in the essay’s argument (\`bodyParagraphOrderAndRoleSummary\`).
2. Choose the **best-fit** \`argumentativeStructureType\` from:

| Type | How it works | Typical fit |
|------|----------------|-------------|
| **CHRONOLOGICAL_LINEAR** | Follow the passage **start → finish**; meaning shifts along textual sequence. | Poetry / short prose with a clear arc. |
| **THEMATIC_CONCEPTUAL** | Each body paragraph = a **different big idea** (e.g. power, then corruption, then redemption). | Layered texts. |
| **FEATURE_BASED_CHECKLIST** | Each body paragraph = a **different technique** (imagery para, syntax para, …) with little cumulative argument. | Often **weakest** — feels like technique shopping. |
| **CUMULATIVE_LENS** | Same **core interpretive idea** developed through **increasingly zoomed-out** perspectives (e.g. individual → society → universal). | Strong Paper 1 / Paper 2 responses. |
| **COMPARATIVE** | **Contrast two aspects (A vs B) in every body paragraph** — integrated juxtaposition matching a **contrast thesis**; **not** siloed A-then-B blocks. When executed well, this pattern corresponds to **\`***\`** for **\`macroStructurePhase1Rating\`** (see NON-NEGOTIABLE above). | Essays whose **central** scaffold is **paired contrast** across the whole response. |
| **HYBRID_OR_MIXED** | Blend of two or more patterns; explain clearly. | When labels are genuinely mixed. |

3. \`argumentativeStructureReasoning\`: **substantial** prose — why this label fits, how labour is divided across body paragraphs. If **\`COMPARATIVE\`**, spell out how **A** and **B** are (or are not) **co-present** in **each** body paragraph.

---

## Part B — Phase 1 score: structure quality (\`macroStructurePhase1Rating\`)

Exactly **\`*\`**, **\`**\`**, or **\`***\`**:

- **\`***\`** — **Strong** structure: clearly **cumulative / lens-style** development **or** **\`COMPARATIVE\`** done **right** — **integrated A/B contrast sustained in every body paragraph** when the thesis demands it — **not** checklist prose, **not** split silos for A vs B.
- **\`**\`** — **Mediocre**: workable **chronological** or **thematic** execution, **or** cumulative/lens **attempted but poorly executed** (thin thematic links, uneven zoom, etc.). **Do not** use \`**\`** when the NON-NEGOTIABLE comparative-thesis failure applies — that case is **\`*\`** only.
- **\`*\`** — **Feature shopping** / **technique-based checklist** as the **dominant** organizing principle (\`FEATURE_BASED_CHECKLIST\` pattern), **or** structure too weak to defend higher, **or** (**NON-NEGOTIABLE**) thesis establishes **A vs B** contrast but body paragraphs **do not** maintain **integrated** contrast (mandatory \`*\` — see block above).

\`macroStructurePhase1Justification\`: **4–6 sentences**, examiner voice, tied to the rubric above.

---

## Part C — Phase 2 score: imaginary paragraph shuffle (\`shuffleTestPhase2Rating\`)

Imagine **randomly shuffling** the **body** paragraphs like a deck of cards. What happens to **macro** readability and the **essay’s line of argument as a whole**?

**Critical — what counts for each band:**

- **\`***\`** — Shuffling **destroys** the **overall argumentative logic**: cumulative build, lens zoom, thematic sequence, or interdependent claims **no longer cohere** as an essay. The breakdown must be **substantive for logic as a whole** — not merely that a **different body paragraph would now “go first”** or that **topic sentences** sit in a **forced / awkward** order. If the **only** noticeable effect of shuffling is **which paragraph’s topic sentence comes first** (or similar **surface ordering** of openings) **without** a **deep** collapse of how reasons and development fit together across the full essay, that is **not** enough for \`***\` — treat as **\`**\`** or lower and say so explicitly.
- **\`**\`** — Shuffling causes **limited** damage: e.g. **minor** connector or transition strain, or **some** awkwardness at paragraph **openings**, but the **main claims** could still be followed; order is **partly** but **not deeply** load-bearing for the **whole** argument.
- **\`*\`** — Shuffling **barely changes** how the essay reads → body blocks are **largely interchangeable** at macro level → **weak** global coherence between paragraphs.

\`shuffleTestPhase2Justification\`: **4–6 sentences**, examiner voice — if you assign \`***\`, you **must** point to **whole-essay** logic failure, not only topic-sentence-first effects.

---

## Output

Return **only** valid JSON matching the schema. No markdown outside JSON.

[Source text]

${s}

[Full essay]

${e}

[Body paragraphs]

${bodyList}`;
}

/**
 * @param {string} sourceText
 * @param {string} fullEssay
 * @param {{ intro: string, conclusion: string, bodyParagraphs: string[] }} meta
 */
function buildCriterionCEssayHolistic3IntroConclusionMessage(sourceText, fullEssay, meta) {
  const s = sourceText.trim();
  const e = fullEssay.trim();
  const introSlice = String(meta.intro || "").trim();
  const conclusionSlice = String(meta.conclusion || "").trim();
  const bodies = Array.isArray(meta.bodyParagraphs) ? meta.bodyParagraphs : [];
  const bodyList = bodies.map((p, i) => `--- Body ${i + 1} ---\n${String(p).trim()}`).join("\n\n");
  return `Criterion C — Whole-essay holistic check **3 of 3**: Introduction & conclusion protocol (IB Paper 1)

### Scope (NON-NEGOTIABLE — read first)

- **Introduction audit:** Judge **only** the **introduction paragraph** (the single opening paragraph before the first body paragraph). **Every** \`introRating\`, \`introChecklistTable\` row, \`verbatimEvidence\`, and **all** reasoning for the intro **must** refer **exclusively** to text that appears **inside that introduction paragraph**. **Do not** use body paragraphs, the conclusion, or material outside the intro paragraph to score or justify the intro. If you need boundaries, use the full essay **only** to **identify** where the introduction paragraph begins and ends — then **ignore** everything else for intro work.
- **Conclusion audit:** Judge **only** the **conclusion paragraph** (the closing paragraph after the last body paragraph). **Every** \`conclusionRating\`, \`conclusionChecklistTable\` row, \`verbatimEvidence\`, and **all** reasoning for the conclusion **must** refer **exclusively** to text **inside that conclusion paragraph**. **Do not** use the intro, body paragraphs, or any other span to score or justify the conclusion. Use the full essay **only** to **locate** the conclusion paragraph — then **ignore** everything else for conclusion work.
- Violating this scope (e.g. citing body-only content as “evidence” for intro, or inferring intro quality from the essay as a whole) is a **failed** response.

You are an **experienced IB English A examiner**. Output **only** valid JSON matching the schema.

---

## Essay completeness — **incomplete** label (Y / N)

Set **\`essayIncomplete\`** (boolean):

- **\`true\`** — The student essay **as a whole** appears **not finished**: e.g. **abrupt cutoff**, **mid-sentence truncation**, **no real closing**, obvious **draft** / placeholder ending, or structure that **clearly** lacks an intended conclusion.
- **\`false\`** — The essay **appears complete as submitted** (even if quality is weak or short).

Use the **full essay** **only** to decide this **single** flag. **Do not** use whole-essay reading to score intro/conclusion checklists (those stay paragraph-limited per scope above). This flag is **independent** of \`introRating\` / \`conclusionRating\`.

Also fill **\`essayIncompleteNote\`**: **1–2 sentences** stating **why** you chose true or false (what signals incomplete vs complete).

**When \`essayIncomplete\` is \`true\`** (essay not finished), you **must** also report:

- **\`essayIncompleteSeverity\`**: **Severity** of the incompleteness in **one short phrase** (name the level: **minor**, **moderate**, or **severe**, then add a brief clause — e.g. *severe — mid-paragraph truncation with no conclusion*). Be specific to what is missing or broken.
- **\`essayIncompleteRecommendedPenaltyIbMarks\`**: **Recommended mark subtraction (if any)** for this incompleteness **alone** — **0 to 2** in **steps of 0.5** (deduction on the IB Criterion C scale, not the student’s final mark). **0** = no subtraction. **0.5** = borderline / very mild incompleteness signals. **1–1.5** = **less severe** structural problems — e.g. a **mid-paragraph cutoff** that still leaves most of the essay readable, or moderate drafting gaps. **2 (severe)** = reserve for **missing paragraph(s)** (e.g. no conclusion or no body where expected), **severe mid-paragraph cutoff**, **length clearly too short** for the task, or other **severe violations** of a finished response. **Never** exceed **2**. Advisory for the human examiner.

**When \`essayIncomplete\` is \`false\`**: set **\`essayIncompleteSeverity\`** to exactly **\`n/a\`** and **\`essayIncompleteRecommendedPenaltyIbMarks\`** to **\`0\`**.

---

## INTRODUCTION — rules (NON-NEGOTIABLE) — **intro paragraph text only**

A strong intro **must** (collectively), **as evidenced only within the introduction paragraph**:

1. **Author + text anchor** — State the **author’s name**, the **excerpt / passage** (or equivalent anchor to the unseen), and the **genre** (or defensible genre signal).
2. **Main content summary** — Brief (not detailed) **summary of what the excerpt is about** (situation / content).
3. **Broad → narrow** — Move from **broad context** toward a **controlling thesis** that fits the text through interpretation.
4. **Valid thesis** — A **defensible interpretive thesis** (not prompt-echo alone).
5. **Academic register at the opening** — **Must NOT** lead with a **non-academic hook**: e.g. **hilarious rhetorical question**, **personal anecdote**, or attention-grabber **without academic register**. (A restrained rhetorical move can be OK if register stays academic — use judgment.)

### Intro scoring (\`introRating\`): **\`*\`**, **\`**\`**, **\`***\`**

- If the **introduction is absent** (no identifiable opening before body argument): set \`introAbsent\`: **true**, \`introRating\`: **\`*\`**, explain in checklist rows and justification.
- Otherwise: **start at \`***\`**. For **each major violation** of the protocols above, **remove one \`*\`** (e.g. *** → ** → *). **Lowest possible is \`*\`.** List demotions in \`introMajorViolations\`.

### Intro checklist table (\`introChecklistTable\`)

Output **exactly 8 rows**, **one per** \`protocolKey\` **in this order**:

| protocolKey | What to audit |
|-------------|----------------|
| AUTHOR_NAME | Author named (verbatim evidence). |
| EXCERPT_OR_PASSAGE | Excerpt / passage / text anchor clear. |
| GENRE | Genre identified or clearly signaled. |
| MAIN_CONTENT_SUMMARY | Brief content summary present. |
| MESSAGE_OR_INTERPRETIVE_STAKES | Interpretive message / stakes (not plot-only). |
| BROAD_TO_NARROW_TO_THESIS | Moves from broader context toward thesis. |
| VALID_THESIS | Thesis is valid / arguable (not descriptive-only / prompt-echo). |
| ACADEMIC_OPENING_REGISTER | Opening is academic — **not** cheap hook / hilarious rhetorical Q / anecdote opening. |

Each row: \`protocolLabel\`, \`met\` (boolean), \`verbatimEvidence\` (student **verbatim** substrings taken **only** from the **introduction paragraph** — never from body or conclusion), \`reasoning\` (must not depend on content outside the intro paragraph).

---

## CONCLUSION — rules (NON-NEGOTIABLE) — **conclusion paragraph text only**

Apply **only** to the **conclusion paragraph** (see scope above). **Do not** judge conclusion quality using the intro or body.

1. **Thesis** — Must **restate or refine** the thesis in some form (**as seen in the conclusion paragraph**).
2. **No new substantive quotation** — Must **NOT** introduce **new** quotes of **more than three words** (substantive new quotation / new cited material) **in the conclusion paragraph**. (Minor echo of thesis wording is different from importing new textual evidence.)
3. **No new technique/theme analysis** — Must **NOT** introduce **new** analytical lines in the conclusion (new technique focus, new theme thread). Assess using **only** what appears in the conclusion paragraph; do not “excuse” violations by reference to the body.
4. **Broader message / lens** — Must **propose** a **broader message**, **thematic lens**, or **more sophisticated** insight — **without** importing **context that cannot be fairly inferred** from the passage + what the conclusion paragraph itself states.

### Conclusion scoring (\`conclusionRating\`)

- If **conclusion absent**: \`conclusionAbsent\`: **true**, \`conclusionRating\`: **\`*\`**, explain.
- Else: **start at \`***\`**, **remove one \`*\` per major violation**, minimum \`*\`. List in \`conclusionMajorViolations\`.

### Conclusion checklist table (\`conclusionChecklistTable\`)

**Exactly 4 rows**, **in this order**:

| protocolKey | What to audit |
|-------------|----------------|
| THESIS_RESTART_OR_REFINEMENT | Thesis restated or refined. |
| NO_NEW_SUBSTANTIVE_QUOTES_OVER_THREE_WORDS | No new long / substantive quotes (rule as stated). |
| NO_NEW_TECHNIQUE_OR_THEME_INTRODUCTION | No new technique/theme lines. |
| BROADER_MESSAGE_OR_LENS_WITHOUT_INVALID_CONTEXT | Broader lens without invalid uninferred context. |

Each row: \`protocolLabel\`, \`met\`, \`verbatimEvidence\` (**only** from the **conclusion paragraph**), \`reasoning\` (**only** about that paragraph).

---

## Output fields (summary)

- \`essayIncomplete\`, \`essayIncompleteNote\`, \`essayIncompleteSeverity\`, \`essayIncompleteRecommendedPenaltyIbMarks\` — see **Essay completeness** above (required).
- \`introOverallJustification\`, \`conclusionOverallJustification\`: **4–7 sentences** each, examiner voice, tied to checklist + star demotions — **intro justification must cite nothing outside the intro paragraph; conclusion justification nothing outside the conclusion paragraph.**

---

## Inputs

[Source text] (context for understanding the task — **do not** smuggle body-level judgment into intro/conclusion scores)

${s}

[Full student essay — use **only** to delimit which text is the intro paragraph vs body vs conclusion; **scores and evidence must still come solely from the intro and conclusion paragraphs respectively**]

${e}

[Classifier intro slice — must match the **introduction paragraph** you audit; if mismatch, re-segment from full essay]

${introSlice || "(empty — derive intro paragraph from full essay)"}

[Classifier conclusion slice — must match the **conclusion paragraph** you audit]

${conclusionSlice || "(empty — derive conclusion paragraph from full essay)"}

[Body paragraphs — **boundary reference only**. **Do not** quote, score, or justify intro/conclusion using this text.]

${bodyList}`;
}

/**
 * @param {string} s
 * @param {number} max
 */
function truncCriterionCEssayFinalDigest(s, max) {
  const t = String(s ?? "").trim();
  if (!t) return "—";
  const cap = Math.max(
    CRITERION_C_FINAL_DIGEST_FIELD_MAX,
    typeof max === "number" && Number.isFinite(max) && max > 0 ? max : 0
  );
  if (t.length <= cap) return t;
  return `${t.slice(0, cap)}…`;
}

const CRITERION_C_OFFICIAL_DESCRIPTOR_BY_LEVEL = {
  0: "The work does not reach a standard described by the descriptors below.",
  1: "Little organization is apparent in the presentation of ideas. No discernible focus is apparent in the analysis.",
  2: "Some organization is apparent in the presentation of ideas. There is little focus in the analysis.",
  3: "The presentation of ideas is adequately organized in a generally coherent manner. There is some focus in the analysis.",
  4: "The presentation of ideas is well organized and mostly coherent. The analysis is adequately focused.",
  5: "The presentation of ideas is effectively organized and coherent. The analysis is well focused.",
};

const CRITERION_C_IB_OFFICIAL_RUBRIC_BLOCK = `Criterion C: Focus and Organization
— How well organized, coherent and focused is the presentation of ideas?

0 — ${CRITERION_C_OFFICIAL_DESCRIPTOR_BY_LEVEL[0]}

1 — ${CRITERION_C_OFFICIAL_DESCRIPTOR_BY_LEVEL[1]}

2 — ${CRITERION_C_OFFICIAL_DESCRIPTOR_BY_LEVEL[2]}

3 — ${CRITERION_C_OFFICIAL_DESCRIPTOR_BY_LEVEL[3]}

4 — ${CRITERION_C_OFFICIAL_DESCRIPTOR_BY_LEVEL[4]}

5 — ${CRITERION_C_OFFICIAL_DESCRIPTOR_BY_LEVEL[5]}`;

/**
 * Essay-mode final examiner input: per-body pipeline commentary and star bands, holistics — **no student verbatim text**.
 * @param {object | null | undefined} parentBundle
 */
function buildCriterionCEssayFinalIbExaminerDigest(parentBundle) {
  const bundles = Array.isArray(parentBundle?.criterionCEssayParagraphBundles)
    ? parentBundle.criterionCEssayParagraphBundles
    : [];
  const lines = [
    "=== Criterion C — Final IB examiner digest (essay — graded body paragraphs + whole-essay holistics) ===",
    "",
    "**No student text** is included below — only model commentary, ratings, and formula marks.",
    "",
  ];

  const meanParts = [];
  for (const sub of bundles) {
    const m = getCriterionCFinalIbMarkFromBundle(sub);
    if (m != null && Number.isFinite(m)) meanParts.push(m);
  }
  const meanMark =
    meanParts.length > 0 && typeof meanScoresClampToNearestHalfStep === "function"
      ? meanScoresClampToNearestHalfStep(meanParts)
      : null;
  lines.push(
    `Pre-computed mean of per-body formula IB marks (informational): ${meanMark != null ? (Number.isInteger(meanMark) ? String(meanMark) : meanMark.toFixed(1)) : "—"} / 5`
  );
  lines.push("");

  for (let i = 0; i < bundles.length; i++) {
    const sub = bundles[i];
    lines.push(`--- Body paragraph ${i + 1} — pipeline summary (no verbatim student text) ---`);
    const fm = getCriterionCFinalIbMarkFromBundle(sub);
    lines.push(`Final IB mark from four-tier formula (this body): ${fm != null ? (Number.isInteger(fm) ? String(fm) : fm.toFixed(1)) : "—"} / 5`);
    const lora = sub?.criterionCLoraData;
    const loras = Array.isArray(lora?.bodyParagraphs) ? lora.bodyParagraphs : [];
    for (let bi = 0; bi < loras.length; bi++) {
      const b = loras[bi];
      const p1 = String(b.phase1ScoreStars ?? "").trim() || criterionCLoraTier123ToStarBand(normalizeCriterionCLoraTier123(b.lineOfReasoningClarityScore));
      const p2 = String(b.phase2ScoreStars ?? "").trim() || criterionCLoraTier123ToStarBand(normalizeCriterionCLoraTier123(b.thematicConsistencyScore));
      lines.push(`  Block ${bi + 1} — Phase 1 (line of reasoning): ${p1}`);
      lines.push(`    Commentary: ${truncCriterionCEssayFinalDigest(b.phase1ClarityOfShifts, 420)}`);
      lines.push(`    Pivot note: ${truncCriterionCEssayFinalDigest(b.phase1PivotNote, 320)}`);
      lines.push(`    Phase 1 reasoning: ${truncCriterionCEssayFinalDigest(b.phase1ScoreReasoning ?? b.lineOfReasoningClarityJustification, 520)}`);
      lines.push(`  Block ${bi + 1} — Phase 2 (thematic consistency): ${p2}`);
      lines.push(`    Phase 2 reasoning: ${truncCriterionCEssayFinalDigest(b.phase2ScoreReasoning ?? b.thematicConsistencyJustification, 520)}`);
    }
    const tang = sub?.criterionCTangentData;
    const tblocks = Array.isArray(tang?.bodyParagraphs) ? tang.bodyParagraphs : [];
    for (let bi = 0; bi < tblocks.length; bi++) {
      const tb = tblocks[bi];
      const ts = String(tb.tangentRepetitionScoreStars ?? "").trim() || criterionCLoraTier123ToStarBand(normalizeCriterionCLoraTier123(tb.tangentRepetitionScore));
      lines.push(`  Block ${bi + 1} — Tangent / repetition: ${ts}`);
      lines.push(`    Audit summary: ${truncCriterionCEssayFinalDigest(tb.auditSummary, 480)}`);
      lines.push(`    Tangent reasoning: ${truncCriterionCEssayFinalDigest(tb.tangentRepetitionScoreReasoning, 520)}`);
    }
    const mod = sub?.criterionCModeratorData;
    if (mod && typeof mod === "object") {
      const sf = normalizeCriterionCLoraTier123(mod.strategicFocusScore);
      const sfStars = criterionCLoraTier123ToStarBand(sf);
      lines.push(`  Strategic focus (step 3): ${sfStars}`);
      lines.push(`    Gloss check: ${truncCriterionCEssayFinalDigest(mod.glossCheckNotes, 400)}`);
      lines.push(`    Depth check: ${truncCriterionCEssayFinalDigest(mod.depthCheckNotes, 400)}`);
      lines.push(`    Uniformity: ${truncCriterionCEssayFinalDigest(mod.uniformityPenaltyNotes, 400)}`);
      lines.push(`    Low focus flag: ${mod.lowFocusFlag === true ? "yes" : mod.lowFocusFlag === false ? "no" : "—"}`);
      lines.push(`    Strategic justification: ${truncCriterionCEssayFinalDigest(mod.strategicFocusJustification, 520)}`);
    }
    lines.push("");
  }

  const chk = parentBundle?.criterionCEssayHolisticChecks;
  lines.push("### Whole-essay holistics (ratings + justifications — student verbatim fields omitted)");
  if (chk && typeof chk === "object") {
    const h1 = chk.thesisAndTopicsConsistency;
    if (h1 && typeof h1 === "object") {
      lines.push("--- Holistic 1 — Thesis and topics consistency ---");
      lines.push(`Thesis status: ${h1.thesisStatus != null ? String(h1.thesisStatus) : "—"}`);
      lines.push(`Note: ${truncCriterionCEssayFinalDigest(h1.thesisStatusNote, 400)}`);
      lines.push(`Rating: ${h1.thesisTopicsConsistencyRating != null ? String(h1.thesisTopicsConsistencyRating) : "—"}`);
      lines.push(`Justification: ${truncCriterionCEssayFinalDigest(h1.thesisTopicsConsistencyJustification, 900)}`);
      const bullets = Array.isArray(h1.readerContractBullets) ? h1.readerContractBullets : [];
      if (bullets.length) {
        lines.push("Reader contract (per body, paraphrased expectations):");
        bullets.forEach((bb, j) => lines.push(`  ${j + 1}. ${truncCriterionCEssayFinalDigest(bb, 320)}`));
      }
      const rows = Array.isArray(h1.thesisVsParagraphsTable) ? h1.thesisVsParagraphsTable : [];
      for (const row of rows) {
        const idx = row.bodyParagraphIndex1Based != null ? String(row.bodyParagraphIndex1Based) : "—";
        lines.push(
          `  Table row (body ${idx}): promise vs delivery — ${truncCriterionCEssayFinalDigest(row.lineOfReasoningComparison, 400)}`
        );
      }
    }
    const h2 = chk.paragraphSwappingMacroStructure;
    if (h2 && typeof h2 === "object") {
      lines.push("--- Holistic 2 — Macro structure & shuffle test ---");
      lines.push(`Structure type: ${h2.argumentativeStructureType != null ? String(h2.argumentativeStructureType) : "—"}`);
      lines.push(`Order/role summary: ${truncCriterionCEssayFinalDigest(h2.bodyParagraphOrderAndRoleSummary, 500)}`);
      lines.push(`Structure reasoning: ${truncCriterionCEssayFinalDigest(h2.argumentativeStructureReasoning, 600)}`);
      lines.push(`Phase 1 (structure) rating: ${h2.macroStructurePhase1Rating != null ? String(h2.macroStructurePhase1Rating) : "—"}`);
      lines.push(`Phase 1 justification: ${truncCriterionCEssayFinalDigest(h2.macroStructurePhase1Justification, 700)}`);
      lines.push(`Phase 2 (shuffle) rating: ${h2.shuffleTestPhase2Rating != null ? String(h2.shuffleTestPhase2Rating) : "—"}`);
      lines.push(`Phase 2 justification: ${truncCriterionCEssayFinalDigest(h2.shuffleTestPhase2Justification, 700)}`);
    }
    const h3 = chk.introAndConclusionCheck;
    if (h3 && typeof h3 === "object") {
      lines.push("--- Holistic 3 — Introduction & conclusion ---");
      lines.push(`Essay incomplete (flag): ${h3.essayIncomplete === true ? "true" : h3.essayIncomplete === false ? "false" : "—"}`);
      lines.push(`Essay incomplete note: ${truncCriterionCEssayFinalDigest(h3.essayIncompleteNote, 400)}`);
      lines.push(
        `Essay incomplete severity: ${h3.essayIncompleteSeverity != null ? String(h3.essayIncompleteSeverity).trim() : "—"}`
      );
      const pen = h3.essayIncompleteRecommendedPenaltyIbMarks;
      const penAdj =
        pen != null && Number.isFinite(Number(pen))
          ? Math.min(2, Math.max(0, normalizeFinalCriterionCMark(pen) ?? Number(pen)))
          : null;
      lines.push(
        `Essay incomplete recommended mark subtraction (0–2 IB marks, incompleteness only): ${
          penAdj != null ? String(penAdj) : "—"
        }`
      );
      lines.push(`Intro absent: ${h3.introAbsent === true ? "true" : h3.introAbsent === false ? "false" : "—"}`);
      lines.push(`Intro rating: ${h3.introRating != null ? String(h3.introRating) : "—"}`);
      lines.push(`Intro overall: ${truncCriterionCEssayFinalDigest(h3.introOverallJustification, 800)}`);
      const introRows = Array.isArray(h3.introChecklistTable) ? h3.introChecklistTable : [];
      for (const row of introRows) {
        lines.push(
          `  Intro checklist ${row.protocolKey != null ? String(row.protocolKey) : "—"}: met=${row.met === true ? "true" : row.met === false ? "false" : "—"} · ${truncCriterionCEssayFinalDigest(row.reasoning, 280)}`
        );
      }
      lines.push(`Conclusion absent: ${h3.conclusionAbsent === true ? "true" : h3.conclusionAbsent === false ? "false" : "—"}`);
      lines.push(`Conclusion rating: ${h3.conclusionRating != null ? String(h3.conclusionRating) : "—"}`);
      lines.push(`Conclusion overall: ${truncCriterionCEssayFinalDigest(h3.conclusionOverallJustification, 800)}`);
      const conRows = Array.isArray(h3.conclusionChecklistTable) ? h3.conclusionChecklistTable : [];
      for (const row of conRows) {
        lines.push(
          `  Conclusion checklist ${row.protocolKey != null ? String(row.protocolKey) : "—"}: met=${row.met === true ? "true" : row.met === false ? "false" : "—"} · ${truncCriterionCEssayFinalDigest(row.reasoning, 280)}`
        );
      }
    }
  } else {
    lines.push("(Holistic checks missing.)");
  }

  return lines.join("\n");
}

/**
 * @param {string} digestText
 */
function buildCriterionCEssayFinalIbExaminerMessage(digestText) {
  const d = String(digestText || "").trim();
  return `Criterion C — Final IB examiner assignment (whole essay, essay mode)

Role: You are an experienced IB English A examiner with 20+ years of experience focusing **only** on Criterion C. Based on **all** evidence in the digest, assign a **best-fit holistic score** for the **whole essay** — **0–5**, in **0.5** steps **only** when you are genuinely torn between two adjacent official bands.

${CRITERION_C_IB_OFFICIAL_RUBRIC_BLOCK}

---

**Input rules (already applied to the digest):**

- You receive **each body paragraph’s** pipeline commentary, the four **\`*\` / \`**\` / \`***\`** tier ratings with justification excerpts, and each body’s **formula** IB mark **/5**.
- You receive **each whole-essay holistic check** (thesis/topics, structure & shuffle, intro & conclusion) with ratings and justifications.
- The digest contains **no student text** — do not infer from unseen wording.

**How to combine evidence:**

- Give approximately **50%** weight to **paragraph-level** evidence in the digest and **50%** to **whole-essay holistics**. Treat **line of reasoning** and **thesis** alignment as more important to how **introduction** and **conclusion** perform, but **structural integrity** (macro order, shuffle test, coherence across bodies) still matters materially.

**Typical student performance (calibration — not a mechanical formula; anchor on the official descriptors):**

- **5:** A mix of **4**s and **5**s at paragraph level, with **5**s dominant and significant, many **\`***\`**-level signals; holistics generally strong.
- **4:** Majority **4**s, few **3**s and **5**s; **\`*\`** at paragraph level **≤ ~25%**; mix of **\`**\`** and **\`***\`** holistics.
- **3:** Mix of **3**s and **4**s, more **3**s; majority **\`**\`**-level paragraph signals.
- **2:** Mix of **2**s and **3**s; mix of **\`*\`** and **\`**\`**.
- **1:** Mix of **1**s and **2**s; many **\`*\`**; breakdown in significant areas.
- **0:** Does not reach **1**.

Use holistic judgment, anchor to the **rubric**, and consider typical performance patterns.

**examinerReport:** **Exactly 5 or 6 sentences.** Criterion C only. Tie reasoning to **exact rubric language** (e.g. "effectively organized and coherent", "adequately organized in a generally coherent manner", "little focus in the analysis"). State the final mark clearly at least once.

---

**Digest (all evidence you may use):**

${d}

---

Output **only** valid JSON matching the schema: **score** and **examinerReport**. No markdown fences, no text outside the JSON.`;
}

/** No-op: legacy Criterion C tooltips removed. */
function hideCriterionCTooltip() {}

/* ——— Legacy Criterion C (multi-agent) helpers — kept for PDF export of old saved bundles ——— */

/**
 * @param {unknown} n
 * @returns {number | null}
 */
function normalizeCriterionCAgent1Score(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const r = Math.round(x);
  if (r < 1 || r > 4) return null;
  return r;
}

function normalizeCriterionCAgent2Score(n) {
  return normalizeCriterionCAgent1Score(n);
}

function normalizeCriterionCAgent3Score(n) {
  return normalizeCriterionCAgent1Score(n);
}

function normalizeCriterionCAgent4Score(n) {
  return normalizeCriterionCAgent1Score(n);
}

/**
 * @param {object} step1Data
 * @returns {number | null}
 */
function computeCriterionCStep1DisplayScore(step1Data) {
  const paras = Array.isArray(step1Data?.bodyParagraphs) ? step1Data.bodyParagraphs : [];
  if (!paras.length) return null;
  const scores = [];
  for (const p of paras) {
    const g = p.criterionC_agent1_score;
    const v = normalizeCriterionCAgent1Score(g && g.score);
    if (v != null) scores.push(v);
  }
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

function computeCriterionCStep2DisplayScore(step2Data) {
  const paras = Array.isArray(step2Data?.bodyParagraphs) ? step2Data.bodyParagraphs : [];
  if (!paras.length) return null;
  const scores = [];
  for (const p of paras) {
    const g = p.criterionC_agent2_score;
    const v = normalizeCriterionCAgent2Score(g && g.score);
    if (v != null) scores.push(v);
  }
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

function computeCriterionCStep3DisplayScore(step3Data) {
  const paras = Array.isArray(step3Data?.bodyParagraphs) ? step3Data.bodyParagraphs : [];
  if (!paras.length) return null;
  const scores = [];
  for (const p of paras) {
    const g = p.criterionC_agent3_score;
    const v = normalizeCriterionCAgent3Score(g && g.score);
    if (v != null) scores.push(v);
  }
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

function computeCriterionCStep4DisplayScore(step4Data) {
  const paras = Array.isArray(step4Data?.bodyParagraphs) ? step4Data.bodyParagraphs : [];
  if (!paras.length) return null;
  const scores = [];
  for (const p of paras) {
    const g = p.criterionC_agent4_score;
    const v = normalizeCriterionCAgent4Score(g && g.score);
    if (v != null) scores.push(v);
  }
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

/**
 * @param {string} raw
 * @returns {"STALL" | "DERAIL" | ""}
 */
function normalizeStallIssueType(raw) {
  const u = String(raw || "")
    .trim()
    .toUpperCase();
  if (u === "STALL" || u === "REPETITION") return "STALL";
  if (u === "DERAIL" || u === "TANGENT") return "DERAIL";
  return "";
}
