/** Allowed values for `understandingImpact` on each Phase 1 error row (exact strings in JSON). */
const CRITERION_D_STEP1_UNDERSTANDING_IMPACT_ENUM = [
  "negligible",
  "awkward",
  "might hinder understanding",
  "hinders understanding",
];

const CRITERION_D_ERROR_ROW_SCHEMA = {
  type: "object",
  properties: {
    verbatimFromText: {
      type: "string",
      description:
        "Exact verbatim substring from the **student analysis paragraph** showing the error (short span, match character-for-character).",
    },
    typeOfError: {
      type: "string",
      description:
        "Category label, e.g. Comma splice; Pronoun–antecedent disagreement; Vague pronoun reference; Dangling modifier; Tense shift; Overuse of passive voice; Awkward verb connection; Fuzzy quote integration; Awkward phrasing; Standard mechanics (spelling/punctuation).",
    },
    onePhraseExplanation: {
      type: "string",
      description: "One short phrase explaining the issue (no essay).",
    },
    understandingImpact: {
      type: "string",
      enum: CRITERION_D_STEP1_UNDERSTANDING_IMPACT_ENUM,
      description:
        "How much this single issue affects a reader's grasp of the sentence/paragraph on the page (Criterion D — language only, not argument quality). **negligible** = polish / tiny slip; meaning unmistakable. **awkward** = clunky or rough but reader still follows. **might hinder understanding** = ambiguity, broken reference, or friction that could slow or confuse a careful reader. **hinders understanding** = serious enough that comprehension of the wording suffers. Use **negligible** sparingly — only when the issue is truly minor.",
    },
  },
  required: ["verbatimFromText", "typeOfError", "onePhraseExplanation", "understandingImpact"],
};

const CRITERION_D_STEP1_SCHEMA = {
  type: "object",
  properties: {
    errors: {
      type: "array",
      description:
        "Phase 1: every micro-issue found in the student paragraph, in reading order. Use an empty array only if there are genuinely no issues under the allowed categories.",
      items: CRITERION_D_ERROR_ROW_SCHEMA,
    },
    criterionD_phase1_only_score: {
      type: "object",
      description:
        "Mechanics-only mark from the Phase 1 error table and understandingImpact profile only. Integer **0–5** per prompt section 3. **Independent** of sentenceRhythmPhase2 — Phase 2 must not influence this object.",
      properties: {
        score: {
          type: "integer",
          description: "Integer 0–5 inclusive per section 3 rubric (errors + impacts only).",
        },
        justification: {
          type: "string",
          description:
            "Exactly **4** complete sentences, senior IB examiner voice. Sentence 1 **must** begin: **The student earns a** [integer score] **for** [short Y — e.g. mechanics control / error profile] **because** … then continue across sentences 2–4 with concrete reference to \`errors\` and \`understandingImpact\` only. **Do not** cite Phase 2.",
        },
      },
      required: ["score", "justification"],
    },
    sentenceRhythmPhase2: {
      type: "object",
      description:
        "Phase 2: holistic **sentence structure** (length variety, active vs passive dominance, naturalness). **Integer 0–5**, independent of Phase 1 `errors` and `criterionD_phase1_only_score` per prompt section 1b.",
      properties: {
        score: {
          type: "integer",
          description:
            "Integer 0–5 inclusive. Sentence-structure rubric only — **do not** derive from or reconcile with criterionD_phase1_only_score.",
        },
        justification: {
          type: "string",
          description:
            "Exactly **4** complete sentences, senior IB examiner voice. Sentence 1 **must** begin: **The student earns a** [integer score] **for** [short Y — e.g. sentence-structure control / length & variety] **because** … then continue across sentences 2–4 with concrete structural evidence (§1b baselines). **Do not** cite Phase 1 \`errors\` or \`criterionD_phase1_only_score\`.",
        },
        explanation: {
          type: "string",
          description:
            "2–3 sentences: compact technical gloss only — length bands, active vs passive, read-aloud / breath test. Do **not** repeat the full four-sentence justification verbatim.",
        },
      },
      required: ["score", "justification", "explanation"],
    },
  },
  required: ["errors", "criterionD_phase1_only_score", "sentenceRhythmPhase2"],
};

const CRITERION_D_LEXICAL_ROW_SCHEMA = {
  type: "object",
  properties: {
    verbatimWordOrPhrase: {
      type: "string",
      description:
        "Exact word or short phrase from the **student paragraph** (key verb, adjective, analytical noun, mood/atmosphere word, or transitional adverb — not filler like the, and, of). **Do not** tag spans that are **only** **verbatim quotation** from the **source extract** (quote language is out of scope); tag the student’s **own** analytical lexis.",
    },
    indexCode: {
      type: "string",
      description:
        "Exactly **G**, **S1**, **S2**, **B1**, or **B2** (uppercase). G = generic; S1 = sophisticated solid; S2 = sophisticated elite; B1 = bloat/minor inaccuracy (including imprecise mood/descriptive adjective vs what the source text actually suggests); B2 = major inaccuracy or total bloat (including lexis that misrepresents or overstates what the extract supports).",
    },
    onePhraseExplanation: {
      type: "string",
      description:
        "One short phrase explaining the coding (fit / weight / mis-fit vs the **Source Text** — e.g. why an adjective or evaluative word is too vague, too strong, or not what the passage suggests). For **S2**, cite why the shade is **apt** to the extract (see Step 2 §2a illustration bank—**S2 only when warranted**). Cite §2b when relevant (misapplied high-register words, hollow abstractions).",
    },
  },
  required: ["verbatimWordOrPhrase", "indexCode", "onePhraseExplanation"],
};

const CRITERION_D_STEP2_SCHEMA = {
  type: "object",
  properties: {
    lexicalRows: {
      type: "array",
      description:
        "Broad inventory: significant **adjectives**, **analytical nouns**, and other **student-authored** lexical items that carry weight (plus key verbs / transitional adverbs as relevant). **Exclude** verbatim **quoted** source wording (see prompt NOTE). Flag imprecise use **relative to the extract**. Use §2a as **calibration** for **S2** when apt—not automatic. Consider **spread** of **G / S1 / S2 / B1 / B2** when setting \`criterionD_agent2_score\`. Reading order when possible. Exclude filler (the, and, of, etc.).",
      items: CRITERION_D_LEXICAL_ROW_SCHEMA,
    },
    criterionD_agent2_score: {
      type: "object",
      properties: {
        score: {
          type: "integer",
          minimum: 0,
          maximum: 5,
          description:
            "Integer 0–5 per prompt §4 anchor bands + **spread** of G/S1/S2/B1/B2 in lexicalRows (holistic examiner judgment, not a formula).",
        },
        justification: {
          type: "string",
          description:
            "Exactly **4 or 5** complete sentences, senior examiner voice. Sentence 1 must begin: **The student earns a** [score] **for** [short Y] **because** …; weave **G/S1/S2/B1/B2 spread**, **§4 anchor band**, and §2a/§2b as per prompt §4b.",
        },
      },
      required: ["score", "justification"],
    },
  },
  required: ["lexicalRows", "criterionD_agent2_score"],
};

const CRITERION_D_STEP3_PLUS_TYPE_ENUM = [
  "STRONG_ANALYTICAL_VERBS",
  "FORMAL_TRANSITIONS",
  "OBJECTIVE_DISTANCE",
];

const CRITERION_D_STEP3_MINUS_TYPE_ENUM = [
  "COLLOQUIALISM",
  "CONTRACTIONS",
  "DESCRIPTIVE_REGISTER",
  "FUZZY_QUOTE_INTEGRATION",
  "PERSPECTIVE_ERRORS",
  "PREACHY_OPINION",
  "PROTOCOL_BREACHES",
  "SITUATIONAL_UNAWARENESS",
];

/** IB-style register MINUS weighting: context sets the tier; types are hints only (see Step 3 prompt). */
const CRITERION_D_REGISTER_MINUS_SEVERITY_ENUM = ["BAND_KILLER", "TECHNICAL_BREACH", "SURFACE_SLIP"];

const CRITERION_D_REGISTER_PLUS_ROW_SCHEMA = {
  type: "object",
  properties: {
    verbatimWordOrPhrase: {
      type: "string",
      description: "Exact substring from the student paragraph (strength).",
    },
    plusType: {
      type: "string",
      enum: CRITERION_D_STEP3_PLUS_TYPE_ENUM,
      description:
        "STRONG_ANALYTICAL_VERBS = author-centric analytical verbs; FORMAL_TRANSITIONS = sophisticated bridges; OBJECTIVE_DISTANCE = clinical, detached analytical voice.",
    },
    onePhraseExplanation: {
      type: "string",
      description: "One short phrase: why this counts as a strength for register/tone.",
    },
  },
  required: ["verbatimWordOrPhrase", "plusType", "onePhraseExplanation"],
};

const CRITERION_D_REGISTER_MINUS_ROW_SCHEMA = {
  type: "object",
  properties: {
    verbatimWordOrPhrase: {
      type: "string",
      description: "Exact substring from the student paragraph (violation).",
    },
    minusType: {
      type: "string",
      enum: CRITERION_D_STEP3_MINUS_TYPE_ENUM,
      description:
        "COLLOQUIALISM; CONTRACTIONS (don't, won't — formal protocol); PERSPECTIVE_ERRORS (I/you — habitual vs one-off affects minusSeverity); PREACHY_OPINION; PROTOCOL_BREACHES (first-name author, anonymous-agent framing without surname bridge — see prompt; not contractions); SITUATIONAL_UNAWARENESS (e.g. extract as 'the novel'); FUZZY_QUOTE_INTEGRATION (quote not grammatically fused); DESCRIPTIVE_REGISTER (only when overall stance is overwhelmingly descriptive / narrative walk-through — see prompt).",
    },
    minusSeverity: {
      type: "string",
      enum: CRITERION_D_REGISTER_MINUS_SEVERITY_ENUM,
      description:
        "Contextual weight for this verbatim instance. BAND_KILLER = structural failure (caps strong 5 on this agent); TECHNICAL_BREACH = lacks IB polish; SURFACE_SLIP = minor slip if isolated. Same minusType can be SURFACE_SLIP or BAND_KILLER depending on habit, spread, and whether the task (literary commentary) is undermined — see prompt hierarchy.",
    },
    onePhraseExplanation: {
      type: "string",
      description: "One short phrase: how this breaches formal academic protocol or stance (may nod to why this tier applies).",
    },
  },
  required: ["verbatimWordOrPhrase", "minusType", "minusSeverity", "onePhraseExplanation"],
};

const CRITERION_D_STEP3_SCHEMA = {
  type: "object",
  properties: {
    plusRows: {
      type: "array",
      description: "Strengths (PLUSes): register, tone, protocol — verbatim findings in reading order when possible.",
      items: CRITERION_D_REGISTER_PLUS_ROW_SCHEMA,
    },
    minusRows: {
      type: "array",
      description:
        "Violations (MINUSes): each row must include minusSeverity (BAND_KILLER / TECHNICAL_BREACH / SURFACE_SLIP) — not all MINUS types are equal; see prompt hierarchy.",
      items: CRITERION_D_REGISTER_MINUS_ROW_SCHEMA,
    },
    criterionD_agent3_score: {
      type: "object",
      properties: {
        score: {
          type: "integer",
          minimum: 0,
          maximum: 5,
          description:
            "Integer 0–5 per prompt §3 (Voice & tone + error extent & protocol). Holistic: weigh PLUS/MINUS inventory and minusSeverity mix.",
        },
        justification: {
          type: "string",
          minLength: 700,
          maxLength: 32000,
          description:
            "Exactly **4 or 5** complete sentences, senior IB examiner voice. Sentence 1 must begin: **The student earns a** [same integer as score] **for** [short Y — e.g. register & protocol, voice, academic distance] **because** …; weave **PLUS/MINUS** pattern, **minusSeverity** mix, and **which §3 mark-row** (Voice & tone + Error extent columns) best fits.",
        },
      },
      required: ["score", "justification"],
    },
  },
  required: ["plusRows", "minusRows", "criterionD_agent3_score"],
};

const CRITERION_D_STEP4_SCHEMA = {
  type: "object",
  properties: {
    criterionD_moderator_score: {
      type: "object",
      properties: {
        score: {
          type: "number",
          description:
            "Final IB Criterion D mark 0–5 inclusive, in steps of 0.5 only when strictly between two bands (use sparingly); otherwise use whole integers.",
        },
        justification: {
          type: "string",
          minLength: 900,
          maxLength: 64000,
          description:
            "Exactly **5 or 6** complete sentences. Must begin: **The student earns a score of** [number, same as score] **because** … Use **accurate official Criterion D descriptor wording** (grammar, vocabulary, sentence construction, register and style). Reference the supplied **syntax / sentence structure / vocabulary / register** digests; no fixed weighting.",
        },
      },
      required: ["score", "justification"],
    },
  },
  required: ["criterionD_moderator_score"],
};

/**
 * Criterion D — Step 1 of 1+ (language mechanics only).
 * @param {string} sourceText
 * @param {string} studentParagraph
 */
function buildCriterionDStep1Message(sourceText, studentParagraph) {
  const s = sourceText.trim();
  const p = studentParagraph.trim();

  return `Criterion D — Step 1 (Language: technical execution)

Role: You are a veteran IB English A **Senior Examiner** with 20+ years of experience specializing in **Criterion D (Language)**. Your sole focus is the **technical execution** of writing, **syntax**, and **grammatical flow**.

**Scope — Criterion D only (ignore everything else):** Judge **language mechanics** and **sentence-level form** only. **Explicitly ignore and do not penalize or praise:** logical gaps, weak or controversial **analysis**, misinterpretations of the passage, factual inaccuracies about the text, argument quality, insight, thesis strength, evidence choice (aside from **grammatical** weaving of a quote), **organization**, paragraph structure, transitions between ideas, or whether claims “match” the source. Those belong to other criteria; **they do not matter** for this task—even if the student’s reading seems wrong, treat the prose as a **black box** except for the allowed error types below.

Your task: Critically evaluate the **student analysis paragraph** based **ONLY** on the parameters in section 1. **Do not** comment on vocabulary sophistication, thematic depth, or structural organization (Criterion C).

Use the **[Source Text]** only to check **exact wording** of embedded quotations and whether a quote is **grammatically** integrated into the student’s sentence—not to audit the student’s logic against the passage. Error **verbatim** spans must come from the **student paragraph** unless the span is a quote taken verbatim from the passage inside the student’s writing.

---

## 1. Identification guidelines

Scan the **student paragraph** and list every issue that fits these categories:

**The Big 6 mistakes:** comma splices; pronoun–antecedent disagreement; vague pronoun reference (e.g. opening a sentence with *This…* / *It…* without a clear noun antecedent); dangling modifiers; tense shifting (uncontrolled past/present movement); overuse of passive voice (where it obscures agency or clutters flow).

**Awkward verb connection:** Jarring or faulty linkage between **predicates** — especially when a sentence coordinates or piles an **action verb** with a **copular *be*** phrase (or similar) so the syntax does not read as a clean parallel or fused construction on the page. Illustrative pattern: *X does Y and is Z* where the second part does not attach grammatically or logically to the same subject in a way mature prose would allow. Use \`typeOfError\`: **Awkward verb connection** (exact label). Tag the **verbatim** span that shows the broken connection.

**Fuzzy quote integration:** quotations or short lifts that are **dropped in** without being grammatically woven into the host sentence (e.g. orphaned quote, broken syntax around the quote).

**Awkward phrasing:** technically grammatical but **clunky**, **wordy**, or **non-academic** in rhythm.

**Standard mechanics:** spelling and basic punctuation / grammar errors not better classified above.

### Per-error impact (required for **each** row in \`errors\`)

As you identify each issue, set \`understandingImpact\` to **exactly one** of these four literals (match spelling and spacing):

- **negligible** — Tiny slip or polish issue; meaning is unmistakable; reader is not slowed.
- **awkward** — Clunky, wordy, or rough rhythm/grammar, but the reader can still follow without real doubt.
- **might hinder understanding** — Noticeable friction: vague reference, mild ambiguity, or an error that could make a careful reader pause, re-read, or hesitate about what the sentence says **on the page**.
- **hinders understanding** — Serious grammar/syntax/reference failure such that the **wording** is hard to parse or likely misread; comprehension of the sentence (not the literary argument) suffers.

**Guidance:** Do **not** conflate weak *literary analysis* with language impact — only classify **how the prose itself** lands. Reserve **negligible** for genuinely minor cases. When in doubt between adjacent levels, choose the **stronger** impact label. The \`criterionD_phase1_only_score\` (section 3) must reflect both **how many** issues you list and **how severe** their \`understandingImpact\` distribution is (several **hinders understanding** rows weigh far more than many **negligible** slips).

---

## 1b. Phase 2 — Sentence structure overall (**\`sentenceRhythmPhase2\`**, **integer 0–5**, **independent**)

**Independence (critical):** Judge **only** the paragraph’s **sentence structure** as a whole — syntactic **variety**, **length** patterns, whether voice is **mostly active** vs **passive-heavy** at the **sentence level**, and whether cadence feels **natural** for formal analytical prose. **Do not** copy, reconcile with, nudge from, or “average with” \`criterionD_phase1_only_score\` or the \`errors\` table when setting \`sentenceRhythmPhase2.score\`. Phase 2 **does not** change Phase 1 and Phase 1 **does not** change Phase 2. (You may finish Phase 1 first for workflow, but assign Phase 2 from a **fresh holistic pass** on structure alone.)

**Scope:** Still Criterion D **language** — **not** paragraph *ideas*, organization, or argument quality (Criterion C / A). **Not** micro-errors already listed in \`errors\` unless they are inseparable from a structural point you are making about a whole sentence’s architecture.

**Read-aloud / breath test (private check, reflect in \`explanation\`):** Read representative sentences at a **normal speaking pace**. If you would **run out of breath** before the full stop, or **trip over sub-clauses**, the sentence is likely **excessively long** for essay prose.

**Baselines — set \`sentenceRhythmPhase2.score\` (integer 0–5) using examiner judgment anchored as follows:**

- **Baseline toward 4:** Sentence structure is **varied**, **mostly active**, includes **both shorter and longer** sentences in a **natural** mix, and reads controlled (then fine-tune up/down within 0–5).
- **Baseline toward 3:** **Either** (A) sentences are **somewhat** consistently long in stretches — **almost all** sentences in those stretches **≥ about 20–25 words** — **and** the paragraph is **too passive-heavy** at the structural level for clarity, **or** (B) structure is **consistently simplistic** with **little variation** (choose **2** vs **3** by extent: closer to monotonous short/simple → **2**; milder → **3**).
- **Baseline toward 2:** Sentence structure is **so long as to be ineffective** — **almost all** sentences **≥ ~35 words** — **and** prose is **winding** / hard to follow; or the read-aloud / breath test **fails badly** across the paragraph.
- **5 (strict):** Award **5** **only** when structures are **pleasing** and **academically formal** together — reading feels both **precise** and **effortless**. If in doubt, stay at **4**.
- **0–1:** Reserve for rare structural collapse **below** the band **2** profile.

Fill \`sentenceRhythmPhase2.justification\` using the **same 4-sentence examiner template** as Phase 1, but **only** for sentence-structure evidence (§1b): **Sentence 1 must open:** **The student earns a** [\`score\`] **for** [short **Y** — e.g. *sentence-structure control*, *length and variety*, *passive load*] **because** … then sentences **2–4** with concrete structural detail. **Do not** cite Phase 1 \`errors\` or \`criterionD_phase1_only_score\`.

Fill \`sentenceRhythmPhase2.explanation\` with **2–3** compact technical sentences (length bands, active vs passive, read-aloud / breath test). **Do not** paste the full four-sentence justification again.

---

## 2. Output (JSON — not a markdown table)

Return **only** valid JSON.

- \`errors\`: Phase 1 array; each item: \`verbatimFromText\`, \`typeOfError\`, \`onePhraseExplanation\`, \`understandingImpact\` (one of: **negligible** | **awkward** | **might hinder understanding** | **hinders understanding** — exact strings).
- \`criterionD_phase1_only_score\`: \`score\` (**integer 0–5**) + \`justification\` — **exactly 4 sentences**, mechanics **only** (section 3 template); **no** Phase 2.
- \`sentenceRhythmPhase2\`: \`score\` (**integer 0–5**, sentence structure **only**, section 1b) + \`justification\` (**exactly 4 sentences**, same template) + \`explanation\` (**2–3** technical sentences).
- **Agent 1 returns exactly two 0–5 scores** in Step 1: \`criterionD_phase1_only_score\` and \`sentenceRhythmPhase2\`.

---

## 3. Phase 1 only — \`criterionD_phase1_only_score\` (**integer 0–5**)

Assign \`criterionD_phase1_only_score.score\` using **only** the completed \`errors\` list (categories + \`understandingImpact\`). **Do not** use holistic sentence-structure judgment (\`sentenceRhythmPhase2\`) here — that is Phase 2. **Do not** reward or penalize vocabulary sophistication or lexical range. “Confusing” / “hinder understanding” means **how the prose reads on the page**, **not** whether the student’s literary **interpretation** is weak.

**Bands (choose the best-matching integer 0–5):**

- **5:** Writing is professional, clear, and pleasing to read. Almost no discernible errors; the occasional (not systematic) errors are **negligible** and normal for a professional native writer under timed conditions.
- **4:** Writing is clear and carefully phrased, but may contain some **negligible** errors (not excessively many); few errors are **awkward**; and almost no errors **hinder understanding** in any way.
- **3:** Writing is adequate and competent in accuracy. There might be some **negligible** errors and some **awkward** errors in the paragraph that make the reader pause and self-correct, but still few errors that **might hinder understanding**.
- **2:** Writing has some accuracy. **Negligible** errors and **awkward** phrasing are prevalent. There are some errors that **might hinder understanding**, and a few errors that make fragments confusing (or **hinder understanding** in places).
- **1:** Writing has an inadequate level of accuracy for a native speaker. Errors can make some passages (not all) confusing or hard to understand.
- **0:** Does not reach band **1**.

### \`criterionD_phase1_only_score.justification\` — **exactly 4 sentences** (examiner voice)

Write **exactly four** complete sentences. **Sentence 1 must open:** **The student earns a** [the same integer as \`score\`] **for** [a short **Y** — what the mark rewards or penalises, e.g. *mechanics control*, *error density*, *understanding-impact profile*] **because** … and then finish the thought. Sentences **2–4** develop the case with **specific** reference to listed \`errors\` and their \`understandingImpact\` labels (quote patterns, not vague praise). **Do not** mention Phase 2 or sentence-length structure here.

[Source Text]

${s}

[Student analysis paragraph]

${p}`;
}

/**
 * Criterion D — Step 2 (Lexical Architect: vocabulary sophistication index only).
 * @param {string} sourceText
 * @param {string} studentParagraph
 */
function buildCriterionDStep2Message(sourceText, studentParagraph) {
  const s = sourceText.trim();
  const p = studentParagraph.trim();

  return `Criterion D — Step 2 (The Lexical Architect — vocabulary only)

Role: You are a veteran IB English A **Senior Examiner** with 20+ years of experience. Your task is to audit the **lexical precision** of the writing using the **Sophistication Index** below. You are looking for **the right word**, not **the biggest word**.

**Scope — vocabulary only:** Judge **word choice, nuance, and fit** only. **Do not** comment on **grammar**, **syntax** (beyond how a word fits a phrase), **essay structure**, **organization**, **argument**, **analysis**, **logical discrepancies**, or whether claims match the **[Source Text]**. Those **do not matter** for this step—even if the interpretation seems weak or wrong, assess **lexical weight** only. Use **[Source Text]** only if needed to judge whether a word’s **semantic** use is plausible in context; **never** penalize “wrong analysis” as such.

**Lexical accuracy includes “fit to the passage”:** **Mood words**, **atmosphere labels**, and **evaluative or descriptive adjectives** count as **lexical choice**. If they are **too strong**, **too vague**, or **not precisely supported** by what the **[Source Text]** actually presents (e.g. a subdued passage called “ecstatic,” a neutral image called “menacing” without textual warrant), that is a **vocabulary precision** issue — tag as **B1** (slight mis-fit) or **B2** (clear mis-description / misleading lexis), **not** as a separate “logic” penalty. Ordinary academic wording that is **plausible** on the page stays **S1**/ **S2** / **G** as appropriate.

**Imprecision relative to the source (still lexical, not “argument scoring”):** **Vocabulary inaccuracy** here includes **semantic slack** against the **literary extract** — especially **imprecise adjectives** (or other evaluative/descriptive words) that **do not convey what the passage actually suggests** on the page: e.g. **washed-out** wording where the text is vivid, **hyped** intensifiers where the tone is quiet, **wrong shade** of feeling, or **generic labels** (*tense, sad, happy*) that **flatten** effects the **[Source Text]** signals more specifically. Compare the student’s **word** to **concrete cues** in the extract (imagery, rhythm, diction, implied tone). If the **word choice** is **off relative to the text** — even without a full “wrong thesis” — code **B1** or **B2** by degree of mis-fit. **Do not** relabel a purely **inferential** stretch as **B2** when the **lexis** itself is ordinary and **compatible** with a defensible reading (see tier-mix rule below).

---

## 1. What to scan

**NOTE — full lexical inventory (for downstream highlighting):** Tag **all significant** evaluative **adjectives**, **analytical nouns**, and other **student-authored** words that materially carry the analysis (plus strong analytical **verbs** and loaded **transitional / stance adverbs** where relevant). Aim for **broad coverage** of the student’s **own** diction—not a token three-item list.

**Quotes:** **Do not** add \`lexicalRows\` for words or spans that are **only** **verbatim quotation** from the **source text** (straight \`"\`…\`"\` lifts, line or block quotes, or obvious pasted extract wording): **quoted source language is not evaluated** in Step 2. If the same surface form appears both inside a quote and in the student’s own commentary, tag the **non-quoted** analytical instance **only** when clearly separable; if inseparable, **omit** the row.

Scan the **student analysis paragraph** and classify each inventoried item under **G / S1 / S2 / B1 / B2** per §2–§2b. **Ignore filler** (e.g. *the, and, of, specifically* as bare function words—unless part of a longer phrase you are explicitly tagging).

---

## 2. Sophistication index (legend)

Categorize every listed term with **exactly one** code (uppercase in JSON):

- **G** — **Generic:** elementary or “tired” words (*good, shows, says, very, thing*).
- **S1** — **Sophisticated (solid):** effective academic vocabulary that **accurately** conveys meaning (*illustrates, emphasizes, conveys*).
- **S2** — **Sophisticated (elite):** high-level, **nuanced** vocabulary capturing a finer shade without pretension (*evokes, encapsulates, underscores, visceral*). See **§2a** for an **illustration bank**—code **S2** **only** when such lexis is **precisely warranted** by the **[Source Text]**.
- **B1** — **Bloat / minor inaccuracy:** slightly “pushed” or purple; or nuance **slightly off** (including a **mood word** or **descriptive adjective** that only **partly** matches what the **[Source Text]** suggests — **imprecise** relative to the extract but not wildly misleading) but the reader still understands.
- **B2** — **Major inaccuracy / total bloat:** incorrect use, confuses the reader, or so pretentious it **impedes** flow; or **clearly misapplied** mood / atmosphere / descriptive vocabulary that **does not** match what the literary passage **actually suggests** (misleading or **over-precise** lexis vs the evidence on the page). **Lexical only:** do **not** use **B2** because the student’s **reasoning** is weak if the **words on the page** are still **ordinary, apt academic English** for a defensible reading—those cases are **out of scope** for this step.

### 2a. Illustration bank — **S2**-grade lexis (**elite shade**) — tag **S2** **only** when **apt** to the extract

The items below are **examples of the kind** of precise, high-shade vocabulary that **may** earn **S2** when the student uses them **correctly** and the **[Source Text]** genuinely supports that **semantic weight**. They are **not** automatic **S2** tokens: mis-fit → **B1** / **B2**; ordinary apt diction → **S1**; many other legitimate **S2** words exist beyond this list.

**Atmosphere & setting**
- **Adjectives:** Austere, ethereal, ephemeral, pastoral, idyllic, claustrophobic, sterile, cavernous, subterranean, verdant, desolate, opulent.
- **Nouns:** Ambience, milieu, topography, juxtaposition, expanse, facade, vestige, labyrinth.

**Emotion & internal states**
- **Adjectives:** Despondent, poignant, visceral, melancholic, stoic, indignant, ambivalent, nostalgic, pensive, whimsical, fervent.
- **Nouns:** Pathos, ennui, trepidation, euphoria, resentment, alienation, introspection, fervor, malaise.

**Social & power dynamics**
- **Adjectives:** Imperious, subservient, egalitarian, patriarchal, dogmatic, bureaucratic, clandestine, subversive, autonomous.
- **Nouns:** Hegemony, autonomy, hierarchy, stratagem, suppression, paradigm, conformity, orthodoxy.

**Time & movement**
- **Adjectives:** Stagnant, languid, volatile, mercurial, perennial, transitory, incessant, sporadic, redundant.
- **Nouns:** Stasis, flux, imminence, culmination, interim, longevity, cessation, inception.

**Complexity & logic**
- **Adjectives:** Nuanced, convoluted, esoteric, paradoxical, tenuous, enigmatic, didactic, pedantic, lucid.
- **Nouns:** Ambiguity, nuance, dichotomy, discrepancy, fallacy, manifestation, quintessence.

### 2b. Reference — “sophisticated” words students often **misapply** (semantic misuse vs the text)

These occur when a student picks a **high-register** term they **do not fully control**, so the **word’s meaning** does not match what the **[Source Text]** actually licenses—often **B1** (slight mis-fit) or **B2** (clear mis-label). Judge **lexical** fit, not whether you would argue the same thesis. Many Other misapplications are possible beyond the table.

| Student word | Typical misconception | Why it fails (prefer instead when appropriate) |
| --- | --- | --- |
| **Nihilistic** | Applied to any “sad” or “dark” poem. | *Nihilism* is a specific philosophy (life meaningless / devoid of value). A breakup or elegy is more likely **melancholic**, **despondent**, or **somber**—not automatically nihilistic. |
| **Pretentious** | Applied to **the text** because it is difficult or lexically dense. | *Pretentious* judges **a person’s** affectation or posturing. For dense or obscure **writing on the page**, prefer **lexically dense**, **esoteric**, **opaque**, or **overwrought**—as fits the evidence. |
| **Hysterical** | Applied to a character who is merely **very angry** or **loud**. | *Hysterical* suggests **loss of control** (and carries clinical/historical baggage). Prefer **vehement**, **furious**, **indignant** (if moral grievance fits), or **volatile**—match the passage’s actual pitch. |
| **Apathetic** | Applied to a **neutral** or “objective” / journalistic tone. | *Apathetic* = **does not care**. A cool narrator may be **detached**, **dispassionate**, or **clinical**—not apathetic **toward** the subject unless the text shows indifference. |
| **Monotonous** | Applied to a “boring” passage in general. | *Monotonous* literally concerns **sameness of tone or sound** (one note). Unless you are analysing **sound / rhythm / meter / syntactic sameness**, prefer **pedestrian**, **staid**, **flat**, or **repetitive**—as the extract supports. |

**Hollow or inflated abstractions (empty “texture” words):** Also flag **B1** / **B2** when the student leans on **vague prestige nouns or metaphors** that **do not add analysable meaning** in context—e.g. **tapestry**, **weave** (as cliché), **symphony**, **synergy of X and Y**, **dance of …**, **interplay**—unless the **[Source Text]** genuinely invites that image or the student **pins it to concrete textual evidence**. If the word is **ornamental** or could be deleted without loss of analytical content relative to the extract, treat as **bloat** (usually **B1**; **B2** if it **actively misleads** or replaces real analysis).

---

## 3. Output (JSON — not a markdown table)

Return **only** valid JSON. Populate \`lexicalRows\`; each row is logically:

**[Verbatim word/phrase] | Index code | One-phrase explanation**

Use field names: \`verbatimWordOrPhrase\`, \`indexCode\`, \`onePhraseExplanation\`. List in **rough reading order** when possible.

- \`criterionD_agent2_score\`: \`score\` (**integer 0–5**) + \`justification\` — **4–5 sentences**, examiner voice (§4b).

---

## 4. Scoring rubric — \`criterionD_agent2_score\` (lexical control, **integer 0–5**)

**Spread (mandatory):** Before setting \`criterionD_agent2_score.score\`, review the **spread** of **G**, **S1**, **S2**, **B1**, and **B2** across \`lexicalRows\` — proportions, severity (especially **B2**), and whether **S2** items are genuinely **apt** (§2a) vs inflated (**B1**/**B2**). **Holistic examiner judgment** — no fixed formula from counts alone.

**Logic-only “errors” still do not count:** Words **lexically sound** on the page but tied to weak inference (no clear **semantic** mis-fit of the **word** to the extract) are **not** **B2**; do not drag the score down for argument alone.

**Anchor bands (read across all columns together):** Map the holistic profile to the JSON integer **0–5** in the right-hand column (**same scale** as official Criterion D language bands).

| Anchor | Register & elevation | Precision & terminology | Accuracy & misuse | JSON \`score\` |
| --- | --- | --- | --- | --- |
| **5** | **Sophisticated & nuanced.** Uses varied academic vocabulary that feels **natural**, not forced. | **High precision.** Uses specific literary / linguistic / analytical terms **where the extract warrants them**. | Control is strong; any slips are negligible and do not blur meaning. | **5** |
| **4** | **Consistently academic.** Vocabulary is elevated and appropriate for a formal essay. | **Good precision.** Uses relevant terminology **correctly** to support analysis of the text. | **Minor slips.** Occasional “near-misses” in word choice that do **not** confuse the reader or weaken clarity. | **4** |
| **3** | **Functional & clear.** Relies on “safe” academic words; writing is clear but may feel **repetitive**. | **Basic accuracy.** Terminology is present but may be **general** (e.g. “The author uses imagery”) without finer shade. | **Occasional misuse.** Some words slightly out of context, but overall meaning stays clear. | **3** |
| **2** | **Limited / simple.** Relies heavily on **everyday** language rather than analytical terms. | **Inconsistent.** Technical terms often **missing** or **misused** (e.g. calling a metaphor a “symbol”). | **Frequent errors.** Choices often awkward or “clunky,” sometimes making the line of thought **harder** to follow. | **2** |
| **1** | **Elementary.** Vocabulary too basic to tackle complex textual analysis. | **Rare / absent.** Little subject-specific literary terminology. | **Significant misuse.** Persistent word-choice problems **impede** the reader’s understanding. | **1** |
| **0** | *Does not reach band **1**.* | | | **0** |

Choose **one** integer **0–5** that best matches the **whole** paragraph’s lexical profile and the **G / S1 / S2 / B1 / B2** spread. **Default:** when the prose clearly matches anchor **5**, output **5**; reserve **4** for solid anchor-4 work; use **3** / **2** / **1** / **0** for the lower bands as described.

### 4b. \`criterionD_agent2_score.justification\` — **4–5 sentences** (examiner voice)

Write **four or five** complete sentences in **senior IB examiner** voice. **Sentence 1 must open:** **The student earns a** [the same integer as \`score\`] **for** [a short **Y** — e.g. *lexical control*, *sophistication vs precision*, *spread of tiers*] **because** … and develop the claim. Remaining sentences must integrate: the **G / S1 / S2 / B1 / B2** **spread**, which **§4 anchor band** the paragraph best matches, and (where relevant) **§2a** apt **S2** vs **§2b** misapplications / hollow abstractions—**without** pasting the whole \`lexicalRows\` table.

---

[Source Text]

${s}

[Student analysis paragraph]

${p}`;
}

/** @type {readonly { mark: number; voice: string; protocol: string }[]} */
const CRITERION_D_AGENT3_REGISTER_MARK_ROWS = Object.freeze([
  {
    mark: 5,
    voice:
      "Sophisticated & authoritative. Maintains a clinical, analytical distance with a seamless academic voice.",
    protocol: "Formal protocols (surnames, no contractions) are handled with total precision.",
  },
  {
    mark: 4,
    voice: "Consistent & academic. The tone is purposefully formal and focused on authorial intent rather than plot.",
    protocol:
      'Errors in protocol or register are rare "slips" that do not disrupt the professional flow.',
  },
  {
    mark: 3,
    voice: "Functional & appropriate. The voice is clear and avoids slang, but may feel repetitive or overly safe.",
    protocol:
      'Occasional lapses in protocol (e.g. contractions or "I think") occur but the register remains generally formal.',
  },
  {
    mark: 2,
    voice:
      'Inconsistent or descriptive. The voice fluctuates between analysis and "storytelling," often losing critical distance.',
    protocol:
      'Frequent protocol breaches, such as referring to authors by first name or using second-person "you," are present.',
  },
  {
    mark: 1,
    voice:
      'Colloquial or narrative. The tone is "chatty" or informal, reading more like a book review or a summary.',
    protocol:
      "Significant violations of academic decorum, including heavy use of slang, personal opinion, and contractions.",
  },
  {
    mark: 0,
    voice: "Inappropriate. The writing fails to meet the basic requirements of a formal academic task.",
    protocol: "Register is entirely absent or completely hinders the communication of ideas.",
  },
]);

/**
 * Step 3 detail page: band descriptor table (marks 0–5). Highlights the row matching `selectedScore`.
 * @param {number | null} selectedScore
 */
function buildCriterionDStep3RegisterRubricTableHtml(selectedScore) {
  const sel = normalizeCriterionDAgent3Score(selectedScore);
  const body = CRITERION_D_AGENT3_REGISTER_MARK_ROWS.map((row) => {
    const active = sel != null && row.mark === sel ? " criterion-d-step3-rubric-row--selected" : "";
    return `<tr class="criterion-d-step3-rubric-row${active}"><th scope="row">${row.mark}</th><td>${escapeHtml(row.voice)}</td><td>${escapeHtml(row.protocol)}</td></tr>`;
  }).join("");
  return `<table class="criterion-d-error-table criterion-d-step3-rubric-table">
    <thead><tr><th scope="col">Mark</th><th scope="col">Voice &amp; tone</th><th scope="col">Error extent &amp; protocol</th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

/**
 * Criterion D — Step 3 (Protocol Specialist: register, academic tone, formal protocol).
 * @param {string} sourceText
 * @param {string} studentParagraph
 */
function buildCriterionDStep3Message(sourceText, studentParagraph) {
  const s = sourceText.trim();
  const p = studentParagraph.trim();

  return `Criterion D — Step 3 (The Protocol Specialist — register & tone)

Role: You are a veteran IB English A **Senior Examiner** with 20+ years of experience. Your expertise is **register**, **academic tone**, and **formal protocol**. You ensure the student sounds like an **objective, authoritative critic** rather than a casual reader.

**Scope — stance and protocol only:** Judge **how** the student positions themselves and adheres to **formal academic conventions**. **Do not** audit **grammar** (comma rules, agreement, etc.) or **word complexity / vocabulary level** (that is a different task). **Do not** score **argument quality** or **interpretive accuracy** except where it surfaces as **situational unawareness** (e.g. mis-framing the **extract** as “the novel”). Focus on **stance**, **person**, **formality**, **contractions**, **author naming and attribution**, **transitional register**, and **how quotations sit in the sentence** as a **protocol / integration** issue.

Use **[Source Text]** to judge **situational framing** (extract vs whole work, prompt fit) when relevant.

---

## 1a. Author by surname & named critic (IB Paper 1 protocol)

For unseen **prose or poetry** analysis, **most** analytical sentences (topic framing, claims, and commentary on evidence) should **anchor agency and craft to the author’s surname** (*Bradbury*, *Duffy*, etc.) in conventional literary-critical register—not only once in the opening line.

- **Expectation:** Repeated, confident use of **“[Surname] shows / suggests / constructs / implies …”** (or equivalent) when attributing meaning, technique, or effect.
- **Protocol failure (tag as \`PROTOCOL_BREACHES\`):** When the paragraph **habitually** leans on **anonymous placeholders** — **the speaker**, **the voice**, **the narrator**, **the poem**, **the text**, **the writer**, etc. — **without** elaboration that ties the point to **named authorial control** (no surname, no clear bridge to who is shaping the passage), that is **weak formal protocol**, not merely a stylistic choice. Tag **verbatim** spans that exemplify the habit (e.g. a sentence opening *The speaker says…* or *In the poem…* with **no** following authorial frame in the same move).
- **Not every line must repeat the surname**, but if **most** analytical moves avoid it in favour of bare **“the poem / the speaker”** shorthand, treat that as a **register/protocol** problem and reflect it in **\`minusRows\`** and in **\`criterionD_agent3_score\`**.
- **Fine-grained judgment:** A **single** deliberate *the speaker* in poetry with **clear** rhetorical purpose and **nearby** surname anchoring may be acceptable; **do not** over-tag isolated slips. Penalize **patterns**, not one-offs.

---

## 1b. MINUS severity — **hierarchy** (reference; you judge **each row** in context)

Every \`minusRows\` item must set \`minusSeverity\` to exactly one of **BAND_KILLER**, **TECHNICAL_BREACH**, **SURFACE_SLIP**. **Same \`minusType\` can land in different tiers** depending on spread, habit, and whether the commentary task is undermined.

**1 — BAND_KILLER (high / structural):** Suggests misunderstanding of **literary commentary** as a task. If these **dominate** the paragraph, a **5** on this agent is **very unlikely**; several material band killers cap toward **≤2** unless outweighed by exceptional control elsewhere (rare).

- **DESCRIPTIVE_REGISTER** when the **overall** voice is **narrative walk-through / plot summary / immersion tourism** (subjective, immersive, “tour guide”) with **little author-centred critique** — task drift, not a one-off phrase.
- **PREACHY_OPINION** when the stance is **moralising** or **judging the author** — destroys **objective distance** for high bands.
- **PERSPECTIVE_ERRORS** when **I / you** is **habitual** (conversation, not a paper), not a single forgivable slip.

**2 — TECHNICAL_BREACH (medium):** Analytical intent is visible but **IB / examiner-facing polish** is missing.

- **PROTOCOL_BREACHES** — Author **first name** only (especially like naming only by Leo or Francis, this is highly impolite to the author); **anonymous-agent** framing without surname bridge (§1a); **empty** “the writer says” without precision.
- **SITUATIONAL_UNAWARENESS** — e.g. short poem/extract called **“the book”** / **“the story”** when the task is clearly bounded.
- **FUZZY_QUOTE_INTEGRATION** — quote **not fused** into syntax (protocol stance).
- **PERSPECTIVE_ERRORS** at **single-slip** level (one *I think* with otherwise formal voice) → usually **TECHNICAL_BREACH** or **SURFACE_SLIP**, **not** BAND_KILLER.

**3 — SURFACE_SLIP (low):** Accuracy / formality slips that **rarely alone** cap a script if **sparse**; **strings** of them → upgrade tier.

- **CONTRACTIONS** — *don't*, *it's* (tag verbatim); isolated slips here are usually **SURFACE_SLIP**.
- **COLLOQUIALISM** — one informal chunk (**SURFACE_SLIP**); **many** in the same paragraph → often **TECHNICAL_BREACH** or worse.

---

## 1. Evaluation framework — tag **verbatim** substrings from the **student paragraph**

### PLUSes (strengths)

- **STRONG_ANALYTICAL_VERBS** — Author-centric analytical verbs (*manipulates, critiques, constructs, positions, undermines*).
- **FORMAL_TRANSITIONS** — Sophisticated bridges (*notwithstanding, by extension, conversely, consequently*).
- **OBJECTIVE_DISTANCE** — Clinical, detached, analytical voice (no chatty asides; critical distance maintained).

### MINUSes (violations — choose \`minusType\` **and** \`minusSeverity\`)

- **COLLOQUIALISM** — Slang, informal phrasing, “chatty” language.
- **CONTRACTIONS** — Contracted forms (*don't*, *won't*, *it's*) — **not** \`PROTOCOL_BREACHES\`.
- **PERSPECTIVE_ERRORS** — First person (*I think*, *in my opinion*) or second person (*you see*); set severity from **habit vs slip** (§1b).
- **PREACHY_OPINION** — Moral judgment instead of analytical observation (*this is a terrible thing to do*).
- **PROTOCOL_BREACHES** — Referring to the author by **first name** only (*Francis* for F. Scott Fitzgerald); **habitual** anonymous framing (**the speaker**, **the poem**, **the text**, **the narrator**, **the writer**, etc.) **without** elaboration that ties the claim to **authorial control by surname** (see §1a). **Do not** tag **contractions** here — use **CONTRACTIONS**.
- **SITUATIONAL_UNAWARENESS** — Treating a **short extract** as “the novel” / “the book”; or ignoring the **specific context** of the task/prompt when it shows in **wording**.
- **FUZZY_QUOTE_INTEGRATION** — A quotation **dropped or pasted** so it is **not grammatically fused** into the surrounding sentence (stance/integration only — not a full mechanics pass).
- **DESCRIPTIVE_REGISTER** — Use **only** when the paragraph’s **overall stance** is **overwhelmingly** descriptive / paraphrastic / summary-led (e.g. sustained **plot walk-through**, **scene inventory**, **atmosphere tourism**) with **little or no** sustained **author-centric critique** — the voice reads like a **narrator** or **guide**, not a critic. **Do not** use this code for **one-off** descriptive lines, a **single** paraphrase clause, or local colour inside an otherwise **analytical** paragraph; those are **not** holistic register failure — tag something else or omit.

---

## 2. Output (JSON — two sections)

Return **only** valid JSON.

- \`plusRows\`: each object: \`verbatimWordOrPhrase\`, \`plusType\` (exactly one of **STRONG_ANALYTICAL_VERBS**, **FORMAL_TRANSITIONS**, **OBJECTIVE_DISTANCE**), \`onePhraseExplanation\`.
- \`minusRows\`: each object: \`verbatimWordOrPhrase\`, \`minusType\` (exactly one of **COLLOQUIALISM**, **CONTRACTIONS**, **DESCRIPTIVE_REGISTER**, **FUZZY_QUOTE_INTEGRATION**, **PERSPECTIVE_ERRORS**, **PREACHY_OPINION**, **PROTOCOL_BREACHES**, **SITUATIONAL_UNAWARENESS**), \`minusSeverity\` (**BAND_KILLER** | **TECHNICAL_BREACH** | **SURFACE_SLIP** — §1b), \`onePhraseExplanation\`.

Each row is logically: **[Verbatim] | Type | Severity | One-phrase note**. List in **rough reading order** when possible. Use **exact** substrings for \`verbatimWordOrPhrase\` so the client can **highlight** them.

---

## 3. Scoring rubric — \`criterionD_agent3_score\` (register & protocol, **integer 0–5**)

**Holistic judgment:** Read **both** columns below **together** for each mark. Choose the **single integer 0–5** that best matches the **whole** paragraph’s **voice & tone** and **error extent / protocol**, informed by your **PLUS**/**MINUS** tables and **\`minusSeverity\`** weighting (not raw MINUS count).

| Mark | Voice & tone | Error extent & protocol |
| --- | --- | --- |
| **5** | Sophisticated & authoritative. Maintains a clinical, analytical distance with a seamless academic voice. | Formal protocols (surnames, no contractions) are handled with total precision. |
| **4** | Consistent & academic. The tone is purposefully formal and focused on authorial intent rather than plot. | Errors in protocol or register are rare “slips” that do not disrupt the professional flow. |
| **3** | Functional & appropriate. The voice is clear and avoids slang, but may feel repetitive or overly safe. | Occasional lapses in protocol (e.g. contractions or “I think”) occur but the register remains generally formal. |
| **2** | Inconsistent or descriptive. The voice fluctuates between analysis and “storytelling,” often losing critical distance. | Frequent protocol breaches, such as referring to authors by first name or using second-person “you,” are present. |
| **1** | Colloquial or narrative. The tone is “chatty” or informal, reading more like a book review or a summary. | Significant violations of academic decorum, including heavy use of slang, personal opinion, and contractions. |
| **0** | Inappropriate. The writing fails to meet the basic requirements of a formal academic task. | Register is entirely absent or completely hinders the communication of ideas. |

**Weight MINUS rows by \`minusSeverity\`, not uniformly:** A few **SURFACE_SLIP** rows weigh less than one material **BAND_KILLER** row. Your long \`justification\` must still name that **severity mix** alongside the **mark-row** fit.

**Descriptive stance (holistic only):** Assign **mark 2** (or lower if other failures dominate) when the paragraph **as a whole** is **overwhelmingly** descriptive / summary-led — **only** when the **dominant** impression matches the table, **not** because of a **one-off** descriptive phrase. **Do not** mechanically output **DESCRIPTIVE_REGISTER** or **2** for a single slip.

**Authorial attribution:** A profile that **mostly** avoids the author’s **surname** in favour of bare **“the speaker / the poem / the text”** (§1a) should **not** receive **5**; treat as **several** **PROTOCOL_BREACHES** rows (typically **TECHNICAL_BREACH**) and **depress** the holistic mark toward **2–4** when the habit is **clear and sustained**.

### 3b. \`criterionD_agent3_score.justification\` — **4 or 5 sentences** (examiner voice)

Write **four or five** complete sentences in **senior IB examiner** voice. **Sentence 1 must open:** **The student earns a** [the same integer as \`score\`] **for** [short **Y** — e.g. *register and protocol*, *voice and academic distance*] **because** … and develop the claim. Remaining sentences must integrate: **which mark-row** (voice + protocol columns) best fits, the **PLUS/MINUS** pattern, and the **\`minusSeverity\`** distribution — **without** pasting the whole \`minusRows\` table.

---

[Source Text]

${s}

[Student analysis paragraph]

${p}`;
}

/** Max characters per digest field in moderator payload (host truncates). */
const CRITERION_D_MOD_DIGEST_MAX = 16000;

/**
 * @param {string} s
 * @param {number} maxLen
 */
function truncateCriterionDModeratorDigest(s, maxLen) {
  const t = String(s || "").trim().replace(/\s+/g, " ");
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

/**
 * One paragraph’s evidence for the final moderator (scores + short digests).
 * @param {string} blockLabel e.g. "Single paragraph" or "Body paragraph 2"
 * @param {object} step1Data
 * @param {object} step2Data
 * @param {object} step3Data
 */
function buildCriterionDModeratorEvidenceDigest(blockLabel, step1Data, step2Data, step3Data) {
  const s1 = step1Data && typeof step1Data === "object" ? step1Data : {};
  const s2 = step2Data && typeof step2Data === "object" ? step2Data : {};
  const s3 = step3Data && typeof step3Data === "object" ? step3Data : {};
  const p1 = s1.criterionD_phase1_only_score && typeof s1.criterionD_phase1_only_score === "object" ? s1.criterionD_phase1_only_score : {};
  const p2 = s1.sentenceRhythmPhase2 && typeof s1.sentenceRhythmPhase2 === "object" ? s1.sentenceRhythmPhase2 : {};
  const g2 = s2.criterionD_agent2_score && typeof s2.criterionD_agent2_score === "object" ? s2.criterionD_agent2_score : {};
  const g3 = s3.criterionD_agent3_score && typeof s3.criterionD_agent3_score === "object" ? s3.criterionD_agent3_score : {};
  const p2Text =
    p2.justification != null && String(p2.justification).trim()
      ? String(p2.justification)
      : p2.explanation != null
        ? String(p2.explanation)
        : "";
  return {
    blockLabel: String(blockLabel || "").trim() || "—",
    syntaxOutOf5: {
      score: normalizeCriterionDPhase1OnlyScore(p1.score),
      digest: truncateCriterionDModeratorDigest(p1.justification != null ? String(p1.justification) : "", CRITERION_D_MOD_DIGEST_MAX),
    },
    sentenceStructureOutOf5: {
      score: normalizeCriterionDPhase2OnlyScore(p2.score),
      digest: truncateCriterionDModeratorDigest(p2Text, CRITERION_D_MOD_DIGEST_MAX),
    },
    vocabularyOutOf5: {
      score: normalizeCriterionDAgent2Score(g2.score),
      digest: truncateCriterionDModeratorDigest(g2.justification != null ? String(g2.justification) : "", CRITERION_D_MOD_DIGEST_MAX),
    },
    registerOutOf5: {
      score: normalizeCriterionDAgent3Score(g3.score),
      digest: truncateCriterionDModeratorDigest(g3.justification != null ? String(g3.justification) : "", CRITERION_D_MOD_DIGEST_MAX),
    },
  };
}

/**
 * Criterion D — Step 4 (final moderator: holistic 0–5).
 * @param {{ kind: "single" | "essay"; bodies: object[] }} evidence Each body is output of \`buildCriterionDModeratorEvidenceDigest\`.
 * @param {string} studentContext Full essay or single paragraph (for gestalt only).
 */
function buildCriterionDStep4Message(evidence, studentContext) {
  const p = String(studentContext || "").trim();
  const mode = evidence && evidence.kind === "essay" ? "essay" : "single";
  const jEv = JSON.stringify(
    { mode, bodies: Array.isArray(evidence && evidence.bodies) ? evidence.bodies : [] },
    null,
    2
  );

  return `Criterion D — Step 4 (Final moderator — holistic language mark)

Role: You are an **experienced IB English A examiner and moderator** judging **Criterion D (Language) only**. You receive **structured evidence**: per block, **four** strands each on a **unified 0–5** scale — **syntax** (Phase 1 mechanics holism), **sentence structure** (Phase 2), **vocabulary** (lexical agent), **register** (Agent 3) — each with a **short justification digest**. There is **no fixed weighting** — only how the strands **combine** to match the **official IB Criterion D** descriptors.

**Scope — language quality only.** Ignore illogical agent noise unless it reflects real language issues. Do **not** re-score ideas or interpretation beyond what appears as **language** in the digests. Use the student text at the end for **gestalt** only when helpful.

---

## Official IB descriptors (Criterion D — language)

| Score | Descriptor |
| --- | --- |
| **0** | The work does not reach a standard described by the descriptors below. |
| **1** | Language is rarely clear and appropriate; there are many errors in grammar, vocabulary and sentence construction and little sense of register and style. |
| **2** | Language is sometimes clear and carefully chosen; grammar, vocabulary and sentence construction are fairly accurate, although errors and inconsistencies are apparent; the register and style are to some extent appropriate to the task. |
| **3** | Language is clear and carefully chosen with an adequate degree of accuracy in grammar, vocabulary and sentence construction despite some lapses; register and style are mostly appropriate to the task. |
| **4** | Language is clear and carefully chosen, with a good degree of accuracy in grammar, vocabulary and sentence construction; register and style are consistently appropriate to the task. |
| **5** | Language is very clear, effective, carefully chosen and precise, with a high degree of accuracy in grammar, vocabulary and sentence construction; register and style are effective and appropriate to the task. |

---

## Common performance (benchmarks only — not rules)

These are **rough** patterns when **several** blocks point the same way; **you** judge the script in front of you.

- **5:** A mix of **4**s and **5**s across the **four** **0–5** strands with **no** particularly weak or mediocre area.
- **4:** Majority **4**s, some **5**s and **3**s across strands, **no** weak area dominating.
- **3:** Majority **3**s, some **4**s (≤ about **20–25%**), or **4**s with **clear** weaknesses pulling the whole down.
- **2:** A mix of **2**s and **3**s where **2** is **substantial**, or **one** very weak strand harming the **whole** response.
- **1:** A mix of **1**s and **2**s, leaning **1**.
- **0:** A mix of **0**s and **1**s, or language that **obstructs** communication.

---

## Half marks

Output **score** from **0** to **5** inclusive, in **0.5** steps **only** when strictly necessary. **Prefer whole integers.** Allowed: **0, 0.5, 1, …, 4.5, 5**.

---

## Output (JSON only)

Return **only** valid JSON with \`criterionD_moderator_score\`:
- \`score\`: number, **0–5**, **0.5** steps as above.
- \`justification\`: **5 or 6 sentences** (not shorter, not longer). **Sentence 1 must begin:** **The student earns a score of** [numeric score] **because** … Use **explicit, accurate** wording from the **official descriptors** above (grammar, vocabulary, sentence construction, register and style). Weave in how the **syntax / sentence structure / vocabulary / register** digests **together** support that mark. Moderator voice: calm, authoritative.

---

### Moderator evidence (scores + digests — JSON)

${jEv}

### Student text (context — optional gestalt)

${p}
`;
}

/**
 * Criterion D Agent 2 — lexical / vocabulary control mark (**0–5**).
 * @param {unknown} n
 * @returns {number | null}
 */
function normalizeCriterionDAgent2Score(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const r = Math.round(x);
  if (r < 0 || r > 5) return null;
  return r;
}

/**
 * Criterion D Step 3 — register & protocol agent mark (0–5).
 * @param {unknown} n
 * @returns {number | null}
 */
function normalizeCriterionDAgent3Score(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const r = Math.round(x);
  if (r < 0 || r > 5) return null;
  return r;
}

/**
 * Final Criterion D moderator mark: 0–5 in steps of 0.5.
 * @param {unknown} n
 * @returns {number | null}
 */
function normalizeCriterionDFinalModeratorScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const r = Math.round(x * 2) / 2;
  if (r < 0 || r > 5) return null;
  return r;
}

/**
 * @param {number | null} n
 */
function formatCriterionDFinalModeratorDisplay(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : String(n);
}

/** Official Criterion D (Language) descriptor text — integer marks only (half rows interpolate in the table). */
const CRITERION_D_OFFICIAL_LANGUAGE_DESCRIPTOR_BY_LEVEL = {
  0: "The work does not reach a standard described by the descriptors below.",
  1: "Language is rarely clear and appropriate; there are many errors in grammar, vocabulary and sentence construction and little sense of register and style.",
  2: "Language is sometimes clear and carefully chosen; grammar, vocabulary and sentence construction are fairly accurate, although errors and inconsistencies are apparent; the register and style are to some extent appropriate to the task.",
  3: "Language is clear and carefully chosen with an adequate degree of accuracy in grammar, vocabulary and sentence construction despite some lapses; register and style are mostly appropriate to the task.",
  4: "Language is clear and carefully chosen, with a good degree of accuracy in grammar, vocabulary and sentence construction; register and style are consistently appropriate to the task.",
  5: "Language is very clear, effective, carefully chosen and precise, with a high degree of accuracy in grammar, vocabulary and sentence construction; register and style are effective and appropriate to the task.",
};

/** Full rubric block for model prompts (must stay aligned with CRITERION_D_OFFICIAL_LANGUAGE_DESCRIPTOR_BY_LEVEL). */
const CRITERION_D_IB_OFFICIAL_RUBRIC_BLOCK = `Criterion D: Language
— How clear, varied and accurate is the use of language?

0 — ${CRITERION_D_OFFICIAL_LANGUAGE_DESCRIPTOR_BY_LEVEL[0]}

1 — ${CRITERION_D_OFFICIAL_LANGUAGE_DESCRIPTOR_BY_LEVEL[1]}

2 — ${CRITERION_D_OFFICIAL_LANGUAGE_DESCRIPTOR_BY_LEVEL[2]}

3 — ${CRITERION_D_OFFICIAL_LANGUAGE_DESCRIPTOR_BY_LEVEL[3]}

4 — ${CRITERION_D_OFFICIAL_LANGUAGE_DESCRIPTOR_BY_LEVEL[4]}

5 — ${CRITERION_D_OFFICIAL_LANGUAGE_DESCRIPTOR_BY_LEVEL[5]}`;

const CRITERION_D_LANGUAGE_RUBRIC_TABLE_HEADING = "Criterion D: Language — official descriptors";

/**
 * HTML: official Criterion D (Language) rubric as a compact table, 5 down to 0 in 0.5 steps — same structure/classes as Criteria A–C.
 * @param {number | null | undefined} highlightScore Normalized 0–5 in steps of 0.5; matching row gets highlight class.
 * @returns {string}
 */
function buildCriterionDLanguageRubricTableHtml(highlightScore) {
  const hi =
    highlightScore == null || !Number.isFinite(Number(highlightScore))
      ? null
      : normalizeCriterionDFinalModeratorScore(highlightScore);
  const rows = [];
  for (let eighth = 10; eighth >= 0; eighth--) {
    const rowScore = eighth / 2;
    const disp = Number.isInteger(rowScore) ? String(rowScore) : rowScore.toFixed(1);
    const isInt = Number.isInteger(rowScore);
    const lev = Math.floor(rowScore);
    const upper = Math.ceil(rowScore);
    const desc = isInt
      ? CRITERION_D_OFFICIAL_LANGUAGE_DESCRIPTOR_BY_LEVEL[rowScore]
      : `Between the official level ${lev} and level ${upper} descriptors`;
    const active = hi != null && Math.abs(rowScore - hi) < 1e-6;
    const rowClass = `criterion-a-ib-rubric-row${active ? " criterion-a-ib-rubric-row--active" : ""}${isInt ? " criterion-a-ib-rubric-row--integer" : " criterion-a-ib-rubric-row--half"}`;
    rows.push(
      `<tr class="${rowClass}"><td class="criterion-a-ib-rubric__mark">${escapeHtml(disp)}</td><td class="criterion-a-ib-rubric__desc">${escapeHtml(desc)}</td></tr>`
    );
  }
  return `<section class="criterion-a-ib-rubric criterion-d-ib-rubric" aria-label="Criterion D Language rubric">
    <header class="criterion-a-ib-rubric__head">
      <h3 class="criterion-a-ib-rubric__title">${escapeHtml(CRITERION_D_LANGUAGE_RUBRIC_TABLE_HEADING)}</h3>
    </header>
    <table class="criterion-a-ib-rubric__table">
      <thead>
        <tr>
          <th scope="col">Mark</th>
          <th scope="col">Descriptor</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  </section>`;
}

/** @type {Record<string, string>} */
const CRITERION_D_STEP3_PLUS_LABELS = {
  STRONG_ANALYTICAL_VERBS: "Strong analytical verbs",
  FORMAL_TRANSITIONS: "Formal transitions",
  OBJECTIVE_DISTANCE: "Objective distance",
};

/** @type {Record<string, string>} */
const CRITERION_D_STEP3_MINUS_LABELS = {
  COLLOQUIALISM: "Colloquialism",
  CONTRACTIONS: "Contractions",
  DESCRIPTIVE_REGISTER: "Descriptive / narrative register (overwhelming stance, not one-off)",
  FUZZY_QUOTE_INTEGRATION: "Fuzzy quote integration",
  PERSPECTIVE_ERRORS: "Perspective errors (I / you)",
  PREACHY_OPINION: "Preachy opinion (lost objective distance)",
  PROTOCOL_BREACHES: "Protocol breaches (first name, anonymous framing)",
  SITUATIONAL_UNAWARENESS: "Situational unawareness",
};

/** @type {Record<string, string>} */
const CRITERION_D_REGISTER_MINUS_SEVERITY_LABELS = {
  BAND_KILLER: "Band killer (high severity)",
  TECHNICAL_BREACH: "Technical breach (medium severity)",
  SURFACE_SLIP: "Surface slip (low severity)",
};

/**
 * @param {unknown} raw
 */
function normalizeCriterionDStep3PlusTypeKey(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

/**
 * @param {unknown} raw
 */
function normalizeCriterionDStep3MinusTypeKey(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

/**
 * @param {string} s
 */
function criterionDFormatUnderscoreTypeFallback(s) {
  return String(s || "—")
    .trim()
    .split(/_+/u)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * @param {unknown} raw
 */
function formatCriterionDStep3PlusType(raw) {
  const k = normalizeCriterionDStep3PlusTypeKey(raw);
  return CRITERION_D_STEP3_PLUS_LABELS[k] || criterionDFormatUnderscoreTypeFallback(String(raw || "—"));
}

/**
 * @param {unknown} raw
 */
function formatCriterionDStep3MinusType(raw) {
  const k = normalizeCriterionDStep3MinusTypeKey(raw);
  return CRITERION_D_STEP3_MINUS_LABELS[k] || criterionDFormatUnderscoreTypeFallback(String(raw || "—"));
}

/**
 * @param {unknown} raw
 * @returns {"BAND_KILLER" | "TECHNICAL_BREACH" | "SURFACE_SLIP" | null}
 */
function normalizeCriterionDRegisterMinusSeverityKey(raw) {
  const k = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (CRITERION_D_REGISTER_MINUS_SEVERITY_ENUM.includes(k)) return /** @type {const} */ (k);
  return null;
}

/**
 * Default tier when `minusSeverity` is missing (legacy bundles). Per-type defaults are weak; prefer model output.
 * @param {unknown} minusType
 * @returns {"BAND_KILLER" | "TECHNICAL_BREACH" | "SURFACE_SLIP"}
 */
function inferCriterionDRegisterMinusSeverityFromType(minusType) {
  const k = normalizeCriterionDStep3MinusTypeKey(minusType);
  if (k === "DESCRIPTIVE_REGISTER" || k === "PREACHY_OPINION") return "BAND_KILLER";
  if (k === "COLLOQUIALISM" || k === "CONTRACTIONS") return "SURFACE_SLIP";
  if (
    k === "PROTOCOL_BREACHES" ||
    k === "SITUATIONAL_UNAWARENESS" ||
    k === "FUZZY_QUOTE_INTEGRATION" ||
    k === "PERSPECTIVE_ERRORS"
  ) {
    return "TECHNICAL_BREACH";
  }
  return "TECHNICAL_BREACH";
}

/**
 * @param {object} row
 * @returns {"BAND_KILLER" | "TECHNICAL_BREACH" | "SURFACE_SLIP"}
 */
function getCriterionDRegisterMinusSeverityForRow(row) {
  const fromModel = normalizeCriterionDRegisterMinusSeverityKey(row && row.minusSeverity);
  if (fromModel) return fromModel;
  return inferCriterionDRegisterMinusSeverityFromType(row && row.minusType);
}

/**
 * @param {unknown} raw
 */
function formatCriterionDRegisterMinusSeverity(raw) {
  const k = normalizeCriterionDRegisterMinusSeverityKey(raw);
  if (k) return CRITERION_D_REGISTER_MINUS_SEVERITY_LABELS[k] || k;
  return "—";
}

/**
 * @param {object} minusRow
 * @returns {number}
 */
function criterionDRegisterMinusPaintPriority(minusRow) {
  const sev = getCriterionDRegisterMinusSeverityForRow(minusRow);
  if (sev === "BAND_KILLER") return 12;
  if (sev === "TECHNICAL_BREACH") return 11;
  return 10;
}

/**
 * @param {unknown} raw
 * @returns {"G" | "S1" | "S2" | "B1" | "B2" | "UNK"}
 */
function normalizeCriterionDLexicalCode(raw) {
  let u = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (u === "S-1") u = "S1";
  if (u === "S-2") u = "S2";
  if (u === "B-1") u = "B1";
  if (u === "B-2") u = "B2";
  const ok = ["G", "S1", "S2", "B1", "B2"];
  if (ok.includes(u)) return /** @type {const} */ (u);
  return "UNK";
}

/**
 * @param {string} code
 */
function criterionDLexicalBadgeClass(code) {
  const c = normalizeCriterionDLexicalCode(code);
  if (c === "G") return "criterion-d-lex criterion-d-lex--g";
  if (c === "S1") return "criterion-d-lex criterion-d-lex--s1";
  if (c === "S2") return "criterion-d-lex criterion-d-lex--s2";
  if (c === "B1") return "criterion-d-lex criterion-d-lex--b1";
  if (c === "B2") return "criterion-d-lex criterion-d-lex--b2";
  return "criterion-d-lex criterion-d-lex--unk";
}

/**
 * Heuristic: position `start` lies inside a run delimited by ASCII \`"\` (toggle per quote).
 * @param {string} text
 * @param {number} start
 */
function criterionDLexIndexInsideAsciiDoubleQuotes(text, start) {
  const head = text.slice(0, Math.max(0, start));
  let n = 0;
  for (let i = 0; i < head.length; i++) {
    if (head.charCodeAt(i) === 34) n++;
  }
  return n % 2 === 1;
}

/**
 * @param {string} fullParagraph
 * @param {object[]} lexicalRows
 */
function buildCriterionDLexicalHighlightedHtml(fullParagraph, lexicalRows) {
  const text = String(fullParagraph || "");
  const rows = Array.isArray(lexicalRows) ? lexicalRows : [];
  const parts = [];
  let cursor = 0;
  let aligned = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const w = row.verbatimWordOrPhrase != null ? String(row.verbatimWordOrPhrase) : "";
    if (!w.trim()) continue;
    let idx = findVerbatimInBody(text, w, cursor);
    let guard = 0;
    while (
      idx !== -1 &&
      criterionDLexIndexInsideAsciiDoubleQuotes(text, idx) &&
      guard < 64
    ) {
      const next = text.indexOf(w, idx + 1);
      if (next === -1) break;
      idx = next;
      guard++;
    }
    if (idx === -1 || idx < cursor) continue;
    if (criterionDLexIndexInsideAsciiDoubleQuotes(text, idx)) continue;
    aligned += 1;
    if (idx > cursor) {
      parts.push(`<span class="criterion-d-lex-plain">${escapeHtml(text.slice(cursor, idx))}</span>`);
    }
    const code = normalizeCriterionDLexicalCode(row.indexCode);
    const cls = criterionDLexicalBadgeClass(row.indexCode);
    const expl = row.onePhraseExplanation != null ? String(row.onePhraseExplanation) : "";
    const title = `${code}: ${expl}`.trim();
    parts.push(
      `<span class="${cls}" tabindex="0" data-d-lex-idx="${i}" role="button" aria-label="Lexical tier ${code}" title="${escapeHtml(title)}">${escapeHtml(w)}</span>`
    );
    cursor = idx + w.length;
  }

  if (cursor < text.length) {
    parts.push(`<span class="criterion-d-lex-plain">${escapeHtml(text.slice(cursor))}</span>`);
  }

  let warn = "";
  if (rows.length > 0 && aligned < rows.filter((r) => String(r.verbatimWordOrPhrase || "").trim()).length) {
    warn =
      '<p class="audit-warn">Some lexical items could not be matched to exact substrings of the paragraph; highlights may be incomplete. Use &ldquo;Copy step 2 (JSON)&rdquo; for the full model output.</p>';
  }

  return (
    warn +
    `<div class="audit-legend criterion-d-lex-legend" aria-hidden="true">
      <span class="lg lg-d-g">G generic</span>
      <span class="lg lg-d-s1">S1 solid</span>
      <span class="lg lg-d-s2">S2 elite</span>
      <span class="lg lg-d-b1">B1 bloat / minor</span>
      <span class="lg lg-d-b2">B2 major / bloat</span>
    </div>
    <p class="criterion-d-lex-paragraph">${parts.length ? parts.join("") : escapeHtml(text)}</p>`
  );
}

/** @type {HTMLDivElement | null} */
let criterionDLexTooltip = null;
/** @type {boolean} */
let criterionDLexTooltipHoverBound = false;
let criterionDLexTooltipHideTimer = null;
/** @type {(() => void) | null} */
let boundScrollRepositionDLex = null;

function clearCriterionDLexTooltipHide() {
  if (criterionDLexTooltipHideTimer) {
    clearTimeout(criterionDLexTooltipHideTimer);
    criterionDLexTooltipHideTimer = null;
  }
}

function scheduleHideCriterionDLexTooltip() {
  clearCriterionDLexTooltipHide();
  criterionDLexTooltipHideTimer = setTimeout(() => {
    if (criterionDLexTooltip) criterionDLexTooltip.hidden = true;
  }, 180);
}

function positionCriterionDLexTooltip(anchorEl) {
  if (!criterionDLexTooltip) return;
  const rect = anchorEl.getBoundingClientRect();
  const pad = 8;
  const tw = Math.min(400, window.innerWidth - 24);
  criterionDLexTooltip.style.position = "fixed";
  criterionDLexTooltip.style.width = `${tw}px`;
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
  criterionDLexTooltip.style.left = `${left}px`;

  const margin = 10;
  const est = 220;
  let top = rect.bottom + margin;
  if (top + est > window.innerHeight - pad) {
    top = rect.top - margin - est;
  }
  if (top < pad) top = pad;
  criterionDLexTooltip.style.top = `${top}px`;
}

function hideCriterionDLexTooltip() {
  clearCriterionDLexTooltipHide();
  if (criterionDLexTooltip) criterionDLexTooltip.hidden = true;
}

/**
 * @param {HTMLElement} el
 * @param {object} step2Data
 */
function fillCriterionDLexTooltip(el, step2Data) {
  if (!criterionDLexTooltip) return;
  clearCriterionDLexTooltipHide();
  criterionDLexTooltip.innerHTML = "";
  criterionDLexTooltip.hidden = false;

  const ri = Number(el.getAttribute("data-d-lex-idx"));
  const rows = Array.isArray(step2Data.lexicalRows) ? step2Data.lexicalRows : [];
  const row = rows[ri];
  if (!row) {
    criterionDLexTooltip.hidden = true;
    return;
  }

  const code = normalizeCriterionDLexicalCode(row.indexCode);
  const title = document.createElement("div");
  title.className = "audit-tooltip__title";
  title.textContent = `Criterion D · Lexical · ${code}`;
  criterionDLexTooltip.appendChild(title);

  const w = row.verbatimWordOrPhrase != null ? String(row.verbatimWordOrPhrase) : "—";
  const p1 = document.createElement("p");
  p1.className = "audit-tooltip__summary";
  p1.style.margin = "0 0 0.5rem";
  p1.style.fontSize = "0.82rem";
  const s0 = document.createElement("strong");
  s0.textContent = "Span:";
  p1.appendChild(s0);
  p1.appendChild(document.createTextNode(" "));
  const q = document.createElement("q");
  q.textContent = w;
  p1.appendChild(q);
  criterionDLexTooltip.appendChild(p1);

  const ex = row.onePhraseExplanation != null ? String(row.onePhraseExplanation) : "—";
  const p2 = document.createElement("p");
  p2.style.margin = "0";
  p2.style.fontSize = "0.82rem";
  const s = document.createElement("strong");
  s.textContent = "Note:";
  p2.appendChild(s);
  p2.appendChild(document.createTextNode(` ${ex}`));
  criterionDLexTooltip.appendChild(p2);

  positionCriterionDLexTooltip(el);
}

/**
 * @param {HTMLElement} rootEl
 * @param {object} step2Data
 */
function bindCriterionDLexicalInteractions(rootEl, step2Data) {
  if (boundScrollRepositionDLex) {
    window.removeEventListener("scroll", boundScrollRepositionDLex, true);
    boundScrollRepositionDLex = null;
  }

  const spans = rootEl.querySelectorAll("[data-d-lex-idx]");
  spans.forEach((span) => {
    span.addEventListener("mouseenter", () => {
      clearCriterionDLexTooltipHide();
      fillCriterionDLexTooltip(span, step2Data);
    });
    span.addEventListener("mouseleave", () => scheduleHideCriterionDLexTooltip());
    span.addEventListener("focus", () => {
      clearCriterionDLexTooltipHide();
      fillCriterionDLexTooltip(span, step2Data);
    });
    span.addEventListener("blur", () => scheduleHideCriterionDLexTooltip());
  });

  if (criterionDLexTooltip && !criterionDLexTooltipHoverBound) {
    criterionDLexTooltip.addEventListener("mouseenter", () => clearCriterionDLexTooltipHide());
    criterionDLexTooltip.addEventListener("mouseleave", () => scheduleHideCriterionDLexTooltip());
    criterionDLexTooltipHoverBound = true;
  }

  boundScrollRepositionDLex = () => {
    if (!criterionDLexTooltip || criterionDLexTooltip.hidden) return;
    const active = document.activeElement;
    if (active && active.getAttribute("data-d-lex-idx") !== null) {
      positionCriterionDLexTooltip(active);
    }
  };
  window.addEventListener("scroll", boundScrollRepositionDLex, true);
}

/** @type {HTMLDivElement | null} */
let criterionDRegTooltip = null;
/** @type {boolean} */
let criterionDRegTooltipHoverBound = false;
let criterionDRegTooltipHideTimer = null;
/** @type {(() => void) | null} */
let boundScrollRepositionDReg = null;

function clearCriterionDRegTooltipHide() {
  if (criterionDRegTooltipHideTimer) {
    clearTimeout(criterionDRegTooltipHideTimer);
    criterionDRegTooltipHideTimer = null;
  }
}

function scheduleHideCriterionDRegTooltip() {
  clearCriterionDRegTooltipHide();
  criterionDRegTooltipHideTimer = setTimeout(() => {
    if (criterionDRegTooltip) criterionDRegTooltip.hidden = true;
  }, 180);
}

function positionCriterionDRegTooltip(anchorEl) {
  if (!criterionDRegTooltip) return;
  const rect = anchorEl.getBoundingClientRect();
  const pad = 8;
  const tw = Math.min(400, window.innerWidth - 24);
  criterionDRegTooltip.style.position = "fixed";
  criterionDRegTooltip.style.width = `${tw}px`;
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
  criterionDRegTooltip.style.left = `${left}px`;
  const margin = 10;
  const est = 220;
  let top = rect.bottom + margin;
  if (top + est > window.innerHeight - pad) {
    top = rect.top - margin - est;
  }
  if (top < pad) top = pad;
  criterionDRegTooltip.style.top = `${top}px`;
}

function hideCriterionDRegTooltip() {
  clearCriterionDRegTooltipHide();
  if (criterionDRegTooltip) criterionDRegTooltip.hidden = true;
}

/**
 * @param {string} polarity
 * @param {string} typeKey
 * @param {"BAND_KILLER" | "TECHNICAL_BREACH" | "SURFACE_SLIP" | null} [severityKey]
 */
function criterionDRegisterSpanClass(polarity, typeKey, severityKey) {
  if (polarity === "PLUS") {
    if (typeKey === "STRONG_ANALYTICAL_VERBS") return "criterion-d-reg criterion-d-reg--p-sv";
    if (typeKey === "FORMAL_TRANSITIONS") return "criterion-d-reg criterion-d-reg--p-tr";
    if (typeKey === "OBJECTIVE_DISTANCE") return "criterion-d-reg criterion-d-reg--p-od";
    return "criterion-d-reg criterion-d-reg--p";
  }
  if (typeKey === "DESCRIPTIVE_REGISTER") return "criterion-d-reg criterion-d-reg--m-desc";
  if (severityKey === "BAND_KILLER") return "criterion-d-reg criterion-d-reg--m-band";
  if (severityKey === "TECHNICAL_BREACH") return "criterion-d-reg criterion-d-reg--m-tech";
  if (severityKey === "SURFACE_SLIP") return "criterion-d-reg criterion-d-reg--m-surf";
  return "criterion-d-reg criterion-d-reg--m-tech";
}

/**
 * @param {string} fullParagraph
 * @param {object[]} plusRows
 * @param {object[]} minusRows
 * @returns {{ html: string, metaByFid: Record<number, { polarity: string, typeKey: string, typeLabel: string, explanation: string, severityKey?: string, severityLabel?: string }> }}
 */
function buildCriterionDRegisterHighlightedHtml(fullParagraph, plusRows, minusRows) {
  const text = String(fullParagraph || "");
  const n = text.length;
  /** @type {({ polarity: string, fid: number, priority: number } | null)[]} */
  const layer = Array(n).fill(null);
  /** @type {Record<number, { polarity: string, typeKey: string, typeLabel: string, explanation: string }>} */
  const metaByFid = {};
  let nextFid = 0;

  const plus = Array.isArray(plusRows) ? plusRows : [];
  const minus = Array.isArray(minusRows) ? minusRows : [];

  let painted = 0;
  let targets = 0;
  for (const row of plus) {
    if (String(row.verbatimWordOrPhrase || "").trim()) targets += 1;
  }
  for (const row of minus) {
    if (String(row.verbatimWordOrPhrase || "").trim()) targets += 1;
  }

  /**
   * @param {object} row
   * @param {"PLUS"|"MINUS"} polarity
   * @param {(r: object) => string} getVerbatim
   * @param {(r: object) => unknown} getTypeRaw
   */
  function paintRow(row, polarity, getVerbatim, getTypeRaw) {
    const w = getVerbatim(row);
    if (!String(w).trim()) return;
    const idx = findVerbatimInBody(text, w, 0);
    if (idx === -1) return;
    const len = w.length;
    const end = Math.min(n, idx + len);
    const fid = nextFid++;
    const typeRaw = getTypeRaw(row);
    const typeKey =
      polarity === "PLUS"
        ? normalizeCriterionDStep3PlusTypeKey(typeRaw)
        : normalizeCriterionDStep3MinusTypeKey(typeRaw);
    const typeLabel =
      polarity === "PLUS" ? formatCriterionDStep3PlusType(typeRaw) : formatCriterionDStep3MinusType(typeRaw);
    /** @type {"BAND_KILLER" | "TECHNICAL_BREACH" | "SURFACE_SLIP" | undefined} */
    let severityKey;
    /** @type {string | undefined} */
    let severityLabel;
    if (polarity === "MINUS") {
      severityKey = getCriterionDRegisterMinusSeverityForRow(row);
      severityLabel = formatCriterionDRegisterMinusSeverity(severityKey);
    }
    metaByFid[fid] = {
      polarity,
      typeKey,
      typeLabel,
      explanation: row.onePhraseExplanation != null ? String(row.onePhraseExplanation) : "—",
      ...(severityKey ? { severityKey, severityLabel } : {}),
    };
    const priority = polarity === "MINUS" ? criterionDRegisterMinusPaintPriority(row) : 1;
    for (let i = idx; i < end; i++) {
      if (polarity === "MINUS") {
        const cur = layer[i];
        if (!cur || cur.polarity === "PLUS" || (cur.polarity === "MINUS" && priority >= cur.priority)) {
          layer[i] = { polarity, fid, priority };
        }
      } else if (!layer[i] || layer[i].priority < priority) {
        layer[i] = { polarity, fid, priority };
      }
    }
    painted += 1;
  }

  for (const row of plus) {
    paintRow(row, "PLUS", (r) => String(r.verbatimWordOrPhrase ?? ""), (r) => r.plusType);
  }
  for (const row of minus) {
    paintRow(row, "MINUS", (r) => String(r.verbatimWordOrPhrase ?? ""), (r) => r.minusType);
  }

  const parts = [];
  let i = 0;
  while (i < n) {
    if (!layer[i]) {
      let j = i;
      while (j < n && !layer[j]) j++;
      parts.push(`<span class="criterion-d-reg-plain">${escapeHtml(text.slice(i, j))}</span>`);
      i = j;
      continue;
    }
    const curFid = layer[i].fid;
    let j = i;
    while (j < n && layer[j] && layer[j].fid === curFid) j++;
    const slice = text.slice(i, j);
    const m = metaByFid[curFid];
    const sevForClass =
      m && m.polarity === "MINUS"
        ? getCriterionDRegisterMinusSeverityForRow({ minusSeverity: m.severityKey, minusType: m.typeKey })
        : null;
    const cls = m ? criterionDRegisterSpanClass(m.polarity, m.typeKey, sevForClass) : "criterion-d-reg criterion-d-reg--unk";
    const pol = m && m.polarity === "PLUS" ? "PLUS" : "MINUS";
    const sevLbl =
      m && m.polarity === "MINUS"
        ? formatCriterionDRegisterMinusSeverity(getCriterionDRegisterMinusSeverityForRow({ minusSeverity: m.severityKey, minusType: m.typeKey }))
        : "";
    const ttl = m
      ? (pol === "MINUS" && sevLbl && sevLbl !== "—"
          ? `${pol} · ${sevLbl} · ${m.typeLabel}: ${m.explanation}`
          : `${pol} · ${m.typeLabel}: ${m.explanation}`
        ).trim()
      : "Register";
    parts.push(
      `<span class="${cls}" tabindex="0" data-d-reg-idx="${curFid}" role="button" aria-label="Register highlight ${pol}" title="${escapeHtml(ttl)}">${escapeHtml(slice)}</span>`
    );
    i = j;
  }

  let warn = "";
  if (targets > 0 && painted < targets) {
    warn =
      '<p class="audit-warn">Some register items could not be matched to exact substrings of the paragraph; highlights may be incomplete.</p>';
  }

  return {
    html:
      warn +
      `<div class="audit-legend criterion-d-reg-legend" aria-hidden="true">
        <span class="lg lg-d-reg-p">PLUS</span>
        <span class="lg lg-d-reg-m-band">MINUS · band killer</span>
        <span class="lg lg-d-reg-m-tech">MINUS · technical</span>
        <span class="lg lg-d-reg-m-surf">MINUS · surface</span>
        <span class="lg lg-d-reg-md">Narrative / descriptive stance</span>
      </div>
      <p class="criterion-d-reg-paragraph">${parts.length ? parts.join("") : escapeHtml(text)}</p>`,
    metaByFid,
  };
}

/**
 * @param {HTMLElement} el
 * @param {Record<number, { polarity: string, typeKey: string, typeLabel: string, explanation: string, severityKey?: string, severityLabel?: string }>} metaByFid
 */
function fillCriterionDRegTooltip(el, metaByFid) {
  if (!criterionDRegTooltip) return;
  clearCriterionDRegTooltipHide();
  criterionDRegTooltip.innerHTML = "";
  criterionDRegTooltip.hidden = false;

  const fid = Number(el.getAttribute("data-d-reg-idx"));
  const m = metaByFid[fid];
  if (!m) {
    criterionDRegTooltip.hidden = true;
    return;
  }

  const title = document.createElement("div");
  title.className = "audit-tooltip__title";
  title.textContent = `Criterion D · Register · ${m.polarity === "PLUS" ? "PLUS" : "MINUS"}`;
  criterionDRegTooltip.appendChild(title);

  const p1 = document.createElement("p");
  p1.className = "audit-tooltip__summary";
  p1.style.margin = "0 0 0.5rem";
  p1.style.fontSize = "0.82rem";
  const s0 = document.createElement("strong");
  s0.textContent = "Type:";
  p1.appendChild(s0);
  p1.appendChild(document.createTextNode(` ${m.typeLabel}`));
  criterionDRegTooltip.appendChild(p1);

  if (m.polarity === "MINUS") {
    const sev = getCriterionDRegisterMinusSeverityForRow({ minusSeverity: m.severityKey, minusType: m.typeKey });
    const pSev = document.createElement("p");
    pSev.className = "audit-tooltip__summary";
    pSev.style.margin = "0 0 0.5rem";
    pSev.style.fontSize = "0.82rem";
    const sSev = document.createElement("strong");
    sSev.textContent = "Severity:";
    pSev.appendChild(sSev);
    pSev.appendChild(document.createTextNode(` ${formatCriterionDRegisterMinusSeverity(sev)}`));
    criterionDRegTooltip.appendChild(pSev);
  }

  const p2 = document.createElement("p");
  p2.style.margin = "0";
  p2.style.fontSize = "0.82rem";
  const s = document.createElement("strong");
  s.textContent = "Note:";
  p2.appendChild(s);
  p2.appendChild(document.createTextNode(` ${m.explanation}`));
  criterionDRegTooltip.appendChild(p2);

  positionCriterionDRegTooltip(el);
}

/**
 * @param {HTMLElement} rootEl
 * @param {Record<number, { polarity: string, typeKey: string, typeLabel: string, explanation: string, severityKey?: string, severityLabel?: string }>} metaByFid
 */
function bindCriterionDRegisterInteractions(rootEl, metaByFid) {
  if (boundScrollRepositionDReg) {
    window.removeEventListener("scroll", boundScrollRepositionDReg, true);
    boundScrollRepositionDReg = null;
  }

  const spans = rootEl.querySelectorAll("[data-d-reg-idx]");
  spans.forEach((span) => {
    span.addEventListener("mouseenter", () => {
      clearCriterionDRegTooltipHide();
      fillCriterionDRegTooltip(span, metaByFid);
    });
    span.addEventListener("mouseleave", () => scheduleHideCriterionDRegTooltip());
    span.addEventListener("focus", () => {
      clearCriterionDRegTooltipHide();
      fillCriterionDRegTooltip(span, metaByFid);
    });
    span.addEventListener("blur", () => scheduleHideCriterionDRegTooltip());
  });

  if (criterionDRegTooltip && !criterionDRegTooltipHoverBound) {
    criterionDRegTooltip.addEventListener("mouseenter", () => clearCriterionDRegTooltipHide());
    criterionDRegTooltip.addEventListener("mouseleave", () => scheduleHideCriterionDRegTooltip());
    criterionDRegTooltipHoverBound = true;
  }

  boundScrollRepositionDReg = () => {
    if (!criterionDRegTooltip || criterionDRegTooltip.hidden) return;
    const active = document.activeElement;
    if (active && active.hasAttribute && active.hasAttribute("data-d-reg-idx")) {
      positionCriterionDRegTooltip(active);
    }
  };
  window.addEventListener("scroll", boundScrollRepositionDReg, true);
}

/**
 * @param {unknown} raw
 * @returns {string | null} One of CRITERION_D_STEP1_UNDERSTANDING_IMPACT_ENUM, or null.
 */
function normalizeCriterionDStep1UnderstandingImpactKey(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  for (const x of CRITERION_D_STEP1_UNDERSTANDING_IMPACT_ENUM) {
    if (x.toLowerCase() === s) return x;
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function formatCriterionDStep1UnderstandingImpact(raw) {
  const k = normalizeCriterionDStep1UnderstandingImpactKey(raw);
  if (!k) return "—";
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/**
 * Criterion D Step 1 — Phase 1 mechanics-only mark (0–5).
 * @param {unknown} n
 * @returns {number | null}
 */
function normalizeCriterionDPhase1OnlyScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const r = Math.round(x);
  if (r < 0 || r > 5) return null;
  return r;
}

/**
 * Criterion D Step 1 — Phase 2 sentence-structure mark (0–5).
 * @param {unknown} n
 * @returns {number | null}
 */
function normalizeCriterionDPhase2OnlyScore(n) {
  return normalizeCriterionDPhase1OnlyScore(n);
}

/**
 * Criterion C — Step 1 of 5 (Agent 1: Logical Linker).
 * @param {string} sourceText
 * @param {string} studentParagraph
 */
