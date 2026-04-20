/** Criterion C — Step 1/3: Line of Reasoning Auditor — Phase 1 (logic chunks) + Phase 2 (thematic TS↔CS); single agent. */

const CRITERION_C_LORA_PHASE1_CHUNK_ROW_SCHEMA = {
  type: "object",
  properties: {
    chunkNumber: {
      type: "integer",
      description: "1-based chunk index in order through the paragraph block.",
      minimum: 1,
    },
    studentTextVerbatim: {
      type: "string",
      description:
        "NON-NEGOTIABLE: exact contiguous substring from the student paragraph for this chunk. May span multiple sentences when the same argument premise is sustained.",
    },
    corePremiseOrArgumentOneSentence: {
      type: "string",
      description:
        "One sentence summarizing the core premise or main argumentative move of this chunk (the verbatim span may be longer if it is still the same premise).",
    },
    soundOrNonSequitur: {
      type: "string",
      description: "Whether the step is logically sound vs non-sequitur (brief).",
    },
    pivotOrProgressionFromPrevious: {
      type: "string",
      description:
        "For chunk 1 say FIRST_CHUNK or equivalent. Otherwise: PIVOT (change of focus/topic) vs PROGRESSION (develops prior chunk)—brief explanation.",
    },
  },
  required: [
    "chunkNumber",
    "studentTextVerbatim",
    "corePremiseOrArgumentOneSentence",
    "soundOrNonSequitur",
    "pivotOrProgressionFromPrevious",
  ],
};

const CRITERION_C_LORA_PHASE2_BRIDGE_CHUNK_SCHEMA = {
  type: "object",
  properties: {
    studentTextVerbatim: {
      type: "string",
      description: "Exact student substring of a bridge section between topic and conclusion (if any).",
    },
    howItConnects: {
      type: "string",
      description: "How this bridge connects topic sentence to concluding sentence.",
    },
  },
  required: ["studentTextVerbatim", "howItConnects"],
};

const CRITERION_C_LORA_BLOCK_SCHEMA = {
  type: "object",
  properties: {
    paragraphIndex: { type: "integer", description: "0-based index of this paragraph block in the student paste." },
    phase1ChunkRows: {
      type: "array",
      description:
        "Phase 1 table rows: one row per chunk — a chunk is one stretch of text that advances the same premise (not necessarily one sentence long). Minimal chunks while preserving complexity.",
      items: CRITERION_C_LORA_PHASE1_CHUNK_ROW_SCHEMA,
    },
    phase1ClarityOfShifts: {
      type: "string",
      description: "Clarity of shift: does the student use transitions to make shifts between chunks clear?",
    },
    phase1PivotNote: {
      type: "string",
      description:
        "Pivot note: too many topic switches or pivots (especially substantial pivots) make the main line of argument hard to follow; cramming pivots in one paragraph can make it over-long and cover too much, obscuring the main argument. If so, Phase 1 band should be ** or * by severity.",
    },
    topicSentenceVerbatim: {
      type: "string",
      description: "First sentence of this block, exact (Phase 2).",
    },
    concludingSentenceVerbatim: {
      type: "string",
      description: "Final sentence(s) of this block only, exact contiguous substring (Phase 2).",
    },
    phase2BridgeChunks: {
      type: "array",
      description:
        "If there is a thematic shift, body chunks that bridge topic to conclusion; empty array if none or not applicable.",
      items: CRITERION_C_LORA_PHASE2_BRIDGE_CHUNK_SCHEMA,
    },
    thematicShiftClassification: {
      type: "string",
      description:
        "Exactly one (uppercase): ACCEPTABLE_EVOLUTION | NO_SHIFT_REPETITIVE | UNACCEPTABLE_WHIPLASH | ABSENT_OR_QUOTE_SHELL.",
    },
    acceptableShiftSubtype: {
      type: "string",
      description: "If ACCEPTABLE_EVOLUTION: CONCESSION | REFINEMENT | SUBVERSION; else empty string.",
    },
    unacceptableShiftSubtype: {
      type: "string",
      description:
        "If UNACCEPTABLE_WHIPLASH: CONTRADICTION | DRIFT | ASSUMPTION_LEAP | DANGLING_NODE; else empty string.",
    },
    topicConclusionMinorityQuoteNote: {
      type: "string",
      description: "Whether TS and CS are minority-quote vs quote-shell; quote-hiding → structural failure.",
    },
    phase1ScoreStars: {
      type: "string",
      description:
        "Phase 1 band: exactly one of *, **, ***. *** = line of reasoning can be summarized clearly/linearly; ** = somewhat summarizable but weaker; * = cannot be summarized clearly. Also weigh pivot/topic-switch load and scope.",
    },
    phase1ScoreReasoning: {
      type: "string",
      description:
        "4–5 sentences. Must include the pattern: A student earns [*, **, or ***] in Phase 1 because … (explain using the Phase 1 table and pivot note).",
    },
    phase2ScoreStars: {
      type: "string",
      description: "Phase 2 (thematic consistency) band: exactly one of *, **, ***.",
    },
    phase2ScoreReasoning: {
      type: "string",
      description:
        "4–5 sentences. Must include: A student earns [*, **, or ***] in Phase 2 because … (use TS, CS, bridge chunks, and categories).",
    },
  },
  required: [
    "paragraphIndex",
    "phase1ChunkRows",
    "phase1ClarityOfShifts",
    "phase1PivotNote",
    "topicSentenceVerbatim",
    "concludingSentenceVerbatim",
    "phase2BridgeChunks",
    "thematicShiftClassification",
    "acceptableShiftSubtype",
    "unacceptableShiftSubtype",
    "topicConclusionMinorityQuoteNote",
    "phase1ScoreStars",
    "phase1ScoreReasoning",
    "phase2ScoreStars",
    "phase2ScoreReasoning",
  ],
};

/** Step 1 only — no finalIbMark (that is step 3). */
const CRITERION_C_LORA_SCHEMA = {
  type: "object",
  properties: {
    bodyParagraphs: {
      type: "array",
      description:
        "One entry per paragraph block. Single paste = one block; multiple blocks separated by blank lines = multiple items in order.",
      items: CRITERION_C_LORA_BLOCK_SCHEMA,
    },
  },
  required: ["bodyParagraphs"],
};

/** Criterion C — Step 2/3: Tangent and Repetition Detector — full chunk audit table (aligned to step 1). */

const CRITERION_C_TANGENT_CHUNK_AUDIT_ROW_SCHEMA = {
  type: "object",
  properties: {
    chunkNumber: {
      type: "integer",
      minimum: 1,
      description:
        "Chunk index matching Line of Reasoning Auditor phase1ChunkRows order (same chunking as step 1).",
    },
    studentTextVerbatim: {
      type: "string",
      description:
        "NON-NEGOTIABLE exact contiguous substring from the student paragraph for this chunk. Rows must cover all paragraph text except the topic sentence (see instructions).",
    },
    studentTalkingAbout: {
      type: "string",
      description: "What the student is talking about in this chunk (brief).",
    },
    connectsToArgumentOrBroaderTS: {
      type: "string",
      description:
        'Exactly "Yes" or "No". If "No", chunkAssessment MUST include TANGENT and connectionEvidenceOwnWords explains the failure (no student-voice bridge). If "Yes", connectionEvidenceOwnWords MUST quote verbatim student wording (majority student words) proving the link to the argument/TS — not authorial quote text alone.',
    },
    connectionEvidenceOwnWords: {
      type: "string",
      description:
        "If Connects… is Yes: verbatim student substring(s) proving the link (majority student wording). If No: explain why no defensible connection exists (still required).",
    },
    purposeItServes: {
      type: "string",
      description: "What argumentative purpose this chunk serves in the paragraph.",
    },
    driftOrIrrelevantStudentVerbatim: {
      type: "string",
      description:
        "Verbatim student text that constitutes evidence or prose failing to connect to this chunk’s argumentative purpose: quote the substring(s) that show tangents, trivial filler/throat-clearing, padding without argumentative payoff, or egregious digressions (e.g. unrelated historical context, definitions, biographical trivia, loose opinion with no tie to the topic sentence) — same categories as strict TANGENT in the instructions. Use \"\" only when the whole chunk is on-purpose with no separable offending span.",
    },
    chunkAssessment: {
      type: "array",
      minItems: 1,
      description:
        "One column only: all flags that apply to this chunk (order free). PASS = on-task, valid connection and purpose (use alone as [\"PASS\"] when nothing else applies). REPETITION = the chunk’s main argumentative premise largely repeats earlier chunk(s) without adding new substance to the line of argument (not merely shared vocabulary). TANGENT = fails TS/argument connection or off-purpose material per instructions. MILD_TANGENT = weak/fuzzy bridge but not a full fail. REPETITION and TANGENT may both be true (e.g. repeats prior premise while also drifting). If connectsToArgumentOrBroaderTS is No, MUST include TANGENT. Do not include PASS together with TANGENT, REPETITION, or MILD_TANGENT.",
      items: {
        type: "string",
        enum: ["PASS", "REPETITION", "TANGENT", "MILD_TANGENT"],
      },
    },
  },
  required: [
    "chunkNumber",
    "studentTextVerbatim",
    "studentTalkingAbout",
    "connectsToArgumentOrBroaderTS",
    "connectionEvidenceOwnWords",
    "purposeItServes",
    "driftOrIrrelevantStudentVerbatim",
    "chunkAssessment",
  ],
};

const CRITERION_C_TANGENT_BLOCK_SCHEMA = {
  type: "object",
  properties: {
    paragraphIndex: { type: "integer", description: "0-based; must match Line of Reasoning Auditor block order." },
    auditSummary: {
      type: "string",
      description:
        "Harsh assessment of the argument's efficiency and Criterion C (organization / development) compliance. Call out egregious tangents (historical context, definitions, biographical trivia, unrelated opinion) when present — treat them as more serious than minor fuzzy bridges.",
    },
    chunkAuditRows: {
      type: "array",
      description:
        "One row per body chunk aligned to step 1 chunking: together must cover all student text in the paragraph except the topic sentence. Same chunk numbers/boundaries as phase1ChunkRows where possible; omit topic-sentence-only span from coverage.",
      items: CRITERION_C_TANGENT_CHUNK_AUDIT_ROW_SCHEMA,
    },
    tangentRepetitionScoreStars: {
      type: "string",
      description:
        "Overall tangent/repetition band from the chunk audit table: exactly one of *, **, *** (three asterisks = highest). Must align with chunkAssessment patterns in chunkAuditRows (PASS vs REPETITION/TANGENT/MILD_TANGENT, including rows with multiple flags).",
    },
    tangentRepetitionScoreReasoning: {
      type: "string",
      description:
        "4–5 sentences. Ground the star band explicitly in the chunk audit table (chunkAssessment tallies — rows may list REPETITION and TANGENT together, egregious tangent types, coverage). Pattern: A student earns [*, **, or ***] because …",
    },
  },
  required: [
    "paragraphIndex",
    "auditSummary",
    "chunkAuditRows",
    "tangentRepetitionScoreStars",
    "tangentRepetitionScoreReasoning",
  ],
};

const CRITERION_C_TANGENT_REPETITION_SCHEMA = {
  type: "object",
  properties: {
    bodyParagraphs: {
      type: "array",
      description: "One Tangent/Repetition audit per Line of Reasoning Auditor paragraph block, same order and paragraphIndex.",
      items: CRITERION_C_TANGENT_BLOCK_SCHEMA,
    },
  },
  required: ["bodyParagraphs"],
};

/** Criterion C — Step 3/3: Strategic Evaluator (emphasis vs. contextualization). Final IB 0–5 is computed client-side. */

const CRITERION_C_STEP3_STRATEGIC_SCHEMA = {
  type: "object",
  properties: {
    glossCheckNotes: {
      type: "string",
      description:
        "Gloss check: identify menial or contextual parts (setting the scene, plot summary, etc.). The student should gloss these with brief, efficient summaries.",
    },
    depthCheckNotes: {
      type: "string",
      description:
        "Depth check: identify the core argument or analytical pivot. The student must deep-dive here with sufficient analytical weight.",
    },
    uniformityPenaltyNotes: {
      type: "string",
      description:
        "Uniformity penalty: flag LOW FOCUS if the student applies the same level of detail to setup/context as to the conclusion or analytical core; note thin spread of quote analysis.",
    },
    lowFocusFlag: {
      type: "boolean",
      description:
        "True if analysis is Low Focus: uniform detail across menial and core material, OR quotes analyzed so thinly that no line gets sufficient depth (pattern).",
    },
    strategicFocusScore: {
      type: "integer",
      description:
        "1–3 only. 3 = *** clear emphasis strategy; menial material brief, core analyzed deeply, proportional. 2 = ** weak strategy but menial detail not excessive; paragraph still broadly works. 1 = * excessive menial dwell OR thin spread so every quote lacks depth (pattern).",
      minimum: 1,
      maximum: 3,
    },
    strategicFocusJustification: {
      type: "string",
      description: "Brief justification tied to the *** / ** / * rubric for strategic focus.",
    },
  },
  required: [
    "glossCheckNotes",
    "depthCheckNotes",
    "uniformityPenaltyNotes",
    "lowFocusFlag",
    "strategicFocusScore",
    "strategicFocusJustification",
  ],
};

/** Criterion C — Essay holistic 1/3: thesis vs body paragraphs (whole essay, after per-body grading). */

const CRITERION_C_ESSAY_HOLISTIC_THESIS_TOPICS_ROW_SCHEMA = {
  type: "object",
  properties: {
    bodyParagraphIndex1Based: {
      type: "integer",
      minimum: 1,
      description: "Body paragraph number (1 = first body paragraph after introduction).",
    },
    thesisPromiseForThisParagraph: {
      type: "string",
      description: "What the thesis commits this paragraph to cover (reader contract).",
    },
    paragraphActuallyDiscusses: {
      type: "string",
      description:
        "Neutral summary of what this paragraph actually argues as a whole, read without letting the thesis bias you.",
    },
    lineOfReasoningComparison: {
      type: "string",
      description:
        "Compare promise vs delivery: key terms should recur or map clearly; note reordering, new topics, or drift.",
    },
  },
  required: [
    "bodyParagraphIndex1Based",
    "thesisPromiseForThisParagraph",
    "paragraphActuallyDiscusses",
    "lineOfReasoningComparison",
  ],
};

const CRITERION_C_ESSAY_HOLISTIC1_THESIS_TOPICS_SCHEMA = {
  type: "object",
  properties: {
    thesisVerbatim: {
      type: "string",
      description:
        "Verbatim thesis/controlling claim from the essay (usually intro). Empty string only if truly absent.",
    },
    thesisStatus: {
      type: "string",
      description:
        "OK_FUNCTIONAL = arguable interpretive claim the body can answer. Otherwise classify failure: ABSENT | PROMPT_REPETITION | DESCRIPTIVE_ONLY | OTHER_NONFUNCTIONAL.",
      enum: ["OK_FUNCTIONAL", "ABSENT", "PROMPT_REPETITION", "DESCRIPTIVE_ONLY", "OTHER_NONFUNCTIONAL"],
    },
    thesisStatusNote: {
      type: "string",
      description: "Brief: why OK or why non-functional (prompt echo, plot summary thesis, etc.).",
    },
    readerContractBullets: {
      type: "array",
      description:
        "Ordered list: for each body paragraph, what the thesis promises that paragraph must deliver (numbered strings, same order as body paras).",
      items: { type: "string" },
    },
    thesisTopicsConsistencyRating: {
      type: "string",
      description:
        "Exactly one of *, **, ***. *** = strong alignment (keywords map, order respected). ** = mild mismatch. * = derails, adds major new lines, reorder breaks contract, or thesis absent/non-functional (must be * if thesis not OK_FUNCTIONAL).",
      enum: ["*", "**", "***"],
    },
    thesisTopicsConsistencyJustification: {
      type: "string",
      description:
        "4–6 sentences. Name the comparison pattern; cite keyword overlap or mismatch; if thesis non-functional, say so and keep rating at *.",
    },
    thesisVsParagraphsTable: {
      type: "array",
      description: "One row per body paragraph: promise vs what the paragraph actually does.",
      items: CRITERION_C_ESSAY_HOLISTIC_THESIS_TOPICS_ROW_SCHEMA,
    },
  },
  required: [
    "thesisVerbatim",
    "thesisStatus",
    "thesisStatusNote",
    "readerContractBullets",
    "thesisTopicsConsistencyRating",
    "thesisTopicsConsistencyJustification",
    "thesisVsParagraphsTable",
  ],
};

/** Criterion C — Essay holistic 2/3: macro argumentative structure + paragraph shuffle test. */

const CRITERION_C_ESSAY_HOLISTIC2_PARAGRAPH_SWAPPING_SCHEMA = {
  type: "object",
  properties: {
    bodyParagraphOrderAndRoleSummary: {
      type: "string",
      description:
        "State the order of body paragraphs (1..N) and what each does in the essay’s argumentative flow (macro view only).",
    },
    argumentativeStructureType: {
      type: "string",
      description:
        "Best-fit macro pattern: CHRONOLOGICAL_LINEAR; THEMATIC_CONCEPTUAL; FEATURE_BASED_CHECKLIST; CUMULATIVE_LENS; COMPARATIVE (contrast A vs B sustained in every body paragraph — see holistic 2 prompt); HYBRID_OR_MIXED.",
      enum: [
        "CHRONOLOGICAL_LINEAR",
        "THEMATIC_CONCEPTUAL",
        "FEATURE_BASED_CHECKLIST",
        "CUMULATIVE_LENS",
        "COMPARATIVE",
        "HYBRID_OR_MIXED",
      ],
    },
    argumentativeStructureReasoning: {
      type: "string",
      description:
        "Substantial reasoning: why this structure label fits, citing how paragraphs divide labour (IB examiner macro view).",
    },
    macroStructurePhase1Rating: {
      type: "string",
      description:
        "Phase 1 — structure quality (exactly *, **, or ***): *** = strong cumulative / lens-style **or** well-executed COMPARATIVE (integrated A/B contrast every body para — holistic 2 prompt); ** = mediocre chronological/thematic, or cumulative attempted but poorly executed; * = feature-shopping / technique checklist dominant **or** NON-NEGOTIABLE comparative-thesis failure (thesis contrasts A vs B but body splits A and B without sustained integrated contrast — mandatory *).",
      enum: ["*", "**", "***"],
    },
    macroStructurePhase1Justification: {
      type: "string",
      description: "4–6 sentences grounding Phase 1 band in the structure rubric above.",
    },
    shuffleTestPhase2Rating: {
      type: "string",
      description:
        "Phase 2 — imaginary shuffle test (exactly *, **, or ***): *** only if shuffling destroys whole-essay argumentative logic (cumulative build, lens, interdependent claims across bodies)—not merely awkward which-paragraph-goes-first or topic-sentence ordering; that surface effect alone caps below ***. ** = minor connector strain or partial load-bearing order. * = paragraphs interchangeable, weak macro coherence.",
      enum: ["*", "**", "***"],
    },
    shuffleTestPhase2Justification: {
      type: "string",
      description:
        "4–6 sentences: what breaks (or not) if body order were randomized; if *** assigned, justify whole-essay logic collapse—not only topic-sentence-first or forced ordering effects.",
    },
  },
  required: [
    "bodyParagraphOrderAndRoleSummary",
    "argumentativeStructureType",
    "argumentativeStructureReasoning",
    "macroStructurePhase1Rating",
    "macroStructurePhase1Justification",
    "shuffleTestPhase2Rating",
    "shuffleTestPhase2Justification",
  ],
};

/** Criterion C — Essay holistic 3/3: intro & conclusion protocol — intro scored ONLY from intro paragraph; conclusion ONLY from conclusion paragraph. */

const CRITERION_C_ESSAY_HOLISTIC3_INTRO_CHECKLIST_ROW_SCHEMA = {
  type: "object",
  properties: {
    protocolKey: {
      type: "string",
      description: "Which intro protocol this row audits (fixed set; one row per key). Evidence and reasoning must be confined to the introduction paragraph only.",
      enum: [
        "AUTHOR_NAME",
        "EXCERPT_OR_PASSAGE",
        "GENRE",
        "MAIN_CONTENT_SUMMARY",
        "MESSAGE_OR_INTERPRETIVE_STAKES",
        "BROAD_TO_NARROW_TO_THESIS",
        "VALID_THESIS",
        "ACADEMIC_OPENING_REGISTER",
      ],
    },
    protocolLabel: {
      type: "string",
      description: "Short human-readable label echoing the protocol (for the checklist table).",
    },
    met: { type: "boolean" },
    verbatimEvidence: {
      type: "string",
      description:
        "NON-NEGOTIABLE: verbatim substring copied only from the introduction paragraph (not body or conclusion). Use \"\" only if intro absent or impossible.",
    },
    reasoning: {
      type: "string",
      description:
        "Why met or violated using only the introduction paragraph — do not cite or depend on body or conclusion text.",
    },
  },
  required: ["protocolKey", "protocolLabel", "met", "verbatimEvidence", "reasoning"],
};

const CRITERION_C_ESSAY_HOLISTIC3_CONCLUSION_CHECKLIST_ROW_SCHEMA = {
  type: "object",
  properties: {
    protocolKey: {
      type: "string",
      description: "Conclusion protocol; evidence and reasoning must be confined to the conclusion paragraph only.",
      enum: [
        "THESIS_RESTART_OR_REFINEMENT",
        "NO_NEW_SUBSTANTIVE_QUOTES_OVER_THREE_WORDS",
        "NO_NEW_TECHNIQUE_OR_THEME_INTRODUCTION",
        "BROADER_MESSAGE_OR_LENS_WITHOUT_INVALID_CONTEXT",
      ],
    },
    protocolLabel: { type: "string" },
    met: { type: "boolean" },
    verbatimEvidence: {
      type: "string",
      description:
        "NON-NEGOTIABLE: verbatim substring copied only from the conclusion paragraph (not intro or body). Use \"\" if conclusion absent.",
    },
    reasoning: {
      type: "string",
      description: "Why met or violated using only the conclusion paragraph — do not cite intro or body text.",
    },
  },
  required: ["protocolKey", "protocolLabel", "met", "verbatimEvidence", "reasoning"],
};

const CRITERION_C_ESSAY_HOLISTIC3_INTRO_CONCLUSION_SCHEMA = {
  type: "object",
  properties: {
    essayIncomplete: {
      type: "boolean",
      description:
        "Y/N: true if the student essay as a whole appears NOT finished (e.g. abrupt cutoff, missing ending, mid-sentence truncation, obvious incomplete draft). false if the essay appears submitted complete. Judge from the full essay for this flag only — does not replace intro/conclusion paragraph audits.",
    },
    essayIncompleteNote: {
      type: "string",
      description:
        "One or two sentences: why essayIncomplete is true or false (e.g. what signals completion vs truncation).",
    },
    essayIncompleteSeverity: {
      type: "string",
      description:
        "If essayIncomplete is true: a concise severity label for the incompleteness (e.g. minor / moderate / severe) plus a few words of justification. If essayIncomplete is false: use exactly the text 'n/a'.",
    },
    essayIncompleteRecommendedPenaltyIbMarks: {
      type: "number",
      description:
        "If essayIncomplete is true: recommended mark subtraction for incompleteness alone — 0 to 2 inclusive in steps of 0.5. 0 = none; 0.5 = borderline; 1–1.5 = less severe (e.g. milder mid-paragraph cutoff); 2 = severe — missing paragraph(s), severe mid-paragraph cutoff, length too short for the task, or severe unfinished-response violations. Never exceed 2. If essayIncomplete is false: must be exactly 0.",
      minimum: 0,
      maximum: 2,
    },
    introAbsent: {
      type: "boolean",
      description:
        "True if there is no identifiable introduction paragraph before the first body paragraph. Judgment uses only intro vs body boundaries.",
    },
    introRating: {
      type: "string",
      description:
        "Intro score for the introduction paragraph only: exactly *, **, or ***. If introAbsent, must be *. Otherwise start at *** and remove one * per major protocol violation (minimum *). Do not factor body or conclusion.",
      enum: ["*", "**", "***"],
    },
    introMajorViolations: {
      type: "array",
      description:
        "Major intro-paragraph violations that cost a star (empty if ***). Must not reference body or conclusion content.",
      items: { type: "string" },
    },
    introOverallJustification: {
      type: "string",
      description:
        "4–7 sentences: how introRating was derived — only from the introduction paragraph; do not justify using body or conclusion.",
    },
    introChecklistTable: {
      type: "array",
      description: "Exactly 8 rows for the introduction paragraph only; one per protocolKey in enum order.",
      minItems: 8,
      maxItems: 8,
      items: CRITERION_C_ESSAY_HOLISTIC3_INTRO_CHECKLIST_ROW_SCHEMA,
    },
    conclusionAbsent: {
      type: "boolean",
      description:
        "True if there is no identifiable conclusion paragraph after the last body paragraph. Judgment uses only conclusion vs body boundaries.",
    },
    conclusionRating: {
      type: "string",
      description:
        "Conclusion score for the conclusion paragraph only: exactly *, **, or ***. If conclusionAbsent, must be *. Else start *** and remove one * per major violation (minimum *). Do not factor intro or body.",
      enum: ["*", "**", "***"],
    },
    conclusionMajorViolations: {
      type: "array",
      description: "Major conclusion-paragraph violations; do not reference intro or body as proof.",
      items: { type: "string" },
    },
    conclusionOverallJustification: {
      type: "string",
      description:
        "4–7 sentences: how conclusionRating was derived — only from the conclusion paragraph; do not justify using intro or body.",
    },
    conclusionChecklistTable: {
      type: "array",
      description: "Exactly 4 rows for the conclusion paragraph only; one per conclusion protocolKey.",
      minItems: 4,
      maxItems: 4,
      items: CRITERION_C_ESSAY_HOLISTIC3_CONCLUSION_CHECKLIST_ROW_SCHEMA,
    },
  },
  required: [
    "essayIncomplete",
    "essayIncompleteNote",
    "essayIncompleteSeverity",
    "essayIncompleteRecommendedPenaltyIbMarks",
    "introAbsent",
    "introRating",
    "introMajorViolations",
    "introOverallJustification",
    "introChecklistTable",
    "conclusionAbsent",
    "conclusionRating",
    "conclusionMajorViolations",
    "conclusionOverallJustification",
    "conclusionChecklistTable",
  ],
};

/** Essay mode only — final whole-essay Criterion C mark from digest (no student text in digest). */
const CRITERION_C_ESSAY_FINAL_IB_EXAMINER_SCHEMA = {
  type: "object",
  properties: {
    score: {
      type: "number",
      description:
        "Single final Criterion C mark for the whole essay, 0–5 inclusive, in steps of 0.5 only. Use 0.5 only when judgment truly sits between two adjacent official descriptors.",
    },
    examinerReport: {
      type: "string",
      description:
        "Exactly 5 or 6 complete sentences, IB examiner voice, Criterion C only (focus, organization, coherence). Must explicitly state the assigned numeric score at least once. Ground the decision in the official rubric wording (quote or closely echo key phrases from the level you assign). Build from the digest evidence; no bullets.",
    },
  },
  required: ["score", "examinerReport"],
};
