/**
 * Gemini API: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * Default model: see DEFAULT_GEMINI_MODEL_ID; user may override via #modelSelect.
 * Supported IDs: gemini-3.1-flash-lite-preview, gemini-3-flash-preview, gemini-3.1-pro-preview,
 * gemma-4-31b-it (official Gemma on Gemini API ID, see https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api).
 * Grading `callGemini` calls use `generationConfig.temperature` **1.0** by default; paragraph/essay classifiers pass **0.5** in their own module. Extended thinking is not sent unless a caller passes `thinkingConfig` (see `callGemini`). Structured JSON grading uses **`GEMINI_MAX_OUTPUT_TOKENS_JSON`** (65536) for `maxOutputTokens` unless overridden.
 */

const DEFAULT_GEMINI_MODEL_ID = "gemma-4-31b-it";
const STORAGE_GEMINI_MODEL_KEY = "ib_paper1_gemini_model_id";
const STORAGE_KEY = "ib_paper1_gemini_api_key";
/** Draft source + paragraph — persist across navigation until Clear all. */
const STORAGE_DRAFT_SOURCE = "ib_paper1_draft_source_text";
const STORAGE_DRAFT_PARAGRAPH = "ib_paper1_draft_student_paragraph";
/** Saved Criterion A run (tile + detail); persists until Clear all. */
const CRITERION_A_BUNDLE_KEY = "ib_paper1_criterion_a_bundle_v1";
/** Saved Criterion B run (tile + detail); persists until Clear all. */
const CRITERION_B_BUNDLE_KEY = "ib_paper1_criterion_b_bundle_v1";
/** Saved Criterion C run (tile + detail); persists until Clear all. Steps 1–3: LORA → Tangent/Repetition → moderator (v4 bundle). */
const CRITERION_C_BUNDLE_KEY = "ib_paper1_criterion_c_bundle_v1";
/** Saved Criterion D run (tile + detail); `version: 3` only — steps 1–3 agent subscores 0–5 + step 4 moderator 0–5. */
const CRITERION_D_BUNDLE_KEY = "ib_paper1_criterion_d_bundle_v3";
/** Persisted final IB overall moderation (Gemini pass on Reveal final score). Cleared with dashboard reset. */
const IB_OVERALL_MODERATION_KEY = "ib_paper1_overall_final_moderation_v1";

/**
 * Unified high ceiling for `generationConfig.maxOutputTokens` on structured JSON grading
 * (Criteria A–D, IB overall moderation). Reduces mid-stream truncation of valid JSON.
 */
const GEMINI_MAX_OUTPUT_TOKENS_JSON = 65536;

/** Small structured JSON (e.g. paragraph vs essay classification). */
const GEMINI_MAX_OUTPUT_TOKENS_JSON_COMPACT = 16384;

/** Criterion B — final examiner digest caps (characters into the model, not token output). */
const CRITERION_B_FINAL_DIGEST_MAX_STEP3_SINGLE = 8000;
const CRITERION_B_FINAL_DIGEST_MAX_STEP2_SINGLE = 80000;
const CRITERION_B_FINAL_DIGEST_MAX_BODY_STEP3 = 8000;
const CRITERION_B_FINAL_DIGEST_MAX_BODY_STEP2 = 80000;
const CRITERION_B_FINAL_DIGEST_MAX_HOLISTIC_JUST = 8000;

/** Criterion C — essay final examiner digest fields (characters; single cap for consistency). */
const CRITERION_C_FINAL_DIGEST_FIELD_MAX = 12000;

const EXAMINER_PROMPT = `Role: You are an expert IB English A: Literature OR Lang&Lit Examiner with 20+ years of experience. Your specialty is Criterion A: Understanding and Interpretation.

Task: Analyze the provided [Source Text] and generate a tiered benchmark of potential student responses. Your output will be used to calibrate an AI grading system.

Instructions:
Please provide the following four components based on the [Source Text]:

Grounding requirement: Everything you write must be clearly and correctly inferable from the [Source Text] alone. Do not invent details, claims, or interpretations that the passage does not support; do not hallucinate meanings or intentions that the author did not signal in the words on the page.

1. Basic/Descriptive Outline (Level 1-2 Understanding)

Provide 5 bullet points that capture only the literal plot, surface-level setting, and obvious character actions.

Focus on the "What" without any "Why."

2. Competent/Analytical Perceptions (Level 3-4 Understanding)

Provide 10 bullet points representing a student who understands implied meaning.

These should cover:

Thematic connections (e.g., how the setting reflects a mood).

Clear character motivations.

Recognition of the "Guided Question" or the main conflict.

Some interpretation or inferences, but that is likely common

Competent implied meanings

3. Perceptive & Nuanced Insights (Level 5 Understanding)

Provide 8 bullet points demonstrating "insightful and convincing" interpretation.

Focus on:

Ambiguity: Where the text purposefully leaves things unclear.

Paradox/Tension: Conflicting emotions or contradictory values.

Subtext: Nuances that require connecting small, subtle patterns across the whole text.

Context/Themes: Appearant from the text, references to larger backgrounds or societal trends or implications

Use of Irony, if applicable

-Nuance of characters and settings and message, like things that are not exactly straightforward or most literal interpretation

Dont need bolded subtitles and dont need to show all of these, cover the main points of the text

4. Frequent Misinterpretations & Logic Breakdowns

List specific places where students are likely to:

Over-read: Force a theme (like "The Industrial Revolution") onto a text where it doesn't belong.

Misread Tone: Take irony literally or miss a satirical edge.

Cherry-pick: Use one minor detail to support a massive claim that the rest of the text contradicts.

Include about 5-6 main/most common bullet points that covers main misunderstandings, dont need bolded subtitles and dont need to show all of these

CRITICAL EVALUATION RULE:
Explicitly state at the end of your response: "Students may provide valid points not listed in these benchmarks; however, markers must take extra care to verify if those points are logically supported by the text. Interpretations must be dismissed if they are contrived from outside knowledge, biographical tangents, or minor details that do not align with clear authorial intent."

*Output exactly in this format, dont change the headings or required number of bullet points. Say this is a Criterion A Benchmark at the beginning.
*Use markdown and bold the headings of each of the 4 sections, include a horizontal linebreak before critical evaluation rule.
[Source Text]:`;

function buildBenchmarkMessage(sourceText) {
  return `${EXAMINER_PROMPT}\n\n${sourceText.trim()}`;
}

/** Allowed per-set holistic multipliers (AI-assigned from precision + evidence + reasoning). */
const CRITERION_A_HOLISTIC_COEFFICIENTS = Object.freeze([1.2, 1.0, 0.8, 0.4, 0.0]);

/**
 * @param {unknown} n
 * @returns {number | null}
 */
function normalizeCriterionAHolisticCoefficient(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  for (const c of CRITERION_A_HOLISTIC_COEFFICIENTS) {
    if (Math.abs(x - c) < 1e-6) return c;
  }
  let best = CRITERION_A_HOLISTIC_COEFFICIENTS[0];
  let bestD = Math.abs(x - best);
  for (const c of CRITERION_A_HOLISTIC_COEFFICIENTS) {
    const d = Math.abs(x - c);
    if (d < bestD - 1e-9) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/**
 * Application-computed holistic score per analytical set (Criterion A paragraph audit).
 * **Current:** holistic = insight × **criterionAHolisticCoefficient**, clamped to max 3.0 (min 0), where the coefficient is one of 1.2, 1.0, 0.8, 0.4, 0.0 (AI-assigned).
 * **Legacy (bundles without coefficient):** insight × (precision + evidenceQuality + reasoning) / 7.5 with evidence 0–2 and reasoning 0–4.
 * @param {object} set
 * @returns {number | null}
 */
function computeCriterionASetHolisticScore(set) {
  const insight = Number(set?.insight);
  if (!Number.isFinite(insight)) return null;
  const coef = normalizeCriterionAHolisticCoefficient(set?.criterionAHolisticCoefficient);
  if (coef != null) {
    const raw = insight * coef;
    const clamped = Math.max(0, Math.min(3, raw));
    return Math.round(clamped * 1000) / 1000;
  }
  const precision = Number(set?.precision);
  let evidence = Number(set?.evidenceQuality);
  let reasoning = Number(set?.reasoning);
  if (![precision, evidence, reasoning].every((n) => Number.isFinite(n))) return null;
  evidence = Math.max(0, Math.min(2, evidence));
  reasoning = Math.max(0, Math.min(4, reasoning));
  const rawLegacy = (insight * (precision + evidence + reasoning)) / 7.5;
  const clampedLegacy = Math.max(0, Math.min(3, rawLegacy));
  return Math.round(clampedLegacy * 1000) / 1000;
}

/**
 * @param {number} holistic
 * @returns {"excellent" | "strong" | "mediocre" | "poor" | null}
 */
function criterionAHolisticBandFromScore(holistic) {
  if (holistic == null || !Number.isFinite(holistic)) return null;
  if (holistic > 2.5) return "excellent";
  if (holistic >= 1.8) return "strong";
  if (holistic >= 1.3) return "mediocre";
  return "poor";
}

/** Allowed step-2 overall grades (half-step only at 4.5). */
const CRITERION_A_STEP2_SCORE_ALLOWED = Object.freeze([0, 1, 2, 3, 4, 4.5, 5]);

/**
 * @param {unknown} n
 * @returns {number | null}
 */
function normalizeCriterionAStep2Score(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const clamped = Math.max(0, Math.min(5, x));
  let best = CRITERION_A_STEP2_SCORE_ALLOWED[0];
  let bestD = Math.abs(clamped - best);
  for (const v of CRITERION_A_STEP2_SCORE_ALLOWED) {
    const d = Math.abs(clamped - v);
    if (d < bestD - 1e-9) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

/**
 * Derive **reasoning** (0–4) from sub-scores when all present; normalize sub-scores to valid ranges.
 * @param {object} set
 */
function syncCriterionASetReasoningFromComponents(set) {
  if (!set || typeof set !== "object") return;
  const a = Number(set.reasoningDeducibleConclusion);
  const b = Number(set.reasoningPreciseConceptWording);
  const c = Number(set.reasoningLinearCoherence);
  if (![a, b, c].every((n) => Number.isFinite(n))) return;
  const aa = Math.max(0, Math.min(2, Math.round(a)));
  const bb = Math.max(0, Math.min(1, Math.round(b)));
  const cc = Math.max(0, Math.min(1, Math.round(c)));
  set.reasoningDeducibleConclusion = aa;
  set.reasoningPreciseConceptWording = bb;
  set.reasoningLinearCoherence = cc;
  set.reasoning = aa + bb + cc;
}

/**
 * @param {object} data Parsed paragraph audit (mutates sets with criterionASetHolisticScore).
 * @param {{ normalizeStep2?: boolean }} [options] If normalizeStep2 is false, only holistics are added (e.g. when loading saved bundles).
 */
function enrichCriterionAAuditDataWithHolisticScores(data, options = {}) {
  const normalizeStep2 = options.normalizeStep2 !== false;
  if (!data || typeof data !== "object") return;
  const sets = Array.isArray(data.sets) ? data.sets : [];
  let anyHolisticCoefficient = false;
  for (const s of sets) {
    syncCriterionASetReasoningFromComponents(s);
    const coefNorm = normalizeCriterionAHolisticCoefficient(s.criterionAHolisticCoefficient);
    if (coefNorm != null) {
      s.criterionAHolisticCoefficient = coefNorm;
      anyHolisticCoefficient = true;
    }
    const h = computeCriterionASetHolisticScore(s);
    if (h != null) s.criterionASetHolisticScore = h;
  }
  if (anyHolisticCoefficient) data.criterionAPerSetHolisticFormulaVersion = 2;
  if (!normalizeStep2) return;
  const g = data.criterionA_grade_step2;
  if (g && g.score != null) {
    const sn = normalizeCriterionAStep2Score(g.score);
    if (sn != null) g.score = sn;
  }
}

/**
 * Merge Step 2b (overall paragraph grade + brief per-set comments) into audit data.
 * Numeric per-set fields are taken from the audit (authoritative); briefComment from the model when present.
 * @param {object} data Parsed paragraph audit (mutated)
 * @param {object} step2Parsed Parsed JSON from the Step 2b verification pass
 */
function mergeCriterionAStep2OverallGradeIntoAudit(data, step2Parsed) {
  if (!data || typeof data !== "object" || !step2Parsed || typeof step2Parsed !== "object") return;
  const g = step2Parsed.criterionA_grade_step2;
  if (g && typeof g === "object") {
    data.criterionA_grade_step2 = {
      score: g.score,
      justification: g.justification != null ? String(g.justification) : "",
    };
  }
  const sets = Array.isArray(data.sets) ? data.sets : [];
  const byIndex = new Map();
  for (const row of Array.isArray(step2Parsed.setSummaries) ? step2Parsed.setSummaries : []) {
    const idx = Number(row?.setIndex);
    if (Number.isInteger(idx) && idx >= 0) byIndex.set(idx, row);
  }
  data.criterionA_step2SetSummaries = sets.map((s, i) => {
    const row = byIndex.get(i) || {};
    const h = computeCriterionASetHolisticScore(s);
    const band = h != null ? criterionAHolisticBandFromScore(h) : null;
    return {
      setIndex: i,
      insight: s.insight,
      precision: s.precision,
      evidenceQuality: s.evidenceQuality,
      reasoning: s.reasoning,
      criterionAHolisticCoefficient: s.criterionAHolisticCoefficient,
      applicationHolistic: h,
      band,
      briefComment: row.briefComment != null ? String(row.briefComment).trim() : "",
    };
  });
  data.criterionAStep2OverallGradePass = true;
}

/** JSON schema for Step 2b: overall paragraph grade from audit digest only (anti-hallucination pass). */
const CRITERION_A_STEP2_OVERALL_GRADE_SCHEMA = {
  type: "object",
  properties: {
    setSummaries: {
      type: "array",
      description:
        "One row per analytical set from the digest, same count and 0-based order as listed there. Each briefComment is grounded only in that set's digest line and the source excerpt—no new quotations or facts.",
      items: {
        type: "object",
        properties: {
          setIndex: {
            type: "integer",
            description: "0-based index matching the paragraph audit set list.",
          },
          briefComment: {
            type: "string",
            description:
              "One or two short sentences: how this set's score profile reads against its verbatim span. No long rubric repetition.",
          },
        },
        required: ["setIndex", "briefComment"],
      },
    },
    criterionA_grade_step2: {
      type: "object",
      description:
        "ONE overall Criterion A paragraph audit grade using Step 2 anchoring rules applied only to the digest (holistic formula + band balance). Score must be one of: 0, 1, 2, 3, 4, 4.5, 5 (4.5 only when justified).",
      properties: {
        score: {
          type: "number",
          description:
            "Exactly 0, 1, 2, 3, 4, 4.5, or 5. Use 4.5 only per prompt. No other decimals.",
        },
        justification: {
          type: "string",
          description:
            "Brief: how per-set holistics/bands from the digest (and any 4.5 use) led to this score. Do not invent sets or scores not in the digest.",
        },
      },
      required: ["score", "justification"],
    },
  },
  required: ["setSummaries", "criterionA_grade_step2"],
};

/** JSON schema for structured audit (Gemini controlled generation). */
const AUDIT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    excludedTopicSentence: {
      type: "string",
      description:
        "Exact text of the topic sentence ONLY (opening sentence that frames the argument). Must not be audited. Copy verbatim from the student paragraph including trailing space if needed for splitting.",
    },
    sets: {
      type: "array",
      description:
        "Claim+evidence sets after the topic sentence, in reading order. Group into ONE set whenever sentences discuss the SAME evidence (same quoted or paraphrased anchor from the passage): keep that evidence plus ALL following sentences that still unpack it in a single set. Start a NEW set as soon as the student introduces NEW evidence—e.g. a new quotation, a new cited extract, or a clearly different paraphrased anchor than the previous set’s evidence. Do not split quote from its trailing analysis into separate sets. Score insight, precision, evidenceQuality, and reasoning independently per set (do not cross-influence).",
      items: {
        type: "object",
        properties: {
          verbatim: {
            type: "string",
            description:
              "Exact contiguous substring from the student paragraph after the topic sentence (character-for-character). Often multi-sentence: must cover the evidence for this set (quote and/or paraphrase anchor) AND every following sentence that still discusses THAT same evidence; stop before any new quote or new evidence anchor (those begin the next set).",
          },
          insight: {
            type: "integer",
            description:
              "0 = no Level 1–3 benchmark fit, literal contradiction of source, or serious irrelevance. 1 = Level 1 benchmark (basic/descriptive) or same tier; quote-only or quote+vague gloss without abstract academic explanation in student's own words caps here. 2–3 ONLY if student adds explicit abstract implication/analysis in academic language before/after/between quotes—not literal recycling of passage diction alone. If precision=0 (literal contradiction), insight must be 0.",
          },
          precision: {
            type: "integer",
            description:
              "0 if claim contradicts the text's literal meaning. 1-3 otherwise: 3 main authorial intent; 2 partly valid; 1 misread without literal contradiction.",
          },
          evidenceType: {
            type: "string",
            description:
              "Q = direct quote, P = paraphrase only, QP = both. If and only if P (no quoted words as evidence in this set), evidenceQuality must be 0 or 1 — never 2.",
          },
          evidenceQuality: {
            type: "integer",
            minimum: 0,
            maximum: 2,
            description:
              "0–2 per Step 2 evidence rubric. P-only: max 1. Any single contiguous quoted extract >20 words: 0. Score 2 only if claim is directly inferable from quoted words alone, each contiguous extract used for score-2 tightness is about ≤9 words (8–9 target; >10 in any one contiguous extract forbids 2), precise choice; several separate short quotes do not add together for that limit—else max 1 unless 0.",
          },
          reasoningDeducibleConclusion: {
            type: "integer",
            minimum: 0,
            maximum: 2,
            description:
              "(a) Deducible conclusion: 0–2 per Step 2 reasoning rubric. Must match justificationReasoning section (a).",
          },
          reasoningPreciseConceptWording: {
            type: "integer",
            minimum: 0,
            maximum: 1,
            description:
              "(b) Precise concept and wording: 0–1 per Step 2 reasoning rubric. Must match justificationReasoning section (b).",
          },
          reasoningLinearCoherence: {
            type: "integer",
            minimum: 0,
            maximum: 1,
            description:
              "(c) Linear vs circular reasoning: 1 = linear, clear, each sentence follows the prior with clear purpose; 0 = circular, redundant, confusing, or assumes what it tries to prove. Must match justificationReasoning section (c).",
          },
          reasoning: {
            type: "integer",
            minimum: 0,
            maximum: 4,
            description:
              "Total reasoning score 0–4. MUST equal reasoningDeducibleConclusion + reasoningPreciseConceptWording + reasoningLinearCoherence exactly.",
          },
          criterionAHolisticCoefficient: {
            type: "number",
            description:
              "EXACTLY one of: 1.2, 1.0, 0.8, 0.4, 0.0. Assign AFTER scoring precision, evidenceQuality, and reasoning for this set: synthesize how those three dimensions work together (not mechanically from insight). 1.2 = all three dimensions essentially perfect for this set. 1.0 = all perfect except at most one small shortfall across the three (like 8/9). 0.8 = minor issues only—slight incoherence, no major evidence contradiction, no superficial collapse across the board; roughly 6–7/9 quality if imagined as a 9-point composite. 0.4 = superficial or limited reasoning, conclusion not immediately deducible from the chain, or one realm very weak. 0.0 = totally irrelevant evidence and/or reasoning for this set. The application computes holistic = insight × this coefficient (max 3.0).",
          },
          justificationHolisticCoefficient: {
            type: "string",
            description:
              "Briefly justify why this coefficient matches the pattern of precision, evidenceQuality, and reasoning for this set (one short paragraph).",
          },
          justificationInsight: {
            type: "string",
            description:
              "Required: name benchmark Level and quote exact benchmark wording. For insight 2–3: MUST include one explicit examiner sentence affirming whether student used abstract academic language beyond quotation; MUST quote verbatim student analytical prose (not quote-block alone) if claiming 2–3; if none, state that and cap insight at 1. For insight 0, explain no fit or contradiction. No Step 2 reasoning (a)(b)(c) here.",
          },
          justificationPrecision: { type: "string" },
          justificationEvidence: {
            type: "string",
            description:
              "Anchor to quoted/paraphrased evidence: if P-only or >20w-per-single-extract rule, say so. If evidenceQuality=2: give word count per contiguous quoted extract used (each ~≤9 words target; no single extract >10), affirm claim is directly inferable from quoted wording without smuggling meaning from unstated context, and why the extract(s) are sufficient; if multiple short quotes, say so explicitly.",
          },
          justificationReasoning: {
            type: "string",
            description:
              "Required: three labelled parts **(a)**, **(b)**, **(c)** matching reasoningDeducibleConclusion, reasoningPreciseConceptWording, reasoningLinearCoherence. In EACH part, quote **verbatim** from the student’s reasoning in this set (exact words) that satisfy or fail that criterion. State each sub-score in its section. End by confirming reasoning equals the sum of the three sub-scores.",
          },
        },
        required: [
          "verbatim",
          "insight",
          "precision",
          "evidenceType",
          "evidenceQuality",
          "reasoningDeducibleConclusion",
          "reasoningPreciseConceptWording",
          "reasoningLinearCoherence",
          "reasoning",
          "criterionAHolisticCoefficient",
          "justificationHolisticCoefficient",
          "justificationInsight",
          "justificationPrecision",
          "justificationEvidence",
          "justificationReasoning",
        ],
      },
    },
  },
  required: ["excludedTopicSentence", "sets"],
};

const TOPIC_ARGUMENT_AUDIT_SCHEMA = {
  type: "object",
  properties: {
    check1_topicSentenceSophistication: {
      type: "object",
      properties: {
        score: {
          type: "integer",
          description:
            "Integer 1–4 per Topic Sentence Sophistication rubric in the Step 3 prompt. Holistic: intellectual complexity and accuracy vs the source—not keyword-matching.",
        },
        justification: { type: "string" },
      },
      required: ["score", "justification"],
    },
    check2_thematicDrift: {
      type: "array",
      description:
        "Exactly one entry per analytical set from Step 2 paragraph audit, same order and 0-based indices. Each Step 2 set bundles one evidence anchor and all prose that discusses it (same-evidence grouping); spans may be multi-sentence—still ONE row here; judge drift for the whole verbatim span, do not split by sentence.",
      items: {
        type: "object",
        properties: {
          analyticalSetIndex: {
            type: "integer",
            description: "0-based index matching the paragraph audit set.",
          },
          relevance: {
            type: "integer",
            description:
              "1 = set supports/develops the topic sentence's CORE argumentative claim; 0 = drift — set's claim not at all relevant to that core argument or does not support the TS's central proposition.",
          },
          justification: {
            type: "string",
            description:
              "Name the topic sentence's core argument in one short phrase, then say how this set's claim relates or why it drifts.",
          },
        },
        required: ["analyticalSetIndex", "relevance", "justification"],
      },
    },
    criterionA_grade_step3: {
      type: "object",
      description:
        "After Check 1 and Check 2, assign ONE overall Criterion A grade (0-5) for topic/alignment using the Step 3 anchoring rules in the prompt (stricter drift-based bands). If the topic sentence’s claim about the passage is a major misinterpretation that literally or implicitly contradicts the source, apply the prompt’s mandatory −1 adjustment from the band-derived score (floor 0).",
      properties: {
        score: {
          type: "integer",
          description: "Integer 0-5 inclusive, after any mandatory TS-vs-source misinterpretation penalty in the prompt.",
        },
        justification: {
          type: "string",
          description:
            "Check 1 TS score, Check 2 drift pattern, alignment to TS core argument. If the TS-vs-source penalty applied, say so explicitly (band-table score vs final score).",
        },
      },
      required: ["score", "justification"],
    },
  },
  required: [
    "check1_topicSentenceSophistication",
    "check2_thematicDrift",
    "criterionA_grade_step3",
  ],
};

/** Whole-essay Criterion A check (essay mode only): two Gemini passes — strict L2/L3/misconception rows + holistic score, then inter-claim + source coverage. */
const CRITERION_A_ESSAY_WHOLE_ESSAY_AUDIT_SCHEMA = {
  type: "object",
  properties: {
    level2Rows: {
      type: "array",
      description:
        "One row per bullet under the benchmark section **2. Competent/Analytical Perceptions (Level 3-4 Understanding)** (10 bullets). Copy each bullet in order into benchmarkBulletVerbatim.",
      items: {
        type: "object",
        properties: {
          benchmarkBulletVerbatim: {
            type: "string",
            description: "Exact benchmark bullet text from section 2 (character-accurate copy from [Benchmark]).",
          },
          status: {
            type: "string",
            enum: ["met", "not_met"],
            description:
              "met ONLY if strict whole-essay rule in prompt is satisfied: ≥2 distinct core gist phrases in keyConceptsInOwnVoice (student-aligned paraphrase of what that benchmark bullet centrally demands — no quote marks in that field); supporting stretch not quote-only; see prompt. Otherwise not_met.",
          },
          keyConceptsInOwnVoice: {
            type: "string",
            description:
              "If met: list AT LEAST TWO short phrases that capture the **central analytical gist** of **this specific benchmark bullet** — i.e. the main interpretive / argumentative stakes that bullet is about — as the student’s analysis actually engages them, in neutral examiner paraphrase (own-voice labels, not vocabulary lifted from the passage). **Not** peripheral topic words or loose associations; each phrase must be **key to that bullet’s analysis point**. No quotation marks of any kind in this string. If not_met: empty string.",
          },
          supportingStudentVerbatim: {
            type: "string",
            description:
              "If met: exact substring(s) from [Student Essay] where the student’s OWN analytical prose (outside passage quotation marks) shows command of those **≥2 core gist** points; if the only relevant wording is inside paired quotation marks with no unquoted framing of the bullet’s central analysis, status must be not_met. If not_met: empty string.",
          },
        },
        required: ["benchmarkBulletVerbatim", "status", "keyConceptsInOwnVoice", "supportingStudentVerbatim"],
      },
    },
    level3Rows: {
      type: "array",
      description:
        "One row per bullet under **3. Perceptive & Nuanced Insights (Level 5 Understanding)** (8 bullets). Same strict met rules as level2Rows.",
      items: {
        type: "object",
        properties: {
          benchmarkBulletVerbatim: { type: "string" },
          status: {
            type: "string",
            enum: ["met", "not_met"],
            description:
              "Same strict met rules as level2Rows items (keyConceptsInOwnVoice ≥2 core gist phrases for that bullet, no quote marks in that field).",
          },
          keyConceptsInOwnVoice: {
            type: "string",
            description: "Same rules as level2Rows.keyConceptsInOwnVoice.",
          },
          supportingStudentVerbatim: {
            type: "string",
            description: "Same rules as level2Rows.supportingStudentVerbatim.",
          },
        },
        required: ["benchmarkBulletVerbatim", "status", "keyConceptsInOwnVoice", "supportingStudentVerbatim"],
      },
    },
    misconceptionRows: {
      type: "array",
      description:
        "One row per bullet under **4. Frequent Misinterpretations & Logic Breakdowns** from the benchmark (typically 5–6 bullets).",
      items: {
        type: "object",
        properties: {
          misconceptionBulletVerbatim: {
            type: "string",
            description: "Exact misconception bullet from section 4 of [Benchmark].",
          },
          studentCommits: {
            type: "boolean",
            description: "True if the student essay commits this misconception or logic failure.",
          },
          supportingStudentVerbatim: {
            type: "string",
            description: "If studentCommits is true: exact substring(s) from [Student Essay] showing it. Otherwise empty string.",
          },
        },
        required: ["misconceptionBulletVerbatim", "studentCommits", "supportingStudentVerbatim"],
      },
    },
    wholeEssayBenchmarkHolistic: {
      type: "object",
      description:
        "After all rows are filled using strict met rules, assign ONE supplementary holistic score for this whole-essay check only (not the same as per-paragraph Criterion A steps 2–4).",
      properties: {
        score: {
          type: "number",
          description:
            "Allowed values only: 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5. Anchor to the band rubric in the prompt using met counts for section 2 and 3 and misconception hits; use 0.5 only between adjacent band anchors.",
        },
        justification: {
          type: "string",
          description:
            "2–5 sentences: state the numeric score explicitly; give % or counts of section 2 met, section 3 met, and how many misconception bullets committed; note literal contradictions vs source if any; tie to the chosen band.",
        },
      },
      required: ["score", "justification"],
    },
    holisticCheck1InterClaimCoherence: {
      type: "object",
      description:
        "Holistic check 1: extract major claims across the whole essay and judge whether they contradict each other between paragraphs.",
      properties: {
        verdict: {
          type: "string",
          enum: ["--", "-", "+"],
          description:
            "-- = prevalent / serious contradictions between major claims across the essay. - = sometimes contradicts but not serious or isolated. + = no material inter-claim contradictions detected.",
        },
        majorClaims: {
          type: "array",
          description:
            "Ordered list of the essay's main interpretive or argumentative claims (not trivial local observations). At least 2 when the essay has multiple developed points.",
          items: {
            type: "object",
            properties: {
              claimSummary: {
                type: "string",
                description: "One short sentence per major claim in examiner paraphrase.",
              },
              locationHint: {
                type: "string",
                description: "Where it appears, e.g. intro, body paragraph 2, conclusion.",
              },
            },
            required: ["claimSummary", "locationHint"],
          },
        },
        justification: {
          type: "string",
          description:
            "Support the verdict: if not +, name which claims clash and how; if +, state clearly that no serious cross-paragraph contradiction was found.",
        },
      },
      required: ["verdict", "majorClaims", "justification"],
    },
    holisticCheck2SourceCoverage: {
      type: "object",
      description:
        "Holistic check 2: split [Source Text] into 3-4 major contiguous parts; rate how the essay covers each.",
      properties: {
        verdict: {
          type: "string",
          enum: ["--", "-", "+", "++"],
          description:
            "-- = serious imbalance (no meaningful coverage across roughly half or more of the major source parts). - = at least one major part is neglect. + = all parts get some coverage but imbalanced or much is brief/gloss. ++ = strong detailed coverage across all parts with reasonable balance.",
        },
        sourceMajorParts: {
          type: "array",
          description: "Exactly 3 or 4 contiguous major segments of [Source Text], in reading order.",
          items: {
            type: "object",
            properties: {
              partIndex: {
                type: "integer",
                description: "0-based order within the source split.",
              },
              partTitle: {
                type: "string",
                description: "Short label for this chunk (e.g. opening tableau, turning point, closing).",
              },
              sourceContentSummary: {
                type: "string",
                description: "Brief neutral summary of what happens or is focal in this slice of the passage.",
              },
              coverageLevel: {
                type: "string",
                enum: ["detailed", "brief", "neglect"],
                description:
                  "detailed = sustained close analysis tied to this slice. brief = passing mention or shallow gloss only. neglect = essentially no engagement with this slice.",
              },
              essayCoverageJustification: {
                type: "string",
                description: "One or two sentences on how the essay treats this part of the source.",
              },
            },
            required: [
              "partIndex",
              "partTitle",
              "sourceContentSummary",
              "coverageLevel",
              "essayCoverageJustification",
            ],
          },
        },
        justification: {
          type: "string",
          description:
            "Tie verdict to the coverage pattern: counts of detailed vs brief vs neglect across the 3-4 parts.",
        },
      },
      required: ["verdict", "sourceMajorParts", "justification"],
    },
  },
  required: [
    "level2Rows",
    "level3Rows",
    "misconceptionRows",
    "wholeEssayBenchmarkHolistic",
    "holisticCheck1InterClaimCoherence",
    "holisticCheck2SourceCoverage",
  ],
};

/** Pass 1 only: L2/L3/misconception rows + supplementary holistic (same shape as full audit object subset). */
const CRITERION_A_ESSAY_WHOLE_ESSAY_AUDIT_BENCHMARK_SCHEMA = {
  type: "object",
  properties: {
    level2Rows: CRITERION_A_ESSAY_WHOLE_ESSAY_AUDIT_SCHEMA.properties.level2Rows,
    level3Rows: CRITERION_A_ESSAY_WHOLE_ESSAY_AUDIT_SCHEMA.properties.level3Rows,
    misconceptionRows: CRITERION_A_ESSAY_WHOLE_ESSAY_AUDIT_SCHEMA.properties.misconceptionRows,
    wholeEssayBenchmarkHolistic: CRITERION_A_ESSAY_WHOLE_ESSAY_AUDIT_SCHEMA.properties.wholeEssayBenchmarkHolistic,
  },
  required: ["level2Rows", "level3Rows", "misconceptionRows", "wholeEssayBenchmarkHolistic"],
};

/** Pass 2 only: inter-claim coherence + source coverage (same shape as full audit object subset). */
const CRITERION_A_ESSAY_WHOLE_ESSAY_AUDIT_HOLISTICS_SCHEMA = {
  type: "object",
  properties: {
    holisticCheck1InterClaimCoherence:
      CRITERION_A_ESSAY_WHOLE_ESSAY_AUDIT_SCHEMA.properties.holisticCheck1InterClaimCoherence,
    holisticCheck2SourceCoverage: CRITERION_A_ESSAY_WHOLE_ESSAY_AUDIT_SCHEMA.properties.holisticCheck2SourceCoverage,
  },
  required: ["holisticCheck1InterClaimCoherence", "holisticCheck2SourceCoverage"],
};

/**
 * Essay-mode pass 1: strict benchmark met/not_met rows + supplementary whole-essay holistic from those rows.
 * @param {string} sourceText
 * @param {string} benchmark
 * @param {string} fullStudentEssay
 */
function buildCriterionAEssayWholeEssayAuditBenchmarkMessage(sourceText, benchmark, fullStudentEssay) {
  const s = sourceText.trim();
  const b = benchmark.trim();
  const e = fullStudentEssay.trim();
  return `Criterion A — Whole-essay benchmark map (IB Paper 1) — **Pass 1 of 2: strict rows + supplementary holistic**

Role: You are an experienced IB English A examiner (Criterion A: Understanding and Interpretation). This is **pass 1 of 2** for the full-essay supplementary check. You see the **entire** analysis and the **complete** Step 1 benchmark. Another pass will handle inter-claim coherence and source coverage — **do not** output those fields; your JSON must match **only** the schema for this pass.

Inputs:

[Source Text]

${s}

[Benchmark — full text, unchanged]

${b}

[Student Essay — entire submission, exact text]

${e}

Your task (JSON only per schema — no markdown outside the JSON object):

**A) Strict rule for status = met (Level 2 and Level 3 rows only)**  
Award **met** only if the student **explicitly** meets that benchmark (or a **clear same-tier derivative**) through **explicit, consolidated abstract language** in **their own voice and reasoning** — not by implication alone inside quotations, not by recycling or lightly rephrasing **passage diction** as if it were analysis, and not by scattered vague hints. The student must show they grasp **what that specific bullet is centrally asking for** — its **gist meaning** and **core analysis stakes** — and argue toward **those** points in **their own sentences** **outside** passage quotation marks.  
**keyConceptsInOwnVoice (NON-NEGOTIABLE):** This field is **not** a grab-bag of loosely related “concepts.” List **at least two** short phrases, each naming a **distinct core thread** of **that bullet’s particular analysis point** (the interpretive or argumentative heart of the benchmark wording — what would be **missing** if you deleted everything else in the bullet). Phrases must reflect how **this essay** actually advances that **central** demand, expressed as **neutral examiner paraphrase** of the student’s own-voice analysis (gist labels, **not** peripheral vocabulary and **not** wording copied from the stimulus). **No quotation marks** anywhere in the string (no \`'\`, \`"\`, \`\`, « », or similar). If the student only gestures at side issues, or the field would need quotes to mirror the passage, → **not_met**. **Quote marks in keyConceptsInOwnVoice are forbidden.**  
**Supporting verbatim:** Must include the **unquoted** student analytical prose where those **≥2 core gist** threads are clearly controlled for **this** bullet; if the only relevant material is **inside** paired quotation marks without unquoted prose that frames the bullet’s **central** analysis in the student’s words, **not_met**.  
- If **met**: **supportingStudentVerbatim** = shortest sufficient **exact** substring(s) from [Student Essay] showing that **own-voice** command of the bullet’s **key analysis points** (minimal context only if still analytical prose; not a span that is **only** quoted passage unless the same span includes clear unquoted framing). **keyConceptsInOwnVoice** = **≥2** gist phrases as above, **no** quote characters, aligned with that verbatim.  
- If **not_met**: both **supportingStudentVerbatim** and **keyConceptsInOwnVoice** must be **empty strings**.

1) **Level 2 (benchmark section 2 — Competent/Analytical Perceptions):** For **each** of the **10** bullets, **met** / **not_met** per rule **A)**. **benchmarkBulletVerbatim** = exact copy from the benchmark.

2) **Level 3 (benchmark section 3 — Perceptive & Nuanced Insights):** For **each** of the **8** bullets, same as (1).

3) **Misconceptions (section 4):** For **each** bullet, **studentCommits** only when the essay actually instantiates that failure mode. Verbatim evidence rules unchanged. Also use your reading of the essay vs [Source Text] when assigning the holistic score below (literal contradictions matter for lower bands).

4) **wholeEssayBenchmarkHolistic:** After rows are complete, assign **one** supplementary holistic **score** on **0–5** in **0.5 steps only** (0, 0.5, 1, …, 5). Use **.5** only when judgment genuinely sits **between** two adjacent band descriptions. **justification** must state the score, give **counts or percentages** of section-2 **met**, section-3 **met**, and how many misconception rows are **true**, and anchor to the band you chose.

**Holistic band anchors (this whole-essay check only — calibrate using strict met counts):**  
- **5.0:** Many section-3 bullets **met** (**roughly >40–50%** of the eight), **most** section-2 bullets **met** (**≥ about 75%** of the ten), and **no** “common” misconception bullets from section 4 committed (**studentCommits** false across those rows), and no serious literal contradiction of the source.  
- **4.0:** **Some** section-3 **met** (e.g. perhaps **1–2** of eight), **many** section-2 **met** (**≥ about 40–50%** of ten), **few** common misconceptions committed, reading generally competent.  
- **3.0:** **More than a few** section-2 **met** (**at least 3** of ten), **some** common misconceptions committed, **literal / surface meaning (Level-1 style)** handled reasonably well overall.  
- **2.0:** Only **very few** section-2 **met** (**about 1–2**), **some** misconceptions and/or **literal contradictions** of the source.  
- **1.0:** Level-1-type content **only partially** met across the essay, **no** section-2 rows **met** under the strict rule, **poor** overall understanding.  
- **0.0:** Not a satisfactory response in any meaningful way for this check.

**Counts are mandatory:** **level2Rows.length === 10**, **level3Rows.length === 8**, **misconceptionRows.length** = number of section-4 bullets in this benchmark, **wholeEssayBenchmarkHolistic** must be present with **score** and **justification**.

Do not invent benchmark bullets. This pass is **only** the strict benchmark map plus the supplementary holistic derived from it (not inter-claim or source-coverage holistics).`;
}

/**
 * Essay-mode pass 2: holistic check 1 (inter-claim) and 2 (source coverage) only.
 * @param {string} sourceText
 * @param {string} fullStudentEssay
 */
function buildCriterionAEssayWholeEssayAuditHolisticsMessage(sourceText, fullStudentEssay) {
  const s = sourceText.trim();
  const e = fullStudentEssay.trim();
  return `Criterion A — Whole-essay holistics (IB Paper 1) — **Pass 2 of 2: inter-claim + source coverage**

Role: You are an experienced IB English A examiner (Criterion A: Understanding and Interpretation). This is **pass 2 of 2** for the full-essay supplementary check. **Pass 1** already mapped benchmark bullets (met/not met) — you do **not** repeat that work. Output **only** **holisticCheck1InterClaimCoherence** and **holisticCheck2SourceCoverage** per schema.

Inputs:

[Source Text]

${s}

[Student Essay — entire submission, exact text]

${e}

Your task (JSON only per schema — no markdown outside the JSON object):

**1) holisticCheck1InterClaimCoherence**  
- Extract **all major claims** the essay advances (interpretive theses, recurring arguments about meaning, character, tone, or craft — **not** every local observation).  
- Judge whether **one paragraph’s major claim contradicts another’s** in a way that would confuse a reader about what the student believes the text does (ignore deliberate **development** of a single line of thought).  
- Output **verdict** using **only** these exact tokens: \`--\` if such contradictions are **prevalent / serious**; \`-\` if they **sometimes** appear but are **not serious** or are **isolated**; \`+\` if **none** materially detected.  
- Fill **majorClaims** (claimSummary + locationHint per claim) and **justification** explaining the verdict.

**2) holisticCheck2SourceCoverage**  
- Mentally divide **[Source Text]** into **exactly three OR four** contiguous **major parts** (by rhetorical focus, scene shift, or argument movement — **not** arbitrary equal word counts). List them in order in **sourceMajorParts** (partIndex 0..n-1, partTitle, sourceContentSummary, coverageLevel, essayCoverageJustification).  
- For each part set **coverageLevel**: \`detailed\` = sustained close analysis clearly tied to that slice; \`brief\` = passing mention or shallow gloss only; \`neglect\` = essentially **no** engagement with that slice’s substance.  
- Output **verdict** using **only** these exact tokens: \`--\` if **serious imbalance** — e.g. **neglect** across **roughly half or more** of the major parts, or equivalent lack of coverage; \`-\` if **at least one** major part is **neglect**; \`+\` if **all** parts receive **some** coverage but there is **imbalance** and/or too much stays at **brief** / gloss; \`++\` if **strong detailed** coverage across **all** parts with **reasonable balance**.  
- **justification** must reference the pattern of **detailed / brief / neglect** across parts.

**Counts are mandatory:** **holisticCheck1InterClaimCoherence** and **holisticCheck2SourceCoverage** must both be present. **sourceMajorParts.length** must be **3 or 4**.`;
}

/** Official-style Criterion A (Knowledge and understanding) — IB English A (Paper 1), whole-number bands only. */
const CRITERION_A_KNOWLEDGE_RUBRIC_OFFICIAL_HEADING =
  "Criterion A — Knowledge and understanding (official band descriptors, 0–5)";

const CRITERION_A_KNOWLEDGE_RUBRIC_INTEGER_DESCRIPTORS = {
  0: "The work does not reach a standard described by the descriptors below.",
  1: "The response demonstrates little understanding of the literal meaning of the text. References to the text are infrequent or are rarely appropriate.",
  2: "The response demonstrates some understanding of the literal meaning of the text. References to the text are at times appropriate.",
  3: "The response demonstrates an understanding of the literal meaning of the text. There is a satisfactory interpretation of some implications of the text. References to the text are generally relevant and mostly support the candidate's ideas.",
  4: "The response demonstrates a thorough understanding of the literal meaning of the text. There is a convincing interpretation of many implications of the text. References to the text are relevant and support the candidate's ideas.",
  5: "The response demonstrates a thorough and perceptive understanding of the literal meaning of the text. There is a convincing and insightful interpretation of larger implications and subtleties of the text. References to the text are well-chosen and effectively support the candidate's ideas.",
};

/** Full rubric block for model prompts (must stay aligned with CRITERION_A_KNOWLEDGE_RUBRIC_INTEGER_DESCRIPTORS). */
const CRITERION_A_IB_KNOWLEDGE_RUBRIC_BLOCK = `${CRITERION_A_KNOWLEDGE_RUBRIC_OFFICIAL_HEADING}

0 — ${CRITERION_A_KNOWLEDGE_RUBRIC_INTEGER_DESCRIPTORS[0]}

1 — ${CRITERION_A_KNOWLEDGE_RUBRIC_INTEGER_DESCRIPTORS[1]}

2 — ${CRITERION_A_KNOWLEDGE_RUBRIC_INTEGER_DESCRIPTORS[2]}

3 — ${CRITERION_A_KNOWLEDGE_RUBRIC_INTEGER_DESCRIPTORS[3]}

4 — ${CRITERION_A_KNOWLEDGE_RUBRIC_INTEGER_DESCRIPTORS[4]}

5 — ${CRITERION_A_KNOWLEDGE_RUBRIC_INTEGER_DESCRIPTORS[5]}`;

/** Final whole-essay Criterion A score from synthesising per-paragraph work + whole-essay holistics. */
const CRITERION_A_ESSAY_FINAL_ASSIGNER_SCHEMA = {
  type: "object",
  properties: {
    score: {
      type: "number",
      description:
        "Single final Criterion A mark for the whole essay, 0–5 inclusive, in steps of 0.5 only. Use 0.5 only when judgment truly sits between two adjacent official descriptors.",
    },
    examinerReport: {
      type: "string",
      description:
        "Exactly 5 or 6 complete sentences, IB examiner voice, Criterion A (Knowledge and understanding) only. Must explicitly state the assigned numeric score at least once. Ground the decision in the official rubric wording above (quote or closely echo key phrases from the level you assign). No bullets.",
    },
  },
  required: ["score", "examinerReport"],
};

/**
 * @param {string} digestText Built by the host from per-paragraph audits + whole-essay holistic file.
 */
function buildCriterionAEssayFinalAssignerMessage(digestText) {
  const d = String(digestText || "").trim();
  return `Criterion A — Final whole-essay assignment (IB English A, Paper 1)

Role: You are an experienced IB English A examiner. Judge **only Criterion A: Knowledge and understanding** for the **entire essay** (all body paragraphs together). You do **not** award separate marks per paragraph here — you output **one** final mark for the response.
Consider the different group leaders for different aprts of essays for scores and give your best judgement
${CRITERION_A_IB_KNOWLEDGE_RUBRIC_BLOCK}

---

**How to combine evidence (follow closely):**

1. **Approximate weighting:** give roughly **60%** of your judgment to the **per-body-paragraph** evidence in the digest (paragraph audit step 2, topic/argument audit step 3, thematic drift pattern, and **for each paragraph** the step-2 and step-3 outcomes as written there). Give roughly **40%** to the **whole-essay holistic attributes** in the digest (whole-essay benchmark supplementary holistic 0–5, counts of strict Level-2 / Level-3 benchmark rows met, misconception hits, **inter-claim coherence verdict** \`--\` / \`-\` / \`+\`, and **source coverage verdict** \`--\` / \`-\` / \`+\` / \`++\`). Do **not** infer or reconstruct any aggregate “mean of paragraph marks” unless it is explicitly written in the digest — assign from qualitative fit to the official descriptors and the evidence given.

2. **Common performance calibration (use alongside the official descriptors and consider comments):**
   - **5:** Typically a mix of **4**s and **5**s across paragraph-level scores and whole-essay holistics; **5**s are **considerable (>=40-50%)**; **no** \`-\` and **no** \`--\` in **any** holistic verdict category (inter-claim or source coverage).
   - **4:** Mostly **4**s across paragraph and holistic signals, **some 3**s but not many (<=approx a quarter); **at most one** \`-\` in any holistic verdict category (never \`--\` as the dominant pattern).
   - **3:** Mostly **3**s with **some 4**s and **few 2**s; may include **some** \`-\` or **one** \`--\` somewhere if **clearly compensated** by stronger paragraph profile.
   - **2:** A mix of **2**s and **3**s; understanding somewhat **weak** or includes **some** misunderstanding of meaning; several negative holistic signals possible.
   - **1:** Mix of **1**s and **2**s; **major** misunderstanding of **literal** meaning.
   - **0:** Does not reach the standard of descriptor **1**.

3. **Half marks:** Output **score** in **0.5** steps **only** when you are **genuinely** torn between **two adjacent** official levels; otherwise use a whole number.

4. **examinerReport:** **Exactly five or six sentences.** Criterion A only. Tie reasoning to **exact rubric language** (e.g. "thorough and perceptive", "satisfactory interpretation of some implications", "little understanding of the literal meaning", "well-chosen" references, etc.) and to the digest. Name the final mark clearly.

---

**Digest (all evidence you may use for this assignment):**

${d}

---

Output **only** valid JSON matching the schema: **score** and **examinerReport**. No markdown fences, no text outside the JSON.`;
}

function buildAuditMessage(sourceText, benchmark, studentParagraph) {
  const s = sourceText.trim();
  const b = benchmark.trim();
  const p = studentParagraph.trim();

  return `The AI Prompt

Role: You are a Senior IB English Examiner specializing in Criterion A: Understanding and Interpretation. Your goal is to conduct a rigorous audit of a student's one analysis paragraph to ensure every claim is tethered to textual evidence through clear, logical deduction.

Input Data:

[Source Text]:

${s}

[Benchmark]:

${b}

[Student Paragraph]:

${p}

NON-NEGOTIABLE RULES:
1) Do NOT evaluate, score, quote, or discuss the topic sentence. The topic sentence is only the opening sentence that frames the line of argument (usually the first sentence). Copy it exactly into excludedTopicSentence. Audit ONLY the sentences that follow it.
2) Do **not** assign an overall paragraph mark (0–5) in this JSON. Output **only** per-set scoring fields plus **excludedTopicSentence**; a separate verification pass will assign the Step 2 overall grade from a digest of your scores. Do not add any overall verdict prose outside the JSON.
3) Your entire reply must be ONLY the JSON object required by the schema (no markdown, no preamble, no text after the JSON).
4) **Analytical sets may exceed one sentence.** **Group into one set** if the sentences **both/all discuss the same evidence** (the same quoted or paraphrased anchor from the passage). **Start a new set** when **new evidence** appears—especially a **new quotation** or a **new** clearly distinct paraphrased/cited anchor; those belong in **separate** sets. Each set’s **verbatim** keeps that one evidence anchor plus every consecutive sentence that still unpacks **only** that anchor—**never** split trailing analysis into its own set (see segmentation block). Same grouping is binding for Step 3 when it consumes your sets.

Task:
Perform a sequential audit of the student paragraph (excluding the topic sentence). Break the remainder into "Claim/Evidence Sets." For each set, fill the JSON fields using this rubric:

**Analytical set segmentation (Step 2 — NON-NEGOTIABLE):** **Same evidence → one set:** everything that interprets, glosses, or argues from **the same** quoted or paraphrased evidence stays in **one** **verbatim** span (often several sentences). **New evidence → new set:** as soon as the student brings in **another** quote, extract, or a clearly **different** paraphrased passage as the evidential basis, that material starts the **next** set—even if the topic is related. **Do not** put two different quotations in one set unless they are fused as a single tightly integrated point with one shared analytical job (rare); when in doubt, **split** at the new quote. **Never** isolate post-quote analysis into its own set if it only unpacks the **immediately preceding** quote or the **same** paraphrased anchor.

Scoring independence (critical): For each set, the four scores—insight, precision, evidenceQuality, and reasoning—are SEPARATE dimensions. Judge each on its own rubric only. Do not raise or lower one score because another looks high or low; do not align them to match. If a problem spans dimensions, reflect it only in the dimension(s) whose criteria it actually violates.

Mandatory override (literal contradiction): If anything in the set **contradicts the source text’s literal meaning** (what the words on the page actually say or straightforwardly entail), you MUST set **precision = 0** for that set and **insight = 0**. In **justificationInsight**, state that this is literal contradiction and quote the conflicting student wording vs what the source text actually says. This override does not replace the independence rules elsewhere—it is a hard assignment for those two fields when literal meaning is violated.

1. Claim Evaluation (Level of Insight & Precision)

Treat the supplied **[Benchmark]** as having **three numbered levels** matching its headings (use these names when writing **justificationInsight**):
- **Level 1 — Basic/Descriptive Outline** (literal plot, surface setting, obvious actions; “what” without “why”).
- **Level 2 — Competent/Analytical Perceptions** (Level 3–4 style: implied meaning, themes, motivations, guided-question / conflict, competent inferences).
- **Level 3 — Perceptive & Nuanced Insights** (Level 5 style: ambiguity, paradox/tension, subtext, irony, nuance—insightful and convincing).

Insight (Scale 0–3) — **map the set’s analytical substance to the benchmark**, not vibes:

**Explicit insight articulation (mandatory for judging insight 2 or 3):** The benchmark’s intellectual move must appear in the student’s **own analytical sentences** as a **named, explicit claim**—not something only a generous reader could **infer** from quotation or loose paraphrase of the passage. **Quoting or echoing diction from the text is not enough by itself**; after evidence the student must **explain in precise, abstract language** what that evidence **shows** about meaning or relationship (e.g. cause, shift, opposition). **Example (negative):** If the benchmark tracks something like **“external dependency → internal autonomy,”** a vague gloss such as *their “voice” is replaced by something they “slowly recognized” as their own* is **still basically quoting / redescribing**—it does **not** explicitly state dependence vs autonomy or becoming **less dependent**. Without that explicit analytical naming in the student’s prose, **do not award insight 2 or 3** for that set (treat as at most **insight 1** unless it is purely descriptive Level-1 work). **Example (positive):** Same evidence **plus** explicit prose that the subject moves from reliance on others to **self-directed** judgment / **reduced dependence** after the quoted moment—then Level 2–3 may be in range, aligned to the benchmark bullet you quote in **justificationInsight**.

**Insight 3 — NON-NEGOTIABLE scoring rule:** Award **only** if the set **hits Level 3 of the benchmark** (or a **clear derivative / same tier**): **excellent / effective**, nuanced, convincing. **Hard requirement:** **Beyond** reproducing or lightly rephrasing the **quoting phrase** alone, the student must add **their own** sentences in **academic register** that state the **abstract implication** of the evidence—**what it means**, **why it matters**, or **how it reconfigures meaning**—using **precise analytical vocabulary** (not the passage’s literal diction recycled as pseudo-analysis). That abstract explanation may appear **before or after** the quotation (or bracketing it); **quotation blocks without such surrounding/between analytical prose cannot earn insight 3**. If you cannot point to **non-quoted** (or clearly analytical, non-pastiche) student sentences that do this work, **insight 3 is forbidden**—cap lower.

**Insight 2 — NON-NEGOTIABLE scoring rule:** Award **only** if the set **hits Level 2 of the benchmark** (or a **derivative / same tier**): **competent** implied meaning / theme / inference. **Same structural requirement as Level 3, but the bar for subtlety is lower:** the student must still move **past literal quotation** into **explicit abstract explanation in their own academic words** (before/after/between quotes) so a reader sees **why** the evidence supports the claim at the level of **ideas**, not only **what the words on the page say**. **Quote-only or quote-plus-vague-gloss sets do not satisfy insight 2**—maximum **insight 1** unless other rules apply.

**Insight 1:** The set **hits Level 1 of the benchmark** (or **same tier** only): **descriptive summary**, plot/surface retell, **or** only a **small partial** analytical gesture that still essentially lives in the basic/descriptive band—not yet sustained Level-2 competence for this set.

**Insight 0:** The set **does not** map to **any** of Level 1, 2, or 3 (no qualifying benchmark hit or derivative at any tier), **or** is disqualified by **literal contradiction** of the source (see mandatory override), **or** is **irrelevant** imports (trivia, biography, ungrounded tangents) that do not illuminate the passage. Ordinary glosses of word sense / shared concepts are not automatically 0 unless they replace textual analysis.

**justificationInsight (required for every set):** You **must** anchor the insight score to the benchmark:
- **Name the level** (1, 2, or 3) you are using and **copy exact wording** from the **[Benchmark]**—quote the **full bullet or phrase** you treat as the match (use quotation marks around the copied benchmark text).
- If the student’s move is a **derivative or “similar level”** rather than an exact thematic duplicate of one bullet, you **must** still name the **closest benchmark level and quote the nearest bullet(s)** you are calibrating against, then **justify**: what is the student’s **insight or analytical understanding** in this set, and **why** does it belong at that benchmark tier (3 = excellent/effective; 2 = competent; 1 = descriptive / only small partial analytical).
- **Mandatory affirmation for insight 2 or 3:** In **justificationInsight** you **must** include a **short explicit sentence of your own** as examiner that states whether the student **did or did not** supply **abstract analytical language in their own words beyond the quoting phrase** (i.e. non-literal, idea-level commentary in academic register, not merely recycling quoted words). If they **did**, **quote verbatim** the **shortest sufficient** student passage(s) that are **clearly analytical prose** (not the quotation marks block alone). If they **did not**, write plainly that **no qualifying abstract explanation beyond quotation was found** and therefore insight **cannot** be 2 or 3.
- For **insight 2 or 3**, you **must** quote **verbatim student phrases** where the **explicit analytical claim** appears (the named idea in their own words). If the only “analysis” is implicit inside quotation or vague redescription, state that and **cap insight at 1** (or lower per other rules).
- For **insight = 0**, explain why **no** Level 1–3 benchmark fit applies (or cite literal contradiction / irrelevance). Do **not** repeat the (a)(b)(c) reasoning checklist here—that belongs only in **justificationReasoning**.

Precision (Scale 0-3) — authorial intent & evidence focus:
0 = The claim or reading **contradicts the literal meaning** of the source text (misstates facts, inverts what is said, or invents what is not there). Use 0 only for this failure mode; then set **insight = 0** as in the mandatory override above.
3 = Accurate to the MAIN authorial intent of the passage for this point; the observation is well tethered to what the extract is centrally doing. Evidence in the paragraph should be MAIN and TEXTUALLY RELATED—do NOT give 3 if the student contrives support by yoking two quotations or details that are far apart or only weakly related to force a clever reading.
2 = The observation can be locally plausible or partly valid, but it does NOT fully match the passage’s overall authorial intent, or it is only partially supported—without contradicting literal meaning.
1 = Misinterpretation of tone, emphasis, or inference that is **wrong but still compatible with the literal words on the page** (not a flat contradiction).

2. Evidence Evaluation (Quote/Paraphrase Support)

evidenceType: **Q** = direct quote, **P** = paraphrase only (no quotation marks / no verbatim extract from the passage used as evidence in this set), **QP** = both quote and paraphrase used as evidence together.

**Paraphrase-only cap:** If **evidenceType is P** (paraphrase only—no quoted words from the source anchoring this set), **evidenceQuality cannot exceed 1**. Paraphrase alone cannot earn **2** because it lacks precise textual pointing; at best it can be a serviceable but non-optimal pointer (**1**), or fail the dimension (**0**).

Quality **evidenceQuality (0–2)**:

Measure length **per contiguous quoted substring** (or clearly marked verbatim extract): each run of words inside **one** pair of quotation marks / one marked extract counts **separately**. **Do not** sum words across **several short, separate** quotations to pretend the student used “one long quote”—**multiple concise pointed extracts are fine** and do **not** violate the length discipline the way **one bloated** extract does.

**2 — Strong textual evidence (strict — all must hold):**
- **Direct-inference rule (NON-NEGOTIABLE):** The set’s **claim** must be **directly inferable from the quoted words the student actually offers**—a reader may **not** need to import unstated context or stitch distant passage meaning to “complete” the link. If the claim only becomes plausible once you import meaning from **outside** those quoted bits, **evidenceQuality cannot be 2** (cap at **1** or lower).
- **Precision of choice:** The extract(s) must be **minimal sufficient** pointer(s) for that claim among the **best** options in the source—MAIN, coherent, not a forced stitch of distant fragments.
- **Length for score 2 (per extract, not a total):** The real discipline is: **do not lean on one long quoted slab**—aim for **about 8–9 words or fewer per contiguous quoted extract** for the tightest evidence. **Hard rule:** if **any single contiguous** quoted extract used as evidence in this set is **>10 words**, **do not award 2** (maximum **1** unless another rule forces **0**). If the student uses **several short, separate** quotations (each brief and pointed), evaluate **each** extract on its own; **do not** add their lengths together to breach this rule.

**1 — Adequate but weaker:** Not tight enough for **2**—e.g. claim needs surrounding prose to land, **one contiguous** extract **>10 words**, somewhat clunky or peripheral, or only partly on-centre—but **every** contiguous quoted extract (when present) is **20 words or fewer** and still **supports** the claim in a recognizable way. Also the **maximum** when **evidenceType is P** (paraphrase-only cap).

**0 — Fails the standard:** Does **not** support the claim; **irrelevant** evidence; **any single contiguous** quoted extract used as evidence is **>20 words**—**mandatory 0** for poor word economy and imprecise pointing even if thematically adjacent (**do not** sum several short quotes to trigger this). Other hard failures (e.g. evidence that plainly mismatches the claim) also **0**.

3. Reasoning Evaluation (The "Logic Bridge") — **total 0–4 points**

Assign **three sub-scores** (store them in JSON as **reasoningDeducibleConclusion**, **reasoningPreciseConceptWording**, **reasoningLinearCoherence**) and set **reasoning** = their **sum** (must be **0–4** exactly).

**(a) Deducible conclusion — reasoningDeducibleConclusion (0–2)**

**2 — Clear mechanism visible:** The writer **explains** the quote/evidence and **purposefully** uses it to **prove** the claim. They **explicitly justify** how the quote—and **which part**—proves the claim, instead of only summarizing the quotation. The logic must **reasonably follow sentence by sentence** from that explanation; the reader should not be left to invent the bridge.

**1 — Strives toward 2:** Mostly aims at the same standard as **2**, but some part of the reasoning is **confusing on a minor level**, or contains **one small leap** that weakens the chain.

**0 — Fails:** Does **not** meet **1** or **2**: reasoning **unclear**, **unjustified**, or the link from evidence to claim is missing or incoherent.

**Calibration examples (not from the student’s text — use only to calibrate scores):**

*Example A — clear reasoning (mechanism visible) → **score 2** for (a):*

The description of the "crimson stain" that "refused to wash away" serves as a physical manifestation of the protagonist's inescapable guilt. By characterizing the stain as stubborn and permanent, the author illustrates how the memory of the crime has tainted the character's conscience, making it impossible for him to mentally cleanse himself of his past actions.

*Example B — unclear reasoning (the leap) → **score 0** for (a):*

The description of the "crimson stain" that "refused to wash away" serves as a physical manifestation of the protagonist's inescapable guilt and psychological decay. Because the bright crimson blood is permanently stuck to the wooden floorboards of the house, this vividly proves that the character is fundamentally broken and will eventually be destroyed by the oppressive justice system.

**Why B fails (a):** It sounds specific and academic, but it **skips the why**. How does a stain on a floorboard entail being "destroyed by the justice system"? How does "bright crimson" prove he is "fundamentally broken"? Those links are not built sentence by sentence.

**(b) Precise concept and wording — reasoningPreciseConceptWording (0–1)**

**1:** The writer uses **precise concepts** that the **claim and evidence actually support**. The reasoning must **not** name or imply a **different** concept or claim, **switch** the claim mid-reasoning, or **expand** to something broader than the evidence licenses.

**0:** Does **not** meet the standard for **1** (concept drift, bait-and-switch, overclaim, or mid-argument shift).

**(c) Linear vs circular reasoning — reasoningLinearCoherence (0–1)**

**1:** The reasoning is **linear** and **clear**; **each sentence follows** the sentence before with **clear purpose**; the chain of thought is apparent.

**0:** The reasoning is **circular**, **redundant**, or **confusing**, or **assumes what it is trying to prove**.

**Field requirements**

- Output **reasoningDeducibleConclusion** (0–2), **reasoningPreciseConceptWording** (0–1), **reasoningLinearCoherence** (0–1), and **reasoning** = their sum (0–4). The host may recompute **reasoning** from the three integers; they **must** be consistent.

**justificationReasoning** (required for every set): Write **three labelled sections** **(a)**, **(b)**, and **(c)**. In **each** section you **must** identify **verbatim quotation(s) from the student’s reasoning in this set** (exact copied words from the student paragraph) that **show why** that sub-score is earned or lost. Quote enough of the student’s prose to pin the success or failure. No vague boilerplate. End by stating the three numeric sub-scores and that **reasoning** equals their sum.

Constraint Checklist:
Explicit vs implicit insight: If Level 2–3 benchmark content is only **recoverable by implication** from quoted words and **never stated in explicit analytical language** by the student, **cap insight at 1** (see “Explicit insight articulation” above).
Outside knowledge: Serious irrelevant imports (trivia, biography, ungrounded tangents) → usually **insight = 0** (no benchmark fit). Ordinary word sense / general knowledge glosses are allowed if tied into analysis.
No Definition Buffing: defining a word **without** tying it to textual analysis → treat as **Level 1 / descriptive** → **insight = 1** unless the set still performs a clear Level-2 or Level-3 analytical move (then score per benchmark fit and justify in **justificationInsight**).
Support Verification: If you see contrived mining or forced distant-quote pairings, score precision, evidenceQuality, and reasoning each independently according to its own criteria—do not mechanically drag all three together.
Long pasted quotes: For **each contiguous** quoted extract in the set, count words **inside that extract only**; **>20 words in any one such extract → evidenceQuality = 0** (mandatory). **>10 words in any one contiguous extract** forbids **2** (use **1** or **0** per rubric). **Several short separate quotes:** judge each extract separately—**do not** total word-count across them for these thresholds.

---

Per-set holistic score (for **banding and step-2 grading only** — the host application recomputes this number exactly for UI):

**Insight** is the **base** multiplier. After you have scored **precision**, **evidenceQuality**, and **reasoning** (and its subparts) for this set, assign **one** synthetic **holistic coefficient** — field **criterionAHolisticCoefficient** — using **only** these five numeric values (no other decimals):

| **criterionAHolisticCoefficient** | When to use (judging **precision + evidence + reasoning together** for this set) |
| --- | --- |
| **1.2** | All three dimensions are **essentially perfect** for this set. |
| **1.0** | All **essentially perfect**, but **at most one** small shortfall somewhere across the three (think **8/9** on a notional composite). |
| **0.8** | **Minor issues only** — e.g. minor incoherence; **no** major unsuitable evidence, **no** contradiction with the passage, **no** wholesale superficial reasoning; overall quality **around 6–7/9** on that notional composite. |
| **0.4** | **Superficial** or **limited** reasoning, conclusion **not immediately deducible** from what is written, and/or **very low** performance in **one** of the three realms. |
| **0.0** | **Totally irrelevant** or **bad** reasoning **and** evidence for this set. |

Output **justificationHolisticCoefficient**: a short justification tying this coefficient to how **precision**, **evidence**, and **reasoning** actually interact in this set (do not contradict your integer scores).

**Application formula (recomputed exactly; do not output holistic as a separate root field):**

**holistic = insight × criterionAHolisticCoefficient**, then **cap** at **3.0** maximum (and minimum 0). Example: insight **2** × coefficient **1.2** → **2.4** holistic.

Classify each set into **one** band from that **application** holistic value (same UI thresholds as before):

- **Excellent:** holistic **>** 2.5
- **Strong:** **1.8 ≤** holistic **≤** 2.5
- **Mediocre:** **1.3 ≤** holistic **<** 1.8
- **Poor:** holistic **<** 1.3

(Insight = **0** forces holistic **0** for that set. Irrelevance and contradiction must be visible in per-set scores and justifications; a later verification pass will anchor the overall paragraph grade to the application holistics.)

Each set’s **verbatim** must be copied **exactly** from the student paragraph (the part after the topic sentence), **character-for-character**, so a highlighting tool can locate it; **multi-sentence spans** are normal when several sentences still discuss **the same** evidence anchor; **split sets** at each **new** quotation or distinct new evidence anchor (see rule 4 and segmentation above).`;
}

/**
 * @param {string} sourceText
 * @param {string} studentParagraph
 * @param {object} auditData Parsed paragraph audit JSON (sets + excludedTopicSentence); sets should already carry application holistics from the host.
 */
function buildCriterionAStep2OverallGradeMessage(sourceText, studentParagraph, auditData) {
  const s = sourceText.trim();
  const p = studentParagraph.trim();
  const sets = Array.isArray(auditData?.sets) ? auditData.sets : [];
  const ts = (auditData?.excludedTopicSentence != null ? String(auditData.excludedTopicSentence) : "").trim();

  const digestLines = sets.map((set, i) => {
    const v = set.verbatim != null ? String(set.verbatim) : "";
    const h = set.criterionASetHolisticScore;
    const band = h != null ? criterionAHolisticBandFromScore(h) : "—";
    const coef = set.criterionAHolisticCoefficient;
    const et = set.evidenceType != null ? String(set.evidenceType) : "—";
    const hDisp = h != null ? String(h) : "—";
    return `Set ${i}: insight=${set.insight ?? "—"} precision=${set.precision ?? "—"} evidenceQuality=${set.evidenceQuality ?? "—"} reasoning=${set.reasoning ?? "—"} evidenceType=${et} criterionAHolisticCoefficient=${coef ?? "—"} → applicationHolistic=${hDisp} (${band}) | verbatim=${JSON.stringify(v)}`;
  });
  const digestBlock = digestLines.length ? digestLines.join("\n") : "(no analytical sets in digest)";
  const n = sets.length;
  const indexRule =
    n === 0
      ? "Output **setSummaries** as an empty array **[]**."
      : `**setSummaries** must contain **exactly ${n}** objects with **setIndex** **0** through **${n - 1}** in ascending order.`;

  return `Criterion A — Step 2 of 4 (verification pass: overall paragraph grade only)

Role: You are a Senior IB English examiner for Criterion A. You do **not** re-score individual dimensions. You receive a **fixed digest** of per-set scores and verbatim spans produced by a prior audit, plus the **[Source Text]** and full **[Student Paragraph]** for grounding checks only.

**Anti-hallucination rules (strict):**
- Treat the digest’s **numeric fields and applicationHolistic values as authoritative** for each set. Do **not** change them and do **not** output them again as editable scores—your JSON only adds **briefComment** per set and **criterionA_grade_step2**.
- ${indexRule}
- Each **briefComment**: at most **two short sentences**, grounded in that line’s **verbatim** substring and the digest numbers only; do not quote long new stretches of the passage beyond what is already in the digest.
- **criterionA_grade_step2.justification**: brief (roughly **3–6 sentences**), explaining how the **pattern of application holistics and bands** supports your overall score. Do not invent sets or numbers not in the digest.

**Allowed overall score values:** **0**, **1**, **2**, **3**, **4**, **4.5**, or **5** only. **No other decimals**. Use **4.5** sparingly when the profile sits between 4 and 5.

**How to choose the overall score:** Using **only** the digest, (i) note each set’s **applicationHolistic** and **band** (Excellent >2.5; Strong 1.8–2.5; Mediocre 1.3–<1.8; Poor <1.3), (ii) weigh peaks and central tendency (including mediocre sets toward holistic **>1.5** vs borderline **1.3–1.5**), (iii) weigh balance across bands and how weak sets undermine the paragraph.

Anchoring guidance (flexible; state in justification):

* Occasionally one **Poor** set in an otherwise strong paragraph may be acceptable if it is isolated, not a pattern; repeated weak sets are a serious problem.
**5** — **Several** sets **Excellent**; others **mostly Strong**; **at most one Mediocre** (if any); **no Poor**.
**4** — **Almost all Strong** with **some Mediocre**. **HARD CAP: at most one Poor set.** If there are **some Excellents** and the profile sits between **4** and **5**, you may use **4.5**—say why vs **4** or **5**.
**3** — Roughly **half Strong / half Mediocre**, or Mediocre slightly dominant but tending **upper Mediocre** (holistic **>1.5** where relevant).
**2** — **Many Mediocre** plus **more than one Poor** in a way that materially weakens the paragraph; borderline Mediocre (~**1.3–1.5** holistic) may appear.
**1** — **Almost all Mediocre and Poor**; **~40–50%+** sets **Poor** (unless very few sets—then justify).
**0** — Does not meet **1** (e.g. **all Poor**, or largely not auditable after the topic sentence).

---

[Source Text]

${s}

[Full student paragraph]

${p}

[Topic sentence — excluded from per-set audit; context only]

${JSON.stringify(ts)}

[Digest — authoritative per-set scores and verbatim spans]

${digestBlock}

---

Output: Return **only** valid JSON matching the schema: **setSummaries** and **criterionA_grade_step2**. No markdown outside JSON.`;
}

/**
 * @param {string} sourceText
 * @param {string} studentParagraph
 * @param {object} auditData Parsed paragraph audit JSON (sets + excludedTopicSentence)
 */
function buildTopicArgumentAuditMessage(sourceText, studentParagraph, auditData) {
  const sets = Array.isArray(auditData.sets) ? auditData.sets : [];
  const lines = sets.map((s, i) => {
    const v = s.verbatim != null ? String(s.verbatim) : "";
    const h = s.criterionASetHolisticScore;
    const band = h != null ? criterionAHolisticBandFromScore(h) : null;
    const hDisp = h != null ? String(h) : "—";
    const bDisp = band != null ? band : "—";
    return `Set ${i}: applicationHolistic=${hDisp} (${bDisp}) | verbatim=${JSON.stringify(v)}`;
  });
  const setsBlock = lines.length ? lines.join("\n") : "(no analytical sets listed)";

  return `Role: You are a Senior IB English examiner evaluating conceptual alignment between a topic sentence and the body of a student paragraph.

[Source Text] (unseen extract):

${sourceText.trim()}

[Full student paragraph]:

${studentParagraph.trim()}

[Topic sentence — use this exact string as "the topic sentence" for all comparisons]:

${(auditData.excludedTopicSentence || "").trim()}

[Analytical sets already identified in the paragraph audit — compare EACH against the topic sentence; indices must match]:

${setsBlock}

**Analytical set boundaries (Step 3 — NON-NEGOTIABLE, align with Step 2):** Treat each listed set as **one** unit for Check 2, even when its **verbatim spans multiple sentences**. Step 2 grouped **one evidence anchor** (quote and/or paraphrase) with **all prose that still discusses that same evidence**; a new set begins when Step 2 detected **new** quoted or paraphrased evidence. **You must not** mentally subdivide post-quote explanation into separate “sets” for drift scoring—judge **relevance to the topic sentence** for the **entire** verbatim span per index. Indices **must** match the Step 2 list above.

---

Task:
Evaluate the "Conceptual Alignment" of the paragraph using the following checks.

**Core argument of the topic sentence (Step 3 — do this first, before Check 2):** Read the topic sentence and **state for yourself** what its **core argument** is—the **central proposition** it asks the paragraph to defend (authorial intent, thematic effect, interpretive line, etc.—whatever the TS is actually trying to establish). **Every Check 2 judgment** must compare each analytical set’s **claim + evidence + unpacking** against **that core argument**, not against random words in the TS or side details. **Drift (relevance = 0)** means the set’s substantive claim is **not at all relevant** to the topic sentence’s **core argument** (it pursues a different line, ornamental detail, or a reading that does not serve what the TS is trying to prove). **Relevance = 1** means the set **supports, develops, or defends** that core line (even if wording differs).

Check 1: Topic Sentence Sophistication (Score 1–4)

**Holistic judgment (not keyword-matching):** Assign **1–4** from the **overall intellectual quality** of the topic sentence as a proposition about the unseen extract—**complexity**, **argumentative framing**, and **accuracy** to the passage. **Do not** raise the score merely because words like “paradox,” “author,” or “imagery” appear; **do not** lower it only because the wording is plain if the claim is still conceptually strong and **textually sound**. **Accuracy matters:** a TS that sounds sophisticated but **misrepresents** the source cannot sit at the top of this rubric.

**Bands (apply by analogy to the actual extract; calibrate level, not by recognising these titles alone):**
**4:** The TS satisfies band **3** and its claim shows **nuance / complexity**—e.g. dichotomy, paradox, irony, or broader thematic tension.
**3 (Conceptual/Argumentative):** The TS makes a claim about **authorial intent** or **thematic effect**.
**2 (Functional/Hybrid):** The TS mentions a **technique** and a **theme** but stays **literal** or thin as an argument.
**1 (Descriptive/Plot):** The TS **mostly recounts** plot, situation, or **surface fact** rather than framing an interpretive line.

**Concrete examples (illustrative only—same scale on familiar texts):**

*Example set A — escalating sophistication on one scene:*  
**SCORE 1:** Gatsby throws massive, expensive parties at his mansion every weekend for his neighbors. (Plot-level fact)  
**SCORE 2:** Fitzgerald uses the description of Gatsby’s lavish parties to show how much money Gatsby has. (Technique + literal theme)  
**SCORE 3:** Fitzgerald depicts Gatsby’s parties as hollow spectacles to critique the superficiality of the American Dream. (Authorial intent)  
**SCORE 4:** While Gatsby’s parties appear to be celebrations of success, Fitzgerald uses them to highlight the paradox of 'belonging,' where Gatsby’s extreme wealth only further isolates him from the elite society he seeks to join. (Nuance/Paradox)

*Example set B — same scale on a different text:*  
**SCORE 1:** Romeo and Juliet meet at a party and fall in love despite their families being enemies. (Plot-level fact)  
**SCORE 2:** Shakespeare uses light and dark imagery when Romeo first sees Juliet on the balcony. (Technique + literal theme)  
**SCORE 3:** Shakespeare employs light imagery to argue that the lovers' passion is a transformative force that briefly transcends their violent environment. (Thematic effect)  
**SCORE 4:** Shakespeare establishes a persistent irony by framing Romeo and Juliet’s 'bright' love within the 'dark' shadow of death, suggesting that their union requires the total destruction of the social order that birthed them. (Irony/Complexity)

Check 2: Thematic Drift (against the **core argument** of the topic sentence)
Compare **every** analytical set to the topic sentence’s **core argument** (see Task preamble—not surface wording alone).
For each set:
**1 — Aligned:** The set’s claim and analysis are **relevant or mostly relevant** to the TS **core argument**; they help prove or unfold what the topic sentence is centrally arguing.

**0 — Drift:** The set’s claim is **not at all relevant** to that **core argument** (wrong focus, tangential reading, or a mini-argument that does not connect to what the TS is trying to establish), **or** it fails to set up / support the TS’s central proposition. **Do not** mark drift for minor wording mismatch when the **intellectual line** still serves the same core argument.

Criterion A overall grade (Step 3 of 4) — after Check 1 and Check 2, assign **criterionA_grade_step3** with a single integer **score** from **0 to 5** and a short **justification**, using Check 1’s topic-sentence sophistication score (1–4) and the pattern of relevance (1) vs drift (0) in Check 2.

**Stricter anchoring (drift = not at all relevant to the topic sentence’s core argument):** Each **0** is a **serious** failure of alignment. When choosing between two bands, **prefer the lower** score.

**5** — Check 1 **TS score 4**, and **zero** drift rows (**every** set **1** — all serve the TS **core argument**).

**4** — (**Check 1 TS 4** and **at most one** drift row) **or** (**Check 1 TS 3** and **zero** drift rows). **Never** assign **4** if TS is **3** and there is **≥1** drift.

**3** — Check 1 TS **2 or 3**, **≥ ~75%** of Check 2 rows are **1**, and **at most one** drift row. If Check 1 is **TS 2**, allow **3** only with **zero** drift **unless** the paragraph has **≤2** analytical sets, in which case **at most one** drift may still yield **3**.

**2** — Check 1 TS **1 or 2**, **or** TS **2–3** with **< ~75%** rows relevant, **or** **≥ two** drift rows when there are **≥3** analytical sets, **or** TS **1** with **≥1** drift.

**1** — **< ~50%** of rows relevant, **or** **≥ three** drift rows, **or** Check 1 TS **1** with **≥ two** drift rows, **or** the body is largely disconnected from the TS **core argument**.

0 = **Empty**, incoherent, or impossible to align meaningfully.

**Topic sentence vs [Source Text] — major misinterpretation penalty (MANDATORY, separate from Check 1 bands):**  
After you have a **provisional** Step 3 integer from **only** the Check 1 + Check 2 rules above, ask this **additional** question about the **topic sentence alone** (its central proposition about the passage, not peripheral phrasing): does it embed a **major misinterpretation** of the unseen extract — i.e. a claim that **contradicts the literal sense** of the source **or** what the source **clearly and materially implies** (implicit contradiction), such that the TS premise about the text is **wrong in substance** (not a small nuance disagreement, not acceptable alternative emphasis)?  
- If **yes**: **subtract exactly 1** from that provisional integer to produce **criterionA_grade_step3.score** (minimum **0**). **Do not** stack multiple −1s; at most one decrement per paragraph.  
- If **no**: output the provisional score unchanged.  
The **justification** must name whether the penalty applied; if it did, state the **provisional** band-table score and the **final** score after −1, and **one short phrase** naming the contradiction (literal or implicit). Check 1 sophistication scores are **not** substitutes for this test — a TS can be “sophisticated” yet still contradict the passage.

Output rules:
Return ONLY valid JSON matching the required schema. check2_thematicDrift must have **exactly one** object per analytical set listed above (same count and order as Step 2), with analyticalSetIndex matching 0, 1, 2, ... in order—**one drift row per multi-sentence verbatim span**, not per sentence inside that span. Include criterionA_grade_step3. Do not add prose outside the JSON.`;
}

/** Step 1/3 for Criterion B: benchmark of authorial choices + shifts (shifts not passed to step 2). */
const CRITERION_B_BENCHMARK_SCHEMA = {
  type: "object",
  properties: {
    authorialChoicesBenchmark: {
      type: "array",
      description:
        "Exactly 10 to 12 entries (inclusive): the most significant authorial craft choices in the passage. Order by passage chronology unless a single clear importance ranking is more useful—be consistent.",
      items: {
        type: "object",
        properties: {
          choiceLabel: {
            type: "string",
            description: "Short name of the craft choice (e.g. free indirect discourse, cyclical structure).",
          },
          significanceBrief: {
            type: "string",
            description: "One or two sentences: why this choice matters for meaning or effect.",
          },
          textualAnchor: {
            type: "string",
            description: "Brief pointer into the passage (image, moment, or quoted fragment); no invented line numbers.",
          },
        },
        required: ["choiceLabel", "significanceBrief", "textualAnchor"],
      },
    },
    shiftsInAuthorialChoices: {
      type: "object",
      description:
        "Significant shifts in dominant authorial strategy or craft focus across the passage. If none are significant, mark N/A.",
      properties: {
        significantShiftsPresent: {
          type: "boolean",
          description: "true only if there is at least one significant shift worth listing.",
        },
        chronologicalShifts: {
          type: "array",
          description:
            "If significantShiftsPresent is true: list ALL significant shifts in strict chronological order through the passage (beginning → end). If false: empty array.",
          items: {
            type: "object",
            properties: {
              orderInPassage: {
                type: "integer",
                description: "1-based position in chronological sequence (1 = earliest in text).",
              },
              shiftDescription: {
                type: "string",
                description: "What changes in authorial approach and why it matters.",
              },
            },
            required: ["orderInPassage", "shiftDescription"],
          },
        },
        notApplicableLabel: {
          type: "string",
          description:
            'If significantShiftsPresent is false, set this field exactly to the two characters: N/A. If true, use an empty string "".',
        },
      },
      required: ["significantShiftsPresent", "chronologicalShifts", "notApplicableLabel"],
    },
  },
  required: ["authorialChoicesBenchmark", "shiftsInAuthorialChoices"],
};

const CRITERION_B_SET_ITEM_SCHEMA = {
  type: "object",
  properties: {
    verbatim: {
      type: "string",
      description:
        "Exact substring from the student text for this quote+claim unit (character-for-character). Must fall in the body after that paragraph’s topic sentence. Together with sibling sets’ verbatims in reading order, must account for every character/sentence after the topic sentence—no orphaned prose.",
    },
    techniqueNamed: {
      type: "string",
      description:
        "Short label for the main craft/technique discussed in this set. NON-NEGOTIABLE: must be a contiguous verbatim substring from the student’s own prose (often multi-word, e.g. “imagery of mortality”)—include every word they used; do not shorten to a single word if they wrote several. If the student did not name it in their words, do not invent or infer—score technique accordingly and align checkpoints to what they actually wrote.",
    },
    techniqueQualityScore: {
      type: "integer",
      description:
        "Phase 2A: 0–2 only. Judge precision ONLY from terminology the student explicitly stated in their own words (techniqueNamed + student prose), not from narrower ideas visible only inside quoted evidence unless they also named that specificity. 2 = insightful/specific technique named by the student (e.g. animal imagery, juxtaposition of light and dark). 1 = good but broad or under-specified relative to what they actually said (e.g. they only wrote “imagery” while unpacking fire imagery only in quotes—still score as generic imagery → typically 1, not 2). 0 = unsuitable, menial, or incorrect for context. Judge ONLY from techniqueNamed + verbatim + Source Text; ignore checkpoint prose quality for this integer.",
      minimum: 0,
      maximum: 2,
    },
    techniqueQualityJustification: {
      type: "string",
      description:
        'NON-NEGOTIABLE format for this set’s technique reasoning. Must be exactly one prose block using this template (YY must match techniqueQualityScore: 0, 1, or 2): The technique is "[X]" in the student\'s words verbatim. This corresponds to level YY because ______. — [X] must be a contiguous substring copied EXACTLY from the student\'s own prose within this set (same spelling, same inflection, same words—do not paraphrase, synonymize, or "correct" the student). If the student did not name a technique in their words, explain that in the "because" clause and align YY with techniqueQualityScore (typically 0).',
    },
    specificRole_met: {
      type: "boolean",
      description:
        "true only if NON-NEGOTIABLE checkpoint rules are met: grounded in the passage, analyzed in the context of the technique the student claims, with qualifying student prose in notes (significant analytic flesh in the student’s own words; generic filler and quote-dominated spans do not qualify). false otherwise—no partial credit.",
    },
    specificRole_notes: {
      type: "string",
      description:
        "If true: paste the shortest sufficient verbatim student passage that earns this checkpoint; the span must carry significant analytic flesh in the student’s own (non-quoted) words—generic filler (is/are/the/author/writer as scaffolding, etc.) does not count; quotes cannot replace analysis. If false: explain briefly.",
    },
    linkToMessage_met: {
      type: "boolean",
      description:
        "true only if NON-NEGOTIABLE checkpoint rules are met: grounded in the passage, analyzed in the context of the technique the student claims, with qualifying student prose in notes (significant analytic flesh in the student’s own words; generic filler and quote-dominated spans do not qualify). false otherwise—no partial credit.",
    },
    linkToMessage_notes: {
      type: "string",
      description:
        "If true: paste the shortest sufficient verbatim student passage that earns this checkpoint; the span must carry significant analytic flesh in the student’s own (non-quoted) words—generic filler does not count; quotes cannot replace analysis. If false: explain briefly.",
    },
    subtleImplications_met: {
      type: "boolean",
      description:
        "true only if NON-NEGOTIABLE checkpoint rules are met: grounded in the passage, analyzed in the context of the technique the student claims, with qualifying student prose in notes (significant analytic flesh in the student’s own words; generic filler and quote-dominated spans do not qualify). false otherwise—no partial credit.",
    },
    subtleImplications_notes: {
      type: "string",
      description:
        "If true: paste the shortest sufficient verbatim student passage that earns this checkpoint; the span must carry significant analytic flesh in the student’s own (non-quoted) words—generic filler does not count; quotes cannot replace analysis. If false: explain briefly.",
    },
    audienceImpact_met: {
      type: "boolean",
      description:
        "true only if NON-NEGOTIABLE checkpoint rules are met: grounded in the passage, analyzed in the context of the technique the student claims, with qualifying student prose in notes (significant analytic flesh in the student’s own words; generic filler and quote-dominated spans do not qualify). false otherwise—no partial credit.",
    },
    audienceImpact_notes: {
      type: "string",
      description:
        "If true: paste the shortest sufficient verbatim student passage that earns this checkpoint; the span must carry significant analytic flesh in the student’s own (non-quoted) words—generic filler does not count; quotes cannot replace analysis. If false: explain briefly.",
    },
    reasoningDeducibleConclusion: {
      type: "integer",
      description:
        "Parallel to Criterion A reasoning (a) Deducible conclusion only: 0–2. Same rubric as Criterion A Step 2 for this dimension (clear mechanism 2 / strives 1 / fails 0).",
      minimum: 0,
      maximum: 2,
    },
    reasoningLinearCoherence: {
      type: "integer",
      description:
        "Parallel to Criterion A reasoning (c) Linear vs circular only: 0–1. Same rubric as Criterion A Step 2 for this dimension.",
      minimum: 0,
      maximum: 1,
    },
    criterionBReasoningJustificationAC: {
      type: "string",
      description:
        "Two labelled sections **(a)** and **(c)** only. In each, quote verbatim from this set’s student prose (exact words) showing why that sub-score was earned or lost; end by stating reasoningDeducibleConclusion and reasoningLinearCoherence and their sum (0–3).",
    },
  },
  required: [
    "verbatim",
    "techniqueNamed",
    "techniqueQualityScore",
    "techniqueQualityJustification",
    "specificRole_met",
    "specificRole_notes",
    "linkToMessage_met",
    "linkToMessage_notes",
    "subtleImplications_met",
    "subtleImplications_notes",
    "audienceImpact_met",
    "audienceImpact_notes",
    "reasoningDeducibleConclusion",
    "reasoningLinearCoherence",
    "criterionBReasoningJustificationAC",
  ],
};

const CRITERION_B_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    bodyParagraphs: {
      type: "array",
      description:
        "Each body paragraph: first sentence is the topic sentence for Phase 1. If the paste is one paragraph, use a single item. If multiple paragraphs separated by blank lines, one item per block (first sentence of each block = topic sentence).",
      items: {
        type: "object",
        properties: {
          paragraphIndex: { type: "integer", description: "0-based order in the student response." },
          topicSentenceVerbatim: {
            type: "string",
            description: "Exact topic sentence only (first sentence of that paragraph block).",
          },
          topicSentenceScore: {
            type: "integer",
            description: "Phase 1: 0-2 topic sentence rubric.",
          },
          topicSentenceTechniquesListed: {
            type: "string",
            description:
              "Comma-separated list of technique(s) as they appear verbatim in the topic sentence (may be multi-word phrases). Do not infer a more specific technique from quoted evidence elsewhere if the topic sentence only names a generic label.",
          },
          topicSentenceJustification: {
            type: "string",
            description:
              'NON-NEGOTIABLE format for Phase 1 topic-sentence technique reasoning. Must be exactly one prose block using this template (YY must match topicSentenceScore: 0, 1, or 2): The technique is "[X]" in the student\'s words verbatim. This corresponds to level YY because ______. — [X] must be a contiguous substring copied EXACTLY from the topic sentence (topicSentenceVerbatim) or from the student\'s wording in that first sentence (same characters; do not paraphrase or replace with other forms of the word). If no technique is present (score 0), [X] should still quote the shortest verbatim span from the topic sentence that shows descriptive/summary-only focus, and explain in the "because" clause.',
          },
          analysisSets: {
            type: "array",
            description:
              "Ordered quote+claim units after the topic sentence in that paragraph only. NON-NEGOTIABLE — full coverage: every sentence in this paragraph block except the excluded topic sentence (topicSentenceVerbatim) must lie inside exactly one set’s verbatim span; concatenate spans in order must equal the full student text after the topic sentence with no gaps and no overlap. No sentence may be omitted or left unaudited.",
            items: CRITERION_B_SET_ITEM_SCHEMA,
          },
        },
        required: [
          "paragraphIndex",
          "topicSentenceVerbatim",
          "topicSentenceScore",
          "topicSentenceTechniquesListed",
          "topicSentenceJustification",
          "analysisSets",
        ],
      },
    },
  },
  required: ["bodyParagraphs"],
};

/** Step 3/3: holistic Criterion B grade from audit digest only (no source, no full student text). */
const CRITERION_B_STEP3_SCHEMA = {
  type: "object",
  properties: {
    score: {
      type: "number",
      description:
        "Single holistic Criterion B grade, 0–5 inclusive. Half-steps (0.5) allowed when judgment sits exactly between two whole bands; use sparingly.",
    },
    justification: {
      type: "string",
      description:
        "IB examiner voice: exactly 3 to 4 complete sentences. Must explicitly state the assigned holistic score (e.g. 'I assign 4.0 out of 5') matching the score field. Anchor to the 0-5 band rubric (say which band fits). Reference the Step 1 authorial-choices benchmark where it clarifies central vs peripheral craft relative to the digest. Ground in digest tables, comments, set counts, weighted pattern. Prose only, no bullets; at least 3 sentences when digest has content.",
    },
  },
  required: ["score", "justification"],
};

/** Essay-mode only: whole-response holistic checks (shifts + genre-specific craft). */
const CRITERION_B_ESSAY_HOLISTIC_CHECKS_SCHEMA = {
  type: "object",
  properties: {
    shiftsPerBenchmarkRow: {
      type: "array",
      description:
        "One object per chronological shift from the Step 1 benchmark (same order and orderInPassage). Credit only **analytical** own-voice identification of the authorial shift — not **VAGUE** pivots or **DESCRIPTIVE** plot beats alone. If benchmark has no significant shifts, use an empty array.",
      items: {
        type: "object",
        properties: {
          orderInPassage: {
            type: "integer",
            description: "Must match the benchmark shift’s orderInPassage (1-based).",
          },
          shiftDescriptionFromBenchmark: {
            type: "string",
            description: "Copy or tightly paraphrase the benchmark shiftDescription for this row (for reader traceability).",
          },
          explicitlyClearlyStatedStudentVerbatim: {
            type: "boolean",
            description:
              "true only if the essay gives **specific analytical** own-voice prose that maps clearly onto **this** benchmark shift’s poles (dominant authorial method/mode/register/frame — not generic pivots, not plot-surface retell alone). **false** for **VAGUE** boilerplate (examinerShiftRowNote must contain **VAGUE**). **false** for **DESCRIPTIVE**-only wording — scene/action recap without analytical authorial-shift identification (examinerShiftRowNote must contain **DESCRIPTIVE**). In those denial cases studentVerbatimEvidence must be \"\".",
          },
          studentVerbatimEvidence: {
            type: "string",
            description:
              "If explicitlyClearlyStatedStudentVerbatim is true: shortest sufficient exact substring from the student essay that is **analytical** (identifies the authorial shift), **substantively specific** to this benchmark shift, and **not** generic boilerplate or descriptive plot beat alone. Otherwise empty string.",
          },
          examinerShiftRowNote: {
            type: "string",
            description:
              "1–3 sentences. If false because wording is **generic / boilerplate**, MUST contain **VAGUE** in ALL CAPS. If false because the best candidate is only **descriptive** (what happens on the page) without analytical authorial-shift framing, MUST contain **DESCRIPTIVE** in ALL CAPS. If false for both reasons, include **both** tokens. If false for other reasons (e.g. no attempt), explain. If true, briefly confirm how studentVerbatimEvidence maps to shiftDescriptionFromBenchmark.",
          },
        },
        required: [
          "orderInPassage",
          "shiftDescriptionFromBenchmark",
          "explicitlyClearlyStatedStudentVerbatim",
          "studentVerbatimEvidence",
          "examinerShiftRowNote",
        ],
      },
    },
    shiftsHolisticRating: {
      type: "string",
      enum: ["***", "**", "*"],
      description:
        "*** = clearly aware of all or most major authorial choices and shifts; ** = partially aware; * = does not focus on major choices/shifts beyond detail-level work.",
    },
    shiftsHolisticJustification: {
      type: "string",
      description:
        "3–6 sentences: state the rating token, count true vs total shift rows, cite pattern of verbatim evidence. No bullet list. If **any** shift row was denied as **VAGUE**, include **VAGUE** in ALL CAPS at least once. If **any** row was denied as **DESCRIPTIVE** (scene/action retell without analytical authorial-shift identification), include **DESCRIPTIVE** in ALL CAPS at least once.",
    },
    sourceGenreLabel: {
      type: "string",
      description:
        "Genre of the unseen source: literary or non-literary + precise form (e.g. free verse poem, short prose fiction, opinion column).",
    },
    genreSpecificTechniquesFoundInEssay: {
      type: "array",
      items: { type: "string" },
      description:
        "Short labels for genre/form-specific techniques the student explicitly discusses across the essay (calibrated to sourceGenreLabel).",
    },
    nonGenreSpecificTechniquesFoundInEssay: {
      type: "array",
      items: { type: "string" },
      description: "Techniques the student leans on that could apply in almost any genre without form-specific grounding.",
    },
    genreHolisticRating: {
      type: "string",
      enum: ["***", "**", "*"],
      description:
        "*** = analyses many genre-specific techniques; ** = analyses some; * = mostly generic techniques applicable anywhere.",
    },
    genreHolisticJustification: {
      type: "string",
      description: "3–6 sentences: state rating, name sourceGenreLabel, reference the two technique lists. No bullet list.",
    },
  },
  required: [
    "shiftsPerBenchmarkRow",
    "shiftsHolisticRating",
    "shiftsHolisticJustification",
    "sourceGenreLabel",
    "genreSpecificTechniquesFoundInEssay",
    "nonGenreSpecificTechniquesFoundInEssay",
    "genreHolisticRating",
    "genreHolisticJustification",
  ],
};

/**
 * @param {string} tier
 * @returns {string | null}
 */
function normalizeCriterionBEssayHolisticTier(tier) {
  const t = String(tier || "").trim();
  if (t === "***" || t === "**" || t === "*") return t;
  return null;
}

/** Truncate long digests for the final Criterion B assigner prompt. */
function truncCriterionBFinalDigest(s, max) {
  const t = String(s || "");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n…[truncated for length]`;
}

/** Official Criterion B (Paper 1 style) — descriptors as supplied for final IB mapping. */
const CRITERION_B_OFFICIAL_HEADING =
  "Criterion B: Analysis and interpretation — To what extent does the candidate analyze and evaluate how textual features and/or authorial choices shape meaning?";

/** Short title for the reference rubric table on the Criterion B detail page (parallel to CRITERION_A_KNOWLEDGE_RUBRIC_OFFICIAL_HEADING). */
const CRITERION_B_OFFICIAL_RUBRIC_TABLE_HEADING =
  "Criterion B — Analysis and interpretation (official band descriptors, 0–5)";

const CRITERION_B_OFFICIAL_DESCRIPTOR_BY_LEVEL = {
  0: "The work does not reach a standard described by the descriptors below.",
  1: "The response is descriptive and/or demonstrates little relevant analysis of textual features and/or authorial choices.",
  2: "The response demonstrates some appropriate analysis of textual features and/or authorial choices but is reliant on description.",
  3: "The response demonstrates a generally appropriate analysis of textual features and/or authorial choices.",
  4: "The response demonstrates an appropriate and at times insightful analysis of textual features and/or authorial choices. There is a good evaluation of how such features and/or choices shape meaning.",
  5: "The response demonstrates an insightful and convincing analysis of textual features and/or authorial choices. There is a very good evaluation of how such features and/or choices shape meaning.",
};

const CRITERION_B_IB_OFFICIAL_RUBRIC_BLOCK = `${CRITERION_B_OFFICIAL_HEADING}

0 — ${CRITERION_B_OFFICIAL_DESCRIPTOR_BY_LEVEL[0]}

1 — ${CRITERION_B_OFFICIAL_DESCRIPTOR_BY_LEVEL[1]}

2 — ${CRITERION_B_OFFICIAL_DESCRIPTOR_BY_LEVEL[2]}

3 — ${CRITERION_B_OFFICIAL_DESCRIPTOR_BY_LEVEL[3]}

4 — ${CRITERION_B_OFFICIAL_DESCRIPTOR_BY_LEVEL[4]}

5 — ${CRITERION_B_OFFICIAL_DESCRIPTOR_BY_LEVEL[5]}`;

/** Final Criterion B mark mapped to official 0–5 descriptors (0.5 steps). */
const CRITERION_B_FINAL_EXAMINER_SCHEMA = {
  type: "object",
  properties: {
    score: {
      type: "number",
      description:
        "Single final Criterion B mark for the response (or whole essay), 0–5 inclusive, in steps of 0.5 only. Use 0.5 only when judgment truly sits between two adjacent official descriptors.",
    },
    examinerReport: {
      type: "string",
      description:
        "Exactly 5 or 6 complete sentences, IB examiner voice, Criterion B only (analysis / evaluation of textual features and authorial choices shaping meaning). Must explicitly state the assigned numeric score at least once. Ground the decision in the official rubric wording above (quote or closely echo key phrases from the level you assign). Build from the digest evidence; no bullets.",
    },
  },
  required: ["score", "examinerReport"],
};

/**
 * @param {object} step2Data
 * @param {object} step3Data
 */
function buildCriterionBFinalExaminerDigestSingle(step2Data, step3Data) {
  const digest = buildCriterionBStep3AuditDigest(step2Data);
  const lines = [
    "=== Criterion B — Final examiner digest (single paragraph pipeline) ===",
    "",
    "### Holistic pole for this mode (~40% weight guidance)",
    "No separate whole-essay shifts/genre block. Weight the Step 3 holistic below heavily in that holistic share, together with how well the Step 2 tables show evaluation of authorial choices vs description.",
    "",
    "### Step 3 — digest holistic (per response)",
    `score: ${step3Data && step3Data.score != null ? step3Data.score : "—"} / 5`,
    truncCriterionBFinalDigest(
      step3Data && step3Data.justification != null
        ? String(step3Data.justification)
        : step3Data && step3Data.examinerSummary != null
          ? String(step3Data.examinerSummary)
          : "",
      CRITERION_B_FINAL_DIGEST_MAX_STEP3_SINGLE
    ),
    "",
    "### Step 2 — audit tables digest (~60% paragraph-weight evidence)",
    truncCriterionBFinalDigest(digest, CRITERION_B_FINAL_DIGEST_MAX_STEP2_SINGLE),
  ];
  return lines.join("\n");
}

/**
 * @param {{ essayParagraphBundles: object[], essayHolisticChecks?: object | null }} opts
 */
function buildCriterionBFinalExaminerDigestEssay(opts) {
  const bundles = Array.isArray(opts?.essayParagraphBundles) ? opts.essayParagraphBundles : [];
  const eh = opts?.essayHolisticChecks;
  const lines = [
    "=== Criterion B — Final examiner digest (essay — all graded body paragraphs) ===",
    "",
    "### Per-body Step 3 holistic marks (primary paragraph-weight signal)",
  ];
  for (let i = 0; i < bundles.length; i++) {
    const b = bundles[i];
    const s3 = b?.criterionBStep3Data;
    lines.push(`--- Body paragraph ${i + 1} — Step 3 ---`);
    lines.push(`score: ${s3 && s3.score != null ? s3.score : "—"} / 5`);
    lines.push(
      truncCriterionBFinalDigest(
        s3 && s3.justification != null
          ? String(s3.justification)
          : s3 && s3.examinerSummary != null
            ? String(s3.examinerSummary)
            : "",
        CRITERION_B_FINAL_DIGEST_MAX_BODY_STEP3
      )
    );
    lines.push("");
    lines.push(`--- Body paragraph ${i + 1} — Step 2 audit digest (truncated) ---`);
    const d = b?.criterionBData ? buildCriterionBStep3AuditDigest(b.criterionBData) : "";
    lines.push(truncCriterionBFinalDigest(d, CRITERION_B_FINAL_DIGEST_MAX_BODY_STEP2));
    lines.push("");
  }
  lines.push("### Whole-essay holistic checks (~40% holistic weight) — shifts + genre-specific");
  if (eh && typeof eh === "object") {
    const rows = Array.isArray(eh.shiftsPerBenchmarkRow) ? eh.shiftsPerBenchmarkRow : [];
    const t = rows.filter((r) => r && r.explicitlyClearlyStatedStudentVerbatim === true).length;
    lines.push(`Shifts rating: ${eh.shiftsHolisticRating != null ? String(eh.shiftsHolisticRating) : "—"}`);
    lines.push(
      truncCriterionBFinalDigest(
        eh.shiftsHolisticJustification != null ? String(eh.shiftsHolisticJustification) : "",
        CRITERION_B_FINAL_DIGEST_MAX_HOLISTIC_JUST
      )
    );
    lines.push(`Shift benchmark rows explicit in student essay: ${t} / ${rows.length}`);
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const ord = r.orderInPassage != null ? String(r.orderInPassage) : "?";
      const note = r.examinerShiftRowNote != null ? String(r.examinerShiftRowNote).trim() : "";
      if (note) {
        lines.push(
          `Shift row ${ord} note: ${truncCriterionBFinalDigest(note, CRITERION_B_FINAL_DIGEST_MAX_HOLISTIC_JUST)}`
        );
      }
    }
    lines.push(`Genre (source): ${eh.sourceGenreLabel != null ? String(eh.sourceGenreLabel) : "—"}`);
    lines.push(`Genre-specific holistic rating: ${eh.genreHolisticRating != null ? String(eh.genreHolisticRating) : "—"}`);
    lines.push(
      truncCriterionBFinalDigest(
        eh.genreHolisticJustification != null ? String(eh.genreHolisticJustification) : "",
        CRITERION_B_FINAL_DIGEST_MAX_HOLISTIC_JUST
      )
    );
    const gsp = Array.isArray(eh.genreSpecificTechniquesFoundInEssay) ? eh.genreSpecificTechniquesFoundInEssay : [];
    const gen = Array.isArray(eh.nonGenreSpecificTechniquesFoundInEssay) ? eh.nonGenreSpecificTechniquesFoundInEssay : [];
    lines.push(`Genre-specific techniques (labels): ${gsp.map(String).join("; ") || "—"}`);
    lines.push(`Non-genre-specific / generic (labels): ${gen.map(String).join("; ") || "—"}`);
  } else {
    lines.push("(Essay holistic checks object missing — weight paragraph evidence accordingly.)");
  }
  return lines.join("\n");
}

/**
 * @param {string} digestText
 * @param {boolean} essayMode
 */
function buildCriterionBFinalExaminerMessage(digestText, essayMode) {
  const d = String(digestText || "").trim();
  const modeLabel = essayMode
    ? "**entire essay** (all graded body paragraphs together, plus whole-essay shifts/genre holistics in the digest)"
    : "**single paragraph** response (Step 2 tables + Step 3 holistic in the digest)";
  return `Criterion B — Final IB examiner assignment (official descriptor bands)

Role: You are an experienced IB English A examiner. Judge **only** the criterion described by the official descriptors below — analysis and evaluation of **how textual features and/or authorial choices shape meaning** — for the ${modeLabel}. Output **one** final mark **0–5** in **0.5** steps **only** when you are genuinely torn between two adjacent official levels.

${CRITERION_B_IB_OFFICIAL_RUBRIC_BLOCK}

---

**NON-NEGOTIABLE — No inference beyond the student’s explicit analysis:**

- A student earns credit **only** when the digest shows they stated the relevant idea **explicitly in their own words** (not merely through quotes that could imply it).
- You **absolutely cannot infer** understanding the student did not express. If a benchmark/holistic idea is not explicitly addressed in the student’s own language as quoted in the digest, treat it as **missing** (descriptive rather than analytical).
- Example: if the benchmark shift is “nostalgic childhood → decaying present” and the student only juxtaposes “natural beauty” vs “rumbling heap of black sticks”, that does **not** earn shift credit unless they explicitly connect it to **past vs present** in their own words.

**How to combine evidence (follow closely — same spirit as the Criterion A final whole-essay assigner):**

1. **Approximate weighting:** give roughly **70%** of your judgment to **paragraph-level** evidence in the digest (Step 2 audit tables: topic sentences, per-set technique quality, checkpoints, reasoning (a)/(c), computed totals, comments). Give roughly **30%** to **holistic** evidence in the digest: for **essay** mode, the **whole-essay shifts** and **genre-specific** star ratings (\`***\` / \`**\` / \`*\`), their justifications, and explicit shift-row counts; for **single-paragraph** mode, treat **Step 3 holistic** (score + prose) as the anchor for that holistic share together with how evaluative vs descriptive the Step 2 pattern is. Do **not** mechanically average paragraph Step 3 scores unless the digest explicitly lists a mean — **synthesize** qualitative fit to the official descriptors.

2. **Frequent student performance calibration (use with official descriptors; not a mechanical formula):**
   - **5:** A **fine spread** of **5**s and **4**s across paragraph-level **Step 3** marks, with **nearly half** of paragraphs at **5**; **strong** awareness of **broader shifts** and **genre-specific** technique (essay holistic: typically \`***\` on **both** shifts and genre when those rows are present, or clearly equivalent strength from the digest).
   - **4:** **Mostly 4**s across paragraph Step 3 marks, **some 3**s but **fewer than about a quarter**; **good** awareness of **at least one** of **broader shifts** or **genre-specific** technique (essay holistic: often \`**\` or \`***\` on at least one dimension).
   - **3:** **Mostly 3**s with **some notable 4**s and **maybe a few 2**s; **some** awareness of **broader shifts** or **genre-specific** technique but **thin**, **inconsistent**, or **not detailed** (mixed \`*\` / \`**\` holistics, or strong tables but weak holistics — justify).
   - **2:** A **spread of 2**s and **3**s; **little or no** convincing awareness of **broader shifts** and **genre-specific** technique in the holistic material when essay mode applies.
   - **1:** A **spread of 1**s and **2**s; **mostly descriptive** with little relevant analysis.
   - **0:** Does **not** reach the standard of descriptor **1**.

3. **Half marks:** use **0.5** **only** between **two adjacent** official levels when the evidence truly straddles both.

4. **examinerReport:** **Exactly five or six sentences.** Criterion B only. Tie reasoning to **exact rubric language** (e.g. "insightful and convincing", "good evaluation of how such features … shape meaning", "reliant on description", "little relevant analysis") **and** to named patterns in the digest. State the final mark clearly.

---

**Digest (all evidence you may use for this assignment):**

${d}

---

Output **only** valid JSON matching the schema: **score** and **examinerReport**. No markdown fences, no text outside the JSON.`;
}

/**
 * Step 1/3 — full source text only (no student paragraph).
 * @param {string} sourceText
 */
function buildCriterionBBenchmarkMessage(sourceText) {
  const s = sourceText.trim();
  if (!s) return "";

  return `Criterion B — Step 1 of 3 (Benchmark only)

Role: You are an expert IB English Examiner specializing in Criterion B: Analysis and Evaluation.

Task: Read the ENTIRE [Source Text] below from first character to last. Do not summarize it away, skip sections, or replace it with an outline. Every sentence of the passage may carry craft decisions.

[Source Text] — COMPLETE (entire passage; nothing omitted):

${s}

---

Part A — Authorial choices benchmark

List exactly **10 to 12** of the **most significant** authorial choices in this passage (craft, structure, voice, imagery patterns, register, syntax, narrative method, symbolic patterning, dialogue construction, focalization, etc.). Each entry must be defensible from the wording on the page.

Part B — Shifts in authorial choices

Determine whether there are **significant** shifts in authorial strategy or dominant craft **across** the passage (e.g. tone pivot, focalization change, move from exterior action to interiority, shift from staccato to long periodic sentences).

- If **yes**: in \`chronologicalShifts\`, output **all** such significant shifts in **strict chronological order** as the reader moves through the passage (use \`orderInPassage\` 1, 2, 3, … matching that order).

- If **no**: set \`significantShiftsPresent\` to false, set \`chronologicalShifts\` to an empty array, and set \`notApplicableLabel\` exactly to \`N/A\`.

Output rules:

Return ONLY valid JSON matching the required schema. No markdown fences, no commentary outside the JSON.`;
}

/**
 * Serialize only the authorial-choices list for Step 2 (excludes shifts).
 * @param {object} benchmarkData
 */
function formatAuthorialChoicesBenchmarkForGrading(benchmarkData) {
  const choices = Array.isArray(benchmarkData?.authorialChoicesBenchmark)
    ? benchmarkData.authorialChoicesBenchmark
    : [];
  if (!choices.length) {
    return "(No authorial choices were returned in the benchmark.)";
  }
  return choices
    .map((c, i) => {
      const label = c.choiceLabel != null ? String(c.choiceLabel) : `Choice ${i + 1}`;
      const sig = c.significanceBrief != null ? String(c.significanceBrief) : "";
      const anchor = c.textualAnchor != null ? String(c.textualAnchor) : "";
      return `${i + 1}. ${label}\n   Significance: ${sig}\n   Textual anchor: ${anchor}`;
    })
    .join("\n\n");
}

/**
 * @param {object} benchmarkData
 */
function formatBenchmarkShiftsForEssayHolistic(benchmarkData) {
  const shifts = benchmarkData?.shiftsInAuthorialChoices;
  if (!shifts || typeof shifts !== "object") {
    return "(No shifts structure in benchmark.)";
  }
  if (!shifts.significantShiftsPresent) {
    return `No significant shifts in benchmark (${shifts.notApplicableLabel != null ? String(shifts.notApplicableLabel) : "N/A"}). chronologicalShifts is empty — use an empty shiftsPerBenchmarkRow array in output.`;
  }
  const list = Array.isArray(shifts.chronologicalShifts) ? [...shifts.chronologicalShifts] : [];
  list.sort((a, b) => (a.orderInPassage ?? 0) - (b.orderInPassage ?? 0));
  if (!list.length) {
    return "(Benchmark marked significant shifts but chronologicalShifts is empty.)";
  }
  return list
    .map((s) => {
      const ord = s.orderInPassage != null ? String(s.orderInPassage) : "?";
      const d = s.shiftDescription != null ? String(s.shiftDescription) : "";
      return `${ord}. ${d}`;
    })
    .join("\n\n");
}

/**
 * Essay mode: full student response + full benchmark (choices + shifts).
 * @param {string} sourceText
 * @param {string} fullStudentEssay
 * @param {object} benchmarkData
 */
function buildCriterionBEssayHolisticChecksMessage(sourceText, fullStudentEssay, benchmarkData) {
  const s = sourceText.trim();
  const e = fullStudentEssay.trim();
  const choicesBlock = formatAuthorialChoicesBenchmarkForGrading(benchmarkData || {});
  const shiftsBlock = formatBenchmarkShiftsForEssayHolistic(benchmarkData || {});

  return `Criterion B — Essay mode: full-response holistic checks (separate from per-body paragraph table marks)

Role: You are an expert IB English Examiner (Criterion B: Analysis and Evaluation).

Inputs (strict):
- **[Source Text]** — entire unseen extract.
- **[Student essay]** — the candidate’s **complete** Paper 1 style analysis (intro, body paragraphs, conclusion) as one continuous submission.
- **[Benchmark — authorial choices]** — Step 1 list (reference for macro craft; not a checklist limiting valid student moves).
- **[Benchmark — shifts]** — Step 1 chronological shifts only. **Do not invent shifts** not listed there.

---

**NON-NEGOTIABLE — No inference beyond the student’s explicit analysis (benchmark matching must be explicit):**

- A row/check earns credit **only** when the student explicitly addresses the benchmark idea **in their own words**.
- You **absolutely cannot infer** “they understood the benchmark” from quoted details alone. If the student’s wording does not explicitly name the benchmark concept (or an unmistakably direct equivalent) then the row is **false**.
- Example: if a benchmark shift is “nostalgic childhood → decaying present” and the student only juxtaposes “natural beauty” vs “rumbling heap of black sticks”, that does **not** earn the shift row unless they explicitly articulate **past vs present** (or the shift’s concept) in their own words.

**NON-NEGOTIABLE — Shift credit requires specificity in verbatim student prose (VAGUE = no credit):**

- **Generic pivot language** (“a different perspective”, “shifts tone”, “contrasts with the first”, “completely different”, “moves on to something else”, etc.) **without** tying to **this** benchmark row’s **named intellectual substance** → **no credit** for that shift row.
- **explicitlyClearlyStatedStudentVerbatim** must be **false** and **studentVerbatimEvidence** must be \`""\` when the best available student wording is **too VAGUE** to map the benchmark shift (even if it gestures at “change”).
- **examinerShiftRowNote** for that row **MUST** contain the token **VAGUE** in ALL CAPS and briefly quote or name the generic student phrasing that failed.
- **Calibration example (illustrative — apply by analogy):** If the benchmark shift is: *Shift from an abstract, surrealist exploration of grief and emotion (first guitar) to a concrete, historical narrative of migration and cultural identity (second guitar).* and the student writes only: *The second guitar offers a completely different perspective.* → that is **too VAGUE** to show awareness of **abstract/surrealist grief → concrete/historical migration/identity**. **Deny credit:** \`explicitlyClearlyStatedStudentVerbatim\`: **false**, \`studentVerbatimEvidence\`: \`""\`, \`examinerShiftRowNote\` **must include VAGUE** explaining that the span does not name the benchmark’s poles.
- If **any** row is denied as **VAGUE** under this rule, **shiftsHolisticJustification** must also include the token **VAGUE** (ALL CAPS) at least once summarizing that failure pattern.

**NON-NEGOTIABLE — Shift identification requires analytical own-voice prose (DESCRIPTIVE = no credit):**

- To identify a benchmark shift, the student’s candidate **verbatim own-language** must be **analytical** — it must articulate **how dominant authorial method, focus, register, framing, or macro strategy changes** in a way that maps **this** benchmark row — **not** **descriptive** narration of **what happens** on the page (plot beat, action chain, atmosphere recap) **without** that analytical shift framing.
- **Example (deny credit):** *Suddenly, someone opens the door and the guitars hush.* — this is **DESCRIPTIVE** (who does what / sensory beat); it does **not** identify the **authorial shift** (e.g. surrealist grief exploration vs concrete historical narrative) in the student’s **own analytical words**. → **explicitlyClearlyStatedStudentVerbatim**: **false**, **studentVerbatimEvidence**: \`""\`, **examinerShiftRowNote** **must include DESCRIPTIVE** in ALL CAPS and explain that the span is scene-level description, not authorial-method analysis.
- If **any** row is denied as **DESCRIPTIVE** under this rule, **shiftsHolisticJustification** must also include the token **DESCRIPTIVE** (ALL CAPS) at least once.

**Check 1 — Shifts (whole essay)**

For **each** shift listed under **[Benchmark — shifts]** (chronological order), decide whether the student **explicitly and clearly** shows awareness of that **change in dominant authorial strategy or craft** using **their own wording** in the essay — in **analytical** register, **not** descriptive retell alone. **Do not credit** vague mood or theme unless the prose clearly targets a **pivot / structural or method shift** aligned with the benchmark row.

- Emit **shiftsPerBenchmarkRow**: one row per benchmark shift; \`orderInPassage\` must match the benchmark. Copy the benchmark’s shift idea into **shiftDescriptionFromBenchmark** for traceability.

- **explicitlyClearlyStatedStudentVerbatim** = **true** only when **studentVerbatimEvidence** is a **specific analytical** exact substring: the student’s own words must map clearly onto **this row’s** benchmark substance (both sides of the shift or an unmistakable equivalent). **false** for **VAGUE-only** or **DESCRIPTIVE-only** cases (see NON-NEGOTIABLE blocks above). If **false**, **studentVerbatimEvidence** must be \`""\`.

- **examinerShiftRowNote** (required every row): as in schema — if denied for **VAGUE**, **VAGUE** in ALL CAPS is mandatory in that note; if denied for **DESCRIPTIVE**, **DESCRIPTIVE** in ALL CAPS is mandatory; if both failures apply, include **both** tokens.

Then assign **shiftsHolisticRating** using **only** \`***\`, \`**\`, or \`*\`:

- \`***\` — Clearly aware of **all or most major** authorial choices **and** shifts (strong explicit coverage across benchmark shifts).

- \`**\` — **Partial** awareness: some major shifts or central macro craft explicit; others missing or only thinly implied.

- \`*\` — Does **not** focus on major authorial choices **and** shifts beyond local/detail-level work; macro shifts largely absent.

**shiftsHolisticJustification:** 3–6 complete sentences stating the token, how many shift rows are **true** vs total, and the evidence pattern (no bullets). If **any** row was **VAGUE**-denied, include **VAGUE** (ALL CAPS) at least once. If **any** row was **DESCRIPTIVE**-denied, include **DESCRIPTIVE** (ALL CAPS) at least once.

If **[Benchmark — shifts]** reports **no significant shifts**, **shiftsPerBenchmarkRow** must be \`[]\`, set **shiftsHolisticRating** to \`*\` unless the essay is exceptionally explicit on macro pivots anyway—justify honestly.

---

**Check 2 — Genre-specific techniques (whole essay)**

1. From **[Source Text]**, set **sourceGenreLabel**: **literary** or **non-literary** plus precise form (e.g. *free verse poem*, *dramatic monologue*, *short prose fiction*, *blog / opinion column*, *speech*, etc.).

2. Scan **[Student essay]** for techniques the student **explicitly** discusses. Fill two arrays of **short string labels**:
   - **genreSpecificTechniquesFoundInEssay** — devices **specific to that genre/form** (e.g. poetry: metre, stanza, rhyme, enjambment, volta; prose fiction: narrative perspective, focalization, free indirect discourse; non-literary: headline / subhead pattern, direct address, multimodal cues implied by copy—**calibrate to sourceGenreLabel**).
   - **nonGenreSpecificTechniquesFoundInEssay** — generic moves that could apply in **any** genre without form-specific bite (e.g. vague “imagery”, “tone”, “word choice” **without** tying to form-specific function).

3. Assign **genreHolisticRating** (\`***\` / \`**\` / \`*\` only):

- \`***\` — Analyses **many** genre-specific techniques with clear spread through the essay.

- \`**\` — Analyses **some** genre-specific techniques, or uneven mix.

- \`*\` — Mostly techniques **not** specific to the genre (could apply anywhere); form-specific reading thin.

**genreHolisticJustification:** 3–6 complete sentences naming the token and **sourceGenreLabel**, referencing both lists (no bullets).

---

[Source Text] — COMPLETE:

${s}

[Benchmark — authorial choices]:

${choicesBlock}

[Benchmark — shifts across the passage]:

${shiftsBlock}

[Student essay] — COMPLETE:

${e}

---

Output: **ONLY** valid JSON matching the required schema (no markdown fences, no commentary outside JSON).`;
}

/**
 * Step 2/3 — full source + student paragraph; benchmark block = authorial choices only.
 * @param {string} sourceText
 * @param {object} benchmarkData
 * @param {string} studentParagraph
 */
function buildCriterionBGradingMessage(sourceText, benchmarkData, studentParagraph) {
  const s = sourceText.trim();
  const p = studentParagraph.trim();
  const choicesBlock = formatAuthorialChoicesBenchmarkForGrading(benchmarkData);

  return `Criterion B — Step 2 of 3 (Grading)

Role: You are an expert IB English Examiner specializing in Criterion B: Analysis and Evaluation with **20+ years** of experience. Your goal is to provide a granular, objective assessment of a student's ability to deconstruct authorial craft.

NON-NEGOTIABLE — Benchmark use (reference only):

- A separate Step 1 benchmark was built from the same passage. It included (1) a list of **authorial choices** and (2) a **shifts** section.

- For THIS step you receive **only** the **Authorial choices** list below under [Benchmark — authorial choices only].

- Treat that list as **non-exhaustive reference** for what might count as **central** craft in this passage. It **does not** list every legitimate technique a student could analyze; it **can signal** fruitful directions only.

- You **must not** treat, invent, or infer content from a "shifts" section — it was **deliberately withheld** from this prompt. Do not assume shifts unless the student or the **Source Text** itself supports them.

Grounding: Use the [Source Text] to verify that techniques and interpretations are plausible. Do not invent passage details.

---

**NON-NEGOTIABLE — No inference beyond the student’s explicit analysis (checkpoint evidence must be explicit and in their own words):**

- A checkpoint or technique score can be supported **only** by what the student explicitly states **in their own words** inside the set (not by what could be inferred from the quoted passage).
- You **absolutely cannot infer** benchmark understanding the student did not express. If the student’s prose is descriptive (labels + quotes) without explicit analytical articulation of the required idea, the checkpoint is **false**.
- Example: if the benchmark idea is “shift from nostalgic childhood → decaying present” and the student only juxtaposes “natural beauty” vs “rumbling heap of black sticks”, that does **not** earn a benchmark-aligned point unless the student explicitly states the **past vs present** shift (or equivalent) in their own words.

NON-NEGOTIABLE — **Technique name in student text**

- **techniqueNamed** must appear **verbatim** in the student’s own response (the same words, as they wrote them). It must **not** be inferred, paraphrased by you, or “filled in” if they did not say it. If they did not name the technique in their prose, **do not hallucinate** that they did—set **techniqueQualityScore** and checkpoints accordingly (typically **techniqueQualityScore = 0** and checkpoints **false** unless the student still earns them under the rules below using only what they actually wrote).

**TIP — Multi-word labels & do not upgrade from quotes alone:**

- **techniqueNamed** may span **multiple contiguous words** verbatim (e.g. **“imagery of mortality”**). Quote **all** of those words in **techniqueNamed** and in **[X]** in **techniqueQualityJustification**—do not drop words the student actually wrote.
- If the student’s **own wording** only states a **generic** label (e.g. **“imagery”**) but unpacks something more specific (e.g. fire) **only inside quoted evidence** or by implication—**without** ever explicitly naming the fuller technique in their own words (e.g. never writes “fire imagery”)—treat their **declared** technique as **“imagery”** for **techniqueQualityScore**. That is typically **1** (broad / not precise), **not 2**; **do not** award **2** by inferring a sharper technique from the quotes.

---

Scoring independence (CRITICAL):

(1) **Technique quality (techniqueQualityScore 0–2)** must be judged **only** from (a) whether the student **actually named** the technique in their text (see rule above), (b) **techniqueNamed** matching that verbatim student wording, (c) the **verbatim** span, and (d) the **Source Text**. Do **not** raise or lower **techniqueQualityScore** because checkpoint prose is strong or weak.

**techniqueQualityScore (0–2 only):**

- **2 — Insightful technique:** e.g. animal imagery, superstition, juxtaposition between light and dark—**specific**, text-driven, and materially significant to meaning or effect in this passage.

- **1 — Good technique, but not precise:** e.g. generic “imagery,” alliteration, anaphora, simile—valid but broad or under-specified relative to what the passage is doing.

- **0 — Unsuitable / menial / incorrect:** incorrect technique for this context, fixation on menial devices not aligned with authorial intent, or descriptive summary masquerading as craft analysis.

(2) **Four checkpoints (booleans + notes only)** — **specificRole_met**, **linkToMessage_met**, **subtleImplications_met**, **audienceImpact_met**:

**NON-NEGOTIABLE RULE 1 — Grounding:** Each checkpoint you mark **true** must be **grounded in the [Source Text]** and **analyzed in the context of the literary or non-literary technique the student is actually claiming to analyze in this set** (the technique reflected in **techniqueNamed** and student wording). If not, **false** — **no partial marks**.

**NON-NEGOTIABLE RULE 2 — Verbatim student prose per checkpoint:** If you set a checkpoint to **true**, you **must** in the corresponding **\`*_notes\`** field paste **verbatim** student prose that **by itself** satisfies that checkpoint. Requirements for that pasted span:

- **MANDATORY notes format (always):** In each checkpoint **\`*_notes\`** field (whether the checkpoint is **true** or **false**), you must use this exact sentence format:
  - \`The students response verbatim which shows this is "[X]", which meets this checkpoint because ______ explicitly.\`
  - If the checkpoint is **false**, keep the exact structure but replace **meets** with **does not meet**, and explain what is missing **explicitly** in the blank.
  - **[X] must be verbatim** student wording from this set, kept as short as possible while still evidencing the claim.

- **Length:** at least **7–8 words** total in the pasted student span.

- **Substance in the student’s own words (critical):** Affirming the checkpoint must rest on a **significant portion** of **meaning-bearing** student-authored analysis—not on glue, labels, or the passage in quotes. **Generic filler does not count** toward meeting the bar: e.g. bare **is / are / the / a / and / but**, rote tags like **author / writer / text** when they only scaffold a sentence, or empty verbs like **shows / conveys** **unless** they introduce **substantive** analytic content in the same span. The **key analytic flesh**—the actual claim about **role, message, implication, or effect** tied to the named technique—must appear in **their own words** (not as strings inside quotation marks from the unseen). **Quoted evidence may support** the point but **must not** do the analytical work **for** the student; if the pasted span is mostly quotation with only filler between, **false** — **no credit**.

- **Student’s own analytical words:** at least **6** words in the pasted span must count as **non-quoted, analytical lexical work** per the paragraph above (not passage quotation, not pure filler as listed). **Quoted words from the unseen must remain a minority** of the pasted span.

- **One checkpoint = one distinct analytical job:** A single sentence or single analytical phrase **cannot** earn **two** checkpoints at once—if the prose is too thin to separate roles, cap at **one** **true** among the four or set multiple to **false**. Bad patterns: mostly **quotes** from the passage with little student reasoning, or using **quotes alone** to stand in for analysis—**no credit**.

**NON-NEGOTIABLE RULE 3 — No duplicated evidence across checkpoints (FAIL CONDITION):** Within the **same set**, **no two checkpoints** may cite the **same phrase** or the **same verbatim span** as evidence in their **\`*_notes\`**. If two checkpoints would be supported by the same student words, you must **not** reuse that evidence verbatim: either (a) **split** the student’s language into two distinct, non-overlapping verbatim snippets if the student truly provides two separate pieces of qualifying analysis, or (b) if the student’s own language is too thin to support both separately, then **pass one checkpoint and fail the other**. **Always, never repeat the evidence verbatim.** If you repeat evidence verbatim for two checkpoints in the same set, you will **fail the task**.

**Good example (fictional):** “The author’s choice of 'stagnant' effectively mirrors the emotional paralysis and lack of agency felt by the protagonist.”

**Bad example (no credit):** “The writer uses 'shattered glass' and 'jagged shards' to show that everything is 'broken and dangerous.'” (Too quote-dominated; not enough **own** analytical words meeting the bar.)

**Checkpoint score band (application-computed from count of \`true\` among the four):** 1 checkpoint → **2** points · 2 checkpoints → **4** points · 3–4 checkpoints → **6** points · 0 checkpoints → **0** points.

(3) **Reasoning sub-scores (Criterion A parallel — (a) and (c) only):** Output integers **reasoningDeducibleConclusion** (0–2) and **reasoningLinearCoherence** (0–1) using the **exact** standards of Criterion A Step 2 reasoning for those two dimensions:

**(a) Deducible conclusion — reasoningDeducibleConclusion (0–2)**

**2 — Clear mechanism visible:** The writer **explains** the quote/evidence and **purposefully** uses it to **prove** the claim. They **explicitly justify** how the quote—and **which part**—proves the claim, instead of only summarizing the quotation. The logic must **reasonably follow sentence by sentence** from that explanation; the reader should not be left to invent the bridge.

**1 — Strives toward 2:** Mostly aims at the same standard as **2**, but some part of the reasoning is **confusing on a minor level**, or contains **one small leap** that weakens the chain.

**0 — Fails:** Does **not** meet **1** or **2**: reasoning **unclear**, **unjustified**, or the link from evidence to claim is missing or incoherent.

**(c) Linear vs circular reasoning — reasoningLinearCoherence (0–1)**

**1:** The reasoning is **linear** and **clear**; **each sentence follows** the sentence before with **clear purpose**; the chain of thought is apparent.

**0:** The reasoning is **circular**, **redundant**, or **confusing**, or **assumes what it is trying to prove**.

**Reasoning adjustment (application-computed):** Let **S = reasoningDeducibleConclusion + reasoningLinearCoherence** (must be 0–3). If **S = 3** → **+1**; if **S = 2** → **0**; if **S = 0 or 1** → **−1**.

(4) **Total set score (0–9, capped):** The host computes **total = techniqueQualityScore + checkpointBandPoints + reasoningAdjustment**, then **clamps** to **minimum 0** and **maximum 9.0**. Do **not** output this total in JSON.

(5) Fill **criterionBReasoningJustificationAC** with labelled sections **(a)** and **(c)** only: verbatim student quotations from **this set** showing why each sub-score was earned or lost; end by stating the two integers and **S**.

Input:

[Source Text] — COMPLETE (entire passage; nothing omitted):

${s}

[Benchmark — authorial choices only — from Step 1; use this for calibration]:

${choicesBlock}

[Student response]:

${p}

---

Phase 1: Topic Sentence Assessment

For each body paragraph, locate the Topic Sentence (first sentence of the paragraph block). Assign topicSentenceScore from 0–2:

2 (Broad/Significant Technique): Includes a broad authorial strategy (e.g., structural shifts, characterization, recurring motifs, narrative perspective).

1 (Narrow Technique): Includes a specific, localized device (e.g., alliteration, onomatopoeia, a single metaphor).

0 (Descriptive/Summary): No technique mentioned; focuses purely on plot or "what" is happening rather than "how" it is done.

**NON-NEGOTIABLE — topicSentenceJustification (Phase 1 technique reasoning):** Output **topicSentenceJustification** using **exactly** this template (YY = **topicSentenceScore**, 0 / 1 / 2):

\`The technique is "[X]" in the student's words verbatim. This corresponds to level YY because ______.\`

- **[X]** = a **contiguous verbatim substring** from the **topic sentence** (the student’s exact words). **Do not** paraphrase, synonymize, “fix” grammar, or swap in other forms of the same idea—**verbatim only**.
- The **because** clause must justify **explicitly** why that verbatim technique wording earns **level YY** under the Phase 1 rubric above.

**TIP (Phase 1):** **topicSentenceTechniquesListed** must use **verbatim** phrases from the topic sentence (multi-word allowed). If the topic sentence only says **“imagery”** but richer specificity appears **only** in later sentences or inside quotes, **do not** treat the topic sentence as naming that specificity—score Phase 1 from what the **first sentence** actually says.

---

Phase 2: Evidence & Analysis Deep-Dive

For every set of evidence/analysis (quote+claim) after the topic sentence in that paragraph, assign **techniqueQualityScore (0–2)**, the **four checkpoint booleans + notes**, **reasoningDeducibleConclusion**, **reasoningLinearCoherence**, and **criterionBReasoningJustificationAC**.

**NON-NEGOTIABLE — techniqueQualityJustification (per-set technique reasoning):** For **each** analysis set, fill **techniqueQualityJustification** using **exactly** this template (YY = **techniqueQualityScore** for that set, 0 / 1 / 2):

\`The technique is "[X]" in the student's words verbatim. This corresponds to level YY because ______.\`

- **[X]** = a **contiguous verbatim substring** from the **student’s prose in this set** (normally inside **verbatim**) naming or clearly referring to the technique you are scoring. **Do not** paraphrase or substitute other word forms—**verbatim only**. If the student did not name a technique, state that **explicitly** in the **because** clause and set **techniqueQualityScore** / YY accordingly (typically **0**).

---

Segmentation rules (align with **Criterion A** Step 2)

**NON-NEGOTIABLE — Complete coverage (no gaps):** In each body paragraph block, **every sentence except the excluded topic sentence** must belong to **exactly one** analytical set. The ordered **verbatim** spans for that paragraph’s **analysisSets** must concatenate (in reading order) to cover **all** student text **after** **topicSentenceVerbatim**—**no** sentence left outside a set, **no** duplicated coverage, **no** gaps. If you would otherwise leave a sentence unaudited, **merge** or **extend** sets so it is included (still respecting same-evidence grouping below).

Use the **same** analytical-set logic as Criterion A: **same quoted or paraphrased evidence anchor → one set** in **verbatim**; **new quotation** or a **clearly distinct new paraphrased/cited anchor** from the passage → **start a new set** (when in doubt, **split** at the new quote). **Never** isolate trailing analysis as its own set if it only unpacks the **immediately preceding** quote or the **same** paraphrased anchor.

Paragraph structure:

- If the student pasted ONE paragraph, use one bodyParagraphs item: topicSentenceVerbatim = first sentence; analysisSets cover the remainder in reading order.

- If MULTIPLE paragraphs separated by one or more blank lines, split into blocks; each block’s first sentence is that block’s topic sentence; analysisSets contain only material after that topic sentence within the block.

- **verbatim** for each set must be copied exactly from the student text so highlighting works.

---

Output

Return ONLY JSON matching the schema. Do **not** include any holistic Criterion B grade, mean score, or overall examiner summary for the whole response — a separate step will assign the final band from your tables only.

**Do not** include aggregate per-set totals in JSON. The application computes: **checkpointBandPoints** = 0 / 2 / 4 / 6 from the count of **true** among the four checkpoints; **reasoningAdjustment** = +1 / 0 / −1 from **(reasoningDeducibleConclusion + reasoningLinearCoherence)**; **totalSetScore** = clamp( **techniqueQualityScore** + **checkpointBandPoints** + **reasoningAdjustment**, 0, 9 ).

Do not output markdown outside JSON.`;
}

/**
 * @param {number} n
 * @returns {number | null}
 */
function normalizeCriterionBHolisticScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const clamped = Math.max(0, Math.min(5, x));
  return Math.round(clamped * 2) / 2;
}

/**
 * When JSON mode is off, models sometimes emit snake_case. Normalize before validation and digest.
 * @param {object} data
 * @returns {object}
 */
function normalizeCriterionBStep2ResponseShape(data) {
  if (!data || typeof data !== "object") return data;
  const out = { ...data };
  if (!Array.isArray(out.bodyParagraphs) && Array.isArray(out.body_paragraphs)) {
    out.bodyParagraphs = out.body_paragraphs;
  }
  return out;
}

/**
 * Flat text digest of step-2 tables + comments for step 3 only (no source / no full paragraph).
 * @param {object} step2Data
 */
function buildCriterionBStep3AuditDigest(step2Data) {
  const paras = Array.isArray(step2Data?.bodyParagraphs) ? step2Data.bodyParagraphs : [];
  const lines = [
    "=== Criterion B — Step 2 audit digest (tables + comments only) ===",
    "The reader of this digest does not have the unseen source passage or the full student response in front of them.",
    "",
  ];

  for (const p of paras) {
    const pIdx = p.paragraphIndex != null ? p.paragraphIndex : 0;
    lines.push(`--- Paragraph index ${pIdx} — Phase 1 topic sentence ---`);
    lines.push(`topicSentenceScore (0–2): ${p.topicSentenceScore != null ? p.topicSentenceScore : "—"}`);
    lines.push(`topicSentenceVerbatim: ${JSON.stringify(p.topicSentenceVerbatim != null ? String(p.topicSentenceVerbatim) : "")}`);
    lines.push(`topicSentenceTechniquesListed: ${p.topicSentenceTechniquesListed != null ? String(p.topicSentenceTechniquesListed) : ""}`);
    lines.push(`topicSentenceJustification: ${p.topicSentenceJustification != null ? String(p.topicSentenceJustification) : ""}`);
    const sets = Array.isArray(p.analysisSets) ? p.analysisSets : [];
    lines.push(
      `analysisSetCount (quote+claim units after topic sentence in this paragraph): ${sets.length}`
    );
    lines.push("");

    for (let j = 0; j < sets.length; j++) {
      const s = sets[j];
      const w = computeCriterionBWeighted(s);
      lines.push(`--- Paragraph ${pIdx} — Analysis set ${j + 1} ---`);
      lines.push(`techniqueNamed: ${s.techniqueNamed != null ? String(s.techniqueNamed) : ""}`);
      lines.push(`verbatim (student substring): ${JSON.stringify(s.verbatim != null ? String(s.verbatim) : "")}`);
      lines.push(
        `techniqueQualityScore (0–2 current / 0–3 legacy): ${s.techniqueQualityScore != null ? s.techniqueQualityScore : "—"}`
      );
      lines.push(`techniqueQualityJustification: ${s.techniqueQualityJustification != null ? String(s.techniqueQualityJustification) : ""}`);
      lines.push(`specificRole_met: ${s.specificRole_met} | notes: ${s.specificRole_notes != null ? String(s.specificRole_notes) : ""}`);
      lines.push(`linkToMessage_met: ${s.linkToMessage_met} | notes: ${s.linkToMessage_notes != null ? String(s.linkToMessage_notes) : ""}`);
      lines.push(
        `subtleImplications_met: ${s.subtleImplications_met} | notes: ${s.subtleImplications_notes != null ? String(s.subtleImplications_notes) : ""}`
      );
      lines.push(`audienceImpact_met: ${s.audienceImpact_met} | notes: ${s.audienceImpact_notes != null ? String(s.audienceImpact_notes) : ""}`);
      if (isCriterionBSetScoringV2(s)) {
        lines.push(
          `reasoningDeducibleConclusion (a) (0–2): ${s.reasoningDeducibleConclusion != null ? s.reasoningDeducibleConclusion : "—"}`
        );
        lines.push(
          `reasoningLinearCoherence (c) (0–1): ${s.reasoningLinearCoherence != null ? s.reasoningLinearCoherence : "—"}`
        );
        lines.push(
          `criterionBReasoningJustificationAC: ${s.criterionBReasoningJustificationAC != null ? String(s.criterionBReasoningJustificationAC) : ""}`
        );
        const ck = getCriterionBCheckpointTrueCount(s);
        const ckPts = getCriterionBCheckpointBandPoints(ck);
        const ac = getCriterionBReasoningACSum(s);
        const adj = getCriterionBReasoningAdjustment(s);
        lines.push(`[Application-computed] checkpoints true (of 4): ${ck} → checkpointBandPoints: ${ckPts}`);
        lines.push(`[Application-computed] reasoning (a)+(c) sum: ${ac} → reasoningAdjustment (+1/0/−1): ${adj}`);
        lines.push(`[Application-computed] total set score (0–9 capped): ${w.toFixed(2)}`);
      } else {
        lines.push(
          `logicalConsistency_ok (legacy): ${s.logicalConsistency_ok} | notes: ${s.logicalConsistency_notes != null ? String(s.logicalConsistency_notes) : ""}`
        );
        const y = getCriterionBReasoningScoreComputed(s);
        lines.push(`[Application-computed] legacy reasoningTotal (0–4): ${y}`);
        lines.push(`[Application-computed] legacy weighted set score (0–9): ${w.toFixed(2)}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Step 3/3 — separate agent: holistic score from digest + Step 1 authorial benchmark (no full source).
 * @param {string} auditDigest
 * @param {object} benchmarkData Step 1 authorial choices (+ shifts exist in data but are not pasted below).
 */
function buildCriterionBStep3HolisticMessage(auditDigest, benchmarkData) {
  const d = String(auditDigest || "").trim();
  const benchBlock = formatAuthorialChoicesBenchmarkForGrading(
    benchmarkData && typeof benchmarkData === "object" ? benchmarkData : {}
  );
  return `Criterion B — Step 3 of 3 (Holistic grade from audit tables only)

Role: You are a senior IB English examiner for Criterion B: Analysis and Evaluation.

Input rules (strict):
- You receive (A) the **[Audit digest]** below — Phase 1 topic-sentence scores/justifications, **per-paragraph analysis set counts**, Phase 2 per-set tables (technique quality 0–2 when present, checkpoint booleans, all comment fields), plus **application-computed** per-set scores out of **9** (current pipeline: technique + checkpoint band 0/2/4/6 + (a)/(c) adjustment, capped; or **legacy** lines if the digest says so), with short verbatim excerpts from the student only as they appear in the digest.
- You also receive (B) the **[Step 1 authorial-choices benchmark]** (same list used in Step 2). It is **non-exhaustive** reference craft for the passage; use it to judge whether the student’s analysis tends toward **central / significant** choices vs **narrow or menial** ones, **never** as a checklist that limits valid techniques.
- You **must not** request or assume the **full unseen source text** or the **complete student paragraph** outside what the digest quotes.
- Assign **one** holistic Criterion B **score** (0–5) based **primarily** on digest **comments and checkpoint notes**, using numeric fields and the benchmark as supporting evidence. The **anchoring bands** below are **reference only**, not a mechanical tally.

**NON-NEGOTIABLE — No inference beyond the student’s explicit analysis:**

- Treat the digest as the full evidence base. A point/check/holistic strength exists **only** if the digest shows the student explicitly articulated it **in their own words**.
- You **absolutely cannot infer** benchmark awareness from quoted passage details alone. If the student did not explicitly state the benchmark concept, treat it as **not met** (descriptive rather than analytical).
- Example: if a benchmark shift is “nostalgic childhood → decaying present” and the digest only shows the student juxtaposing “natural beauty” vs “rumbling heap of black sticks”, that does **not** count as shift awareness unless the student explicitly mentions **past vs present** (or the shift concept) in their own words.

Analysis set count per paragraph (context only):
- A paragraph with **only 1–2** analysis sets **after** the topic sentence **may** (not must) suggest **over-dwelling** on **one or two localized** points rather than spreading attention across **broader** authorial moves—**consider this lightly** alongside qualitative comments and the benchmark list.
- **Three or more** sets in a paragraph is a **normal** workload and should have **no automatic** upward or downward effect on the holistic score by count alone.

Isolated weak weighted scores (important):
- The digest’s per-set **weighted /9** can occasionally land at **1–2** even when the **overall paragraph** is still analytically strong (e.g. one set with a **reasoning** or **logical consistency** failure while others are high). **Do not** treat a **single** such outlier as proof the whole response fails the top band.
- If **one** set is very low but the **general trend** across sets is clearly strong (and comments support quality), **follow the trend** and at most **adjust slightly downward** (e.g. a small step or a judicious **4.5** rather than collapsing the grade).
- Only treat very low weighted sets as a **serious** drag on the holistic mark when they form a **consistent pattern** — e.g. **two or three** such sets, or clear repeated logical breakdowns across the digest — not a lone occasional blip.

Anchoring bands (reference — use comments to adjust slightly above or below with reasoning):

**5** — Topic sentence score must be **2**. Per-set **weighted** scores (out of 9) are **mostly 8 or 9**, though **some 6–7** may appear if the overall profile is still overwhelmingly strong.

**4** — Topic sentence **mostly 2** (may be **1** only in **very exceptional** circumstances). Per-set weighted scores (out of 9) are **mostly 6 or 7**, with **some 8** appearing in the profile.

**3** — Topic sentence may be **1–2**. Weighted scores **mostly 4, 5 and 6**, with **some 6** in the mix (comments explain spread).

**2** — Topic sentence score **1**. Weighted scores **mostly 3–4** (may include some **1–2**).

**1** — Topic sentence **0–1**; weighted scores **mostly 1–2**.

**0** — Does not meet expectations of any band above.

Half-points:
- You may output **0.5 steps** (e.g. 3.5) **only** when judgment sits **exactly** between two whole bands; be **judicious**.

**justification** (examiner summary):
- Write **exactly three to four complete sentences** in a calm **IB examiner** tone.
- **Explicitly state the holistic score** at least once using the **same number** you output in **score** (e.g. “I assign **4.0** out of 5” or “Holistic mark: **3.5**/5”).
- **Anchor to the band rubric**: name which **band (0–5 description above)** best fits this response and **why**, in plain prose.
- **Anchor to the Step 1 benchmark**: briefly say how the student’s techniques (as shown in the digest) **align or fail to align** with the **kinds of significance** signalled by the benchmark list, and **exactly** how that supports **this** numeric score (without treating the list as exhaustive).
- Weave in digest evidence (topic sentence, set counts where relevant, typical weighted levels, comment quality, isolated outliers).
- Do **not** use bullet points; do **not** write fewer than three sentences unless the digest is empty.

Output:
- Return **only** valid JSON with keys **score** (number, 0–5 in 0.5 steps) and **justification** (string, 3–4 sentences as above). No other keys. No markdown outside JSON.

[Step 1 authorial-choices benchmark — reference only]:

${benchBlock}

[Audit digest]:

${d}`;
}
