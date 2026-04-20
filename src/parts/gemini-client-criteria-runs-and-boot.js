/** When true, Criterion A detail page is essay mode (multi-paragraph bundle). */
let criterionADetailEssayModeActive = false;
/** When true (essay mode only), user picked "Whole essay" — hide per-paragraph steps 3–4 (holistic map only). */
let criterionADetailEssayWholeEssayHolisticView = false;

/**
 * @param {boolean} isEssay Essay-mode detail page vs single-paragraph bundle.
 * @param {boolean} [wholeEssayHolisticView] If essay mode: true when "Whole essay" row is selected (hide steps 3–4).
 */
function setCriterionADetailEssayChrome(isEssay, wholeEssayHolisticView = false) {
  criterionADetailEssayModeActive = !!isEssay;
  criterionADetailEssayWholeEssayHolisticView = !!isEssay && !!wholeEssayHolisticView;
  const topicSec = document.getElementById("topicArgumentSection");
  const finalSec = document.getElementById("finalGradeSection");
  const reasoningNote = document.getElementById("criterionAParagraphAuditReasoningNote");
  const copyTopicBtn = document.getElementById("copyTopicAuditBtn");
  const hideTopicFinalAndReasoning = !!isEssay && !!wholeEssayHolisticView;
  if (hideTopicFinalAndReasoning) {
    if (topicSec) topicSec.hidden = true;
    if (finalSec) finalSec.hidden = true;
    if (reasoningNote) reasoningNote.hidden = true;
    if (copyTopicBtn) copyTopicBtn.hidden = true;
  } else {
    if (topicSec) topicSec.hidden = false;
    if (finalSec) finalSec.hidden = false;
    if (reasoningNote) reasoningNote.hidden = false;
    if (copyTopicBtn) copyTopicBtn.hidden = false;
  }
}

/**
 * Step 3/3 — holistic grade from separate model pass (digest only).
 * @param {object | null | undefined} step3Data
 */
function renderCriterionBHolisticPanel(step3Data) {
  const el = document.getElementById("criterionBSummaryOutput");
  const section = document.getElementById("criterionBSummarySection");
  if (!el) return;

  if (section && section.dataset) {
    if (step3Data && typeof step3Data === "object") {
      try {
        section.dataset.rawStep3Json = JSON.stringify(step3Data);
      } catch {
        delete section.dataset.rawStep3Json;
      }
    } else {
      delete section.dataset.rawStep3Json;
    }
  }

  if (!step3Data || typeof step3Data !== "object") {
    el.innerHTML = `<p class="final-grade__mean final-grade__mean--na">Step 3 holistic grade is missing. Run <strong>Criterion B</strong> again from the dashboard.</p>`;
    return;
  }

  const raw = normalizeCriterionBHolisticScore(step3Data.score);
  const disp =
    raw == null
      ? "—"
      : Number.isInteger(raw)
        ? String(raw)
        : raw.toFixed(1);
  const just =
    step3Data.justification != null
      ? escapeHtml(String(step3Data.justification))
      : step3Data.examinerSummary != null
        ? escapeHtml(String(step3Data.examinerSummary))
        : "—";

  const html = `
    <p class="final-grade__mean"><strong>Step 3 — digest holistic (per paragraph):</strong> ${escapeHtml(disp)} / 5</p>
    <p class="criterion-b-holistic__label">Examiner summary (target 3–4 sentences)</p>
    <p class="criterion-b-holistic__just">${just}</p>
    <p class="final-grade__note">Separate pass using the step-2 digest only (not the full passage). Half-points allowed between whole scores. The dashboard <strong>final</strong> mark uses the official-descriptor pass at the top when present.</p>
  `;
  el.innerHTML = window.DOMPurify.sanitize(html);
}

function updateCriterionBTileFromBundle(bundle) {
  const scoreLine = document.getElementById("criterionBTileScoreLine");
  const numEl = document.getElementById("criterionBTileScoreNum");
  const cap = document.getElementById("criterionBTileScoreCaption");
  const link = document.getElementById("criterionBTileDetailLink");
  if (!scoreLine || !numEl) return;

  let v = null;
  if (
    bundle.criterionBFinalExaminer != null &&
    bundle.criterionBFinalExaminer.score != null &&
    Number.isFinite(Number(bundle.criterionBFinalExaminer.score))
  ) {
    v = normalizeCriterionBHolisticScore(bundle.criterionBFinalExaminer.score);
  }
  if ((v == null || !Number.isFinite(v)) && bundle.finalCriterionBScore != null && Number.isFinite(bundle.finalCriterionBScore)) {
    v = normalizeCriterionBHolisticScore(bundle.finalCriterionBScore);
  }
  if ((v == null || !Number.isFinite(v)) && bundle.criterionBStep3Data) {
    v = normalizeCriterionBHolisticScore(bundle.criterionBStep3Data.score);
  }
  if ((v == null || !Number.isFinite(v)) && bundle.criterionBData) {
    v = computeCriterionBMeanScaledTo5(bundle.criterionBData);
  }
  if (v != null && Number.isFinite(v)) {
    const disp = Number.isInteger(v) ? String(v) : v.toFixed(1);
    numEl.textContent = disp;
    scoreLine.hidden = false;
    if (cap) {
      cap.hidden = false;
      cap.textContent = "Criterion B Moderated Mark";
    }
    if (link) link.hidden = false;
    fillCriterionTilePerParaScores("criterionBTilePerParaScores", null);
  } else {
    numEl.textContent = "";
    scoreLine.hidden = true;
    if (cap) {
      cap.hidden = true;
      cap.textContent = "Criterion B Moderated Mark";
    }
    if (link) link.hidden = true;
    fillCriterionTilePerParaScores("criterionBTilePerParaScores", null);
  }
}

function clearCriterionBTileDisplay() {
  updateCriterionBTileFromBundle({ finalCriterionBScore: null });
}

/**
 * @returns {Promise<{ benchmarkData: object, benchmarkRaw: string }>}
 */
async function runCriterionBBenchmarkStep(key, src) {
  setStatus("Criterion B step 1/3: Building benchmark from full source text…");
  setGradingStepLine("Criterion B — step 1: benchmark");
  const benchPrompt = buildCriterionBBenchmarkMessage(src);
  let benchmarkRaw;
  try {
    benchmarkRaw = await callGemini(key, benchPrompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_B_BENCHMARK_SCHEMA,
    });
  } catch (firstErr) {
    try {
      benchmarkRaw = await callGemini(key, benchPrompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }

  let benchmarkData;
  try {
    benchmarkData = parseModelJsonObject(benchmarkRaw);
  } catch {
    throw new Error("Criterion B step 1 did not return valid JSON. Try again.");
  }
  if (
    !benchmarkData ||
    typeof benchmarkData !== "object" ||
    !Array.isArray(benchmarkData.authorialChoicesBenchmark)
  ) {
    throw new Error("Invalid Criterion B benchmark structure returned.");
  }

  return { benchmarkData, benchmarkRaw };
}

/**
 * @returns {Promise<{ data: object, rawJson: string, step3Data: object, step3Raw: string }>}
 */
async function runCriterionBPipelineGradingFromBenchmark(key, src, para, benchmarkData) {
  setCriterionBLoading(true, "Criterion B step 2/3: Grading (authorial-choices benchmark only; full source)…");
  setGradingStepLine("Criterion B — step 2: paragraph grading");
  const gradePrompt = buildCriterionBGradingMessage(src, benchmarkData, para);
  let rawJson;
  try {
    rawJson = await callGemini(key, gradePrompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_B_RESPONSE_SCHEMA,
    });
  } catch (firstErr) {
    try {
      rawJson = await callGemini(key, gradePrompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }

  let data;
  try {
    data = parseModelJsonObject(rawJson);
  } catch {
    throw new Error("Criterion B step 2 did not return valid JSON. Try again.");
  }

  data = normalizeCriterionBStep2ResponseShape(data);

  if (!data || typeof data !== "object" || !Array.isArray(data.bodyParagraphs)) {
    throw new Error(
      "Invalid Criterion B structure returned (expected a JSON object with a bodyParagraphs array). If this persists, try another model or run again."
    );
  }

  if (data.examinerClosingComment != null) {
    try {
      delete data.examinerClosingComment;
    } catch {
      /* ignore */
    }
  }

  setCriterionBLoading(true, "Criterion B step 3/3: Holistic grade (digest + authorial benchmark)…");
  setGradingStepLine("Criterion B — step 3: holistic grade (digest)");
  const digest = buildCriterionBStep3AuditDigest(data);
  const step3Prompt = buildCriterionBStep3HolisticMessage(digest, benchmarkData);
  let step3Raw;
  try {
    step3Raw = await callGemini(key, step3Prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_B_STEP3_SCHEMA,
    });
  } catch (step3Err) {
    try {
      step3Raw = await callGemini(key, step3Prompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw step3Err instanceof Error ? step3Err : new Error(String(step3Err));
    }
  }

  let step3Data;
  try {
    step3Data = parseModelJsonObject(step3Raw);
  } catch {
    throw new Error("Criterion B step 3 did not return valid JSON. Try again.");
  }
  if (!step3Data || typeof step3Data !== "object" || step3Data.score == null) {
    throw new Error("Invalid Criterion B step 3 structure returned (missing holistic score). Try again.");
  }

  const sn = normalizeCriterionBHolisticScore(step3Data.score);
  if (sn == null) {
    throw new Error("Criterion B step 3 returned a non-numeric holistic score. Try again.");
  }
  step3Data = { ...step3Data, score: sn };

  return { data, rawJson, step3Data, step3Raw };
}

/**
 * Essay mode only: whole-essay holistic checks (benchmark shifts + genre-specific craft).
 * @returns {Promise<{ data: object, rawJson: string }>}
 */
async function runCriterionBEssayHolisticChecksFromBenchmark(key, sourceText, fullStudentEssay, benchmarkData) {
  setStatus("Criterion B (essay): full-response holistic checks (shifts + genre)…");
  setGradingStepLine("Criterion B — essay: whole-essay holistic");
  const msg = buildCriterionBEssayHolisticChecksMessage(sourceText, fullStudentEssay, benchmarkData);
  let rawJson;
  try {
    rawJson = await callGemini(key, msg, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_B_ESSAY_HOLISTIC_CHECKS_SCHEMA,
    });
  } catch (firstErr) {
    try {
      rawJson = await callGemini(key, msg, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }

  let data;
  try {
    data = parseModelJsonObject(rawJson);
  } catch {
    throw new Error("Criterion B essay holistic checks did not return valid JSON. Try again.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Invalid essay holistic checks structure returned.");
  }
  if (
    !normalizeCriterionBEssayHolisticTier(data.shiftsHolisticRating) ||
    !normalizeCriterionBEssayHolisticTier(data.genreHolisticRating)
  ) {
    throw new Error("Essay holistic checks must include shiftsHolisticRating and genreHolisticRating as ***, **, or *.");
  }
  if (!Array.isArray(data.shiftsPerBenchmarkRow)) {
    throw new Error("Essay holistic checks missing shiftsPerBenchmarkRow array.");
  }
  if (!Array.isArray(data.genreSpecificTechniquesFoundInEssay)) {
    throw new Error("Essay holistic checks missing genreSpecificTechniquesFoundInEssay array.");
  }
  if (!Array.isArray(data.nonGenreSpecificTechniquesFoundInEssay)) {
    throw new Error("Essay holistic checks missing nonGenreSpecificTechniquesFoundInEssay array.");
  }

  return { data, rawJson };
}

/**
 * Final Criterion B mark (0–5, 0.5 steps) mapped to official IB descriptors from digest.
 * @returns {Promise<{ data: { score: number, examinerReport: string }, rawJson: string }>}
 */
async function runCriterionBFinalExaminerStep(key, digestText, essayMode) {
  setGradingStepLine("Criterion B — final IB examiner mark (official rubric)");
  const prompt = buildCriterionBFinalExaminerMessage(digestText, !!essayMode);
  let rawJson;
  try {
    rawJson = await callGemini(key, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_B_FINAL_EXAMINER_SCHEMA,
    });
  } catch (firstErr) {
    try {
      rawJson = await callGemini(key, prompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }

  let data;
  try {
    data = parseModelJsonObject(rawJson);
  } catch {
    throw new Error("Criterion B final examiner assigner did not return valid JSON.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Criterion B final examiner assigner returned an invalid structure.");
  }
  const s = normalizeCriterionBHolisticScore(data.score);
  if (s == null) {
    throw new Error("Criterion B final examiner assigner returned a non-numeric score.");
  }
  data.score = s;
  if (data.examinerReport == null || !String(data.examinerReport).trim()) {
    throw new Error("Criterion B final examiner assigner returned an empty examiner report.");
  }
  data.examinerReport = String(data.examinerReport).trim();
  let serialized;
  try {
    serialized = JSON.stringify(data);
  } catch {
    serialized = rawJson;
  }
  return { data, rawJson: serialized };
}

/**
 * @returns {Promise<{ data: object, rawJson: string, benchmarkData: object, benchmarkRaw: string, step3Data: object, step3Raw: string }>}
 */
async function runCriterionBPipeline(key, src, para) {
  const { benchmarkData, benchmarkRaw } = await runCriterionBBenchmarkStep(key, src);
  const rest = await runCriterionBPipelineGradingFromBenchmark(key, src, para, benchmarkData);
  return { ...rest, benchmarkData, benchmarkRaw };
}

/** Dashboard reset mid-run would otherwise exit with no error and no saved score. */
function abortActiveCriterionBRunIfDashboardCleared(runGen) {
  if (runGen === dashboardClearGeneration) return false;
  setError(
    "Criterion B grading stopped because the workspace was cleared or reset while the run was still in progress. Run Criterion B again when you are ready."
  );
  return true;
}

async function runCriterionB() {
  setError("");
  saveKey();

  if (!apiKeyInput || !sourceText || !studentParagraph) return;

  const key = apiKeyInput.value.trim();
  if (!key) {
    setError("Add your Gemini API key above.");
    return;
  }

  const src = sourceText.value.trim();
  if (!src) {
    setError("Paste the source text.");
    return;
  }

  const fullText = studentParagraph.value.trim();
  if (!fullText) {
    setError("Paste your analysis paragraph.");
    return;
  }

  const bodies = getEssayBodyParagraphsForGrading();
  if (!bodies) {
    setError("Classify your analysis as a paragraph or essay first.");
    return;
  }

  const isEssay =
    paragraphClassificationRecord?.text === fullText &&
    paragraphClassificationRecord?.kind === "essay" &&
    !!paragraphClassificationRecord?.essayParts;

  setCriterionBLoading(true, "Criterion B step 1/3: Building benchmark…");
  hideCriterionBTooltip();

  const runGen = dashboardClearGeneration;
  let runFinishedWithScore = false;
  let deferCriterionBErrorToPreflight = false;
  try {
    if (!isEssay) {
      const result = await runCriterionBPipeline(key, src, fullText);
      if (abortActiveCriterionBRunIfDashboardCleared(runGen)) return;
      setCriterionBLoading(true, "Criterion B: final IB examiner mark (official rubric)…");
      const digestFinal = buildCriterionBFinalExaminerDigestSingle(result.data, result.step3Data);
      const finalEx = await runCriterionBFinalExaminerStep(key, digestFinal, false);
      if (abortActiveCriterionBRunIfDashboardCleared(runGen)) return;
      const finalCriterionBScore = normalizeCriterionBHolisticScore(finalEx.data.score);
      const bundle = {
        version: 1,
        sourceText: src,
        studentParagraph: fullText,
        criterionBData: result.data,
        criterionBRawJson: result.rawJson,
        criterionBBenchmarkData: result.benchmarkData,
        criterionBBenchmarkRawJson: result.benchmarkRaw,
        criterionBStep3Data: result.step3Data,
        criterionBStep3RawJson: result.step3Raw,
        criterionBFinalExaminer: finalEx.data,
        criterionBFinalExaminerRawJson: finalEx.rawJson,
        finalCriterionBScore,
      };
      if (!saveCriterionBBundle(bundle)) {
        setError(
          "Criterion B completed, but results could not be saved in this browser (storage full or blocked). The tile shows your mark for this session—copy what you need before closing the tab."
        );
      }
      updateCriterionBTileFromBundle(bundle);
      refreshIbOverallPanel();
      runFinishedWithScore = true;
      return;
    }

    const { essayIntro, essayConclusion, essayBodyParagraphs } = getEssayMetaFromClassificationRecord();
    setCriterionBLoading(true, "Criterion B: building shared benchmark (step 1/3)…");
    setGradingStepLine("Criterion B — shared benchmark (essay)");
    const { benchmarkData, benchmarkRaw } = await runCriterionBBenchmarkStep(key, src);
    const per = [];
    for (let i = 0; i < bodies.length; i++) {
      setCriterionBLoading(
        true,
        `Criterion B: body ${i + 1}/${bodies.length} — Step 2 details (technique + checkpoints)…`
      );
      setGradingStepLine(`Criterion B — body ${i + 1}/${bodies.length}: step 2 details, then step 3 holistic`);
      const result = await runCriterionBPipelineGradingFromBenchmark(key, src, bodies[i], benchmarkData);
      if (abortActiveCriterionBRunIfDashboardCleared(runGen)) return;
      const finalCriterionBScore = normalizeCriterionBHolisticScore(result.step3Data.score);
      const inner = {
        version: 1,
        sourceText: src,
        studentParagraph: bodies[i],
        criterionBData: result.data,
        criterionBRawJson: result.rawJson,
        criterionBBenchmarkData: benchmarkData,
        criterionBBenchmarkRawJson: benchmarkRaw,
        criterionBStep3Data: result.step3Data,
        criterionBStep3RawJson: result.step3Raw,
        finalCriterionBScore,
      };
      per.push(inner);
    }
    setCriterionBLoading(true, "Criterion B (essay): full-response holistic checks…");
    setGradingStepLine("Criterion B — essay: shifts & genre (whole essay)");
    const essayHolistic = await runCriterionBEssayHolisticChecksFromBenchmark(key, src, fullText, benchmarkData);
    if (abortActiveCriterionBRunIfDashboardCleared(runGen)) return;
    setCriterionBLoading(true, "Criterion B (essay): final IB examiner mark (official rubric)…");
    const digestFinal = buildCriterionBFinalExaminerDigestEssay({
      essayParagraphBundles: per,
      essayHolisticChecks: essayHolistic.data,
    });
    const finalEx = await runCriterionBFinalExaminerStep(key, digestFinal, true);
    if (abortActiveCriterionBRunIfDashboardCleared(runGen)) return;
    const finalCriterionBScoreAgg = normalizeCriterionBHolisticScore(finalEx.data.score);
    const bundle = {
      version: 2,
      essayMode: true,
      sourceText: src,
      studentParagraph: fullText,
      essayIntro,
      essayConclusion,
      essayBodyParagraphs,
      criterionBBenchmarkData: benchmarkData,
      criterionBBenchmarkRawJson: benchmarkRaw,
      criterionBEssayParagraphBundles: per,
      criterionBEssayHolisticChecks: essayHolistic.data,
      criterionBEssayHolisticChecksRawJson: essayHolistic.rawJson,
      criterionBFinalExaminer: finalEx.data,
      criterionBFinalExaminerRawJson: finalEx.rawJson,
      finalCriterionBScore: finalCriterionBScoreAgg,
    };
    if (!saveCriterionBBundle(bundle)) {
      setError(
        "Criterion B completed, but results could not be saved in this browser (storage full or blocked). The tile shows your mark for this session—copy what you need before closing the tab."
      );
    }
    updateCriterionBTileFromBundle(bundle);
    refreshIbOverallPanel();
    runFinishedWithScore = true;
  } catch (e) {
    if (runGen !== dashboardClearGeneration) {
      setError(
        "Criterion B stopped because the dashboard state changed during the run (for example clear/reset). Run Criterion B again."
      );
    } else if (typeof shouldDeferGradingErrorToPreflight === "function" && shouldDeferGradingErrorToPreflight()) {
      deferCriterionBErrorToPreflight = true;
      throw e instanceof Error ? e : new Error(String(e));
    } else {
      setError(e instanceof Error ? e.message : String(e));
    }
  } finally {
    setCriterionBLoading(false, "");
    setStatus("");
    const errorText = errorBox?.textContent?.trim() ?? "";
    const hasVisibleError = !errorBox?.hidden && errorText.length > 0;
    if (!runFinishedWithScore && !hasVisibleError && !deferCriterionBErrorToPreflight) {
      setError(
        "Criterion B stopped unexpectedly before producing a final score. Please run it again. If this repeats, open browser console and share the latest error line."
      );
    }
  }
}

function buildCriterionGradeStrip(stepLabel, gradeObj) {
  if (!gradeObj || gradeObj.score === undefined || gradeObj.score === null) {
    return "";
  }
  return `<div class="criterion-a-strip">
    <p class="criterion-a-strip__label">${escapeHtml(stepLabel)}</p>
    <p class="criterion-a-strip__score"><strong>Criterion A:</strong> ${escapeHtml(String(gradeObj.score))} / 5</p>
    <p class="criterion-a-strip__just">${escapeHtml(gradeObj.justification || "—")}</p>
  </div>`;
}

function buildCriterionAStep2SetSummariesTable(data) {
  const rows = Array.isArray(data?.criterionA_step2SetSummaries) ? data.criterionA_step2SetSummaries : [];
  if (!rows.length) return "";
  const body = rows
    .map((r) => {
      const coef = r.criterionAHolisticCoefficient != null ? String(r.criterionAHolisticCoefficient) : "—";
      const h = r.applicationHolistic != null ? String(r.applicationHolistic) : "—";
      const band = r.band != null ? String(r.band) : "—";
      const scoreLine = `I${r.insight ?? "—"} · P${r.precision ?? "—"} · E${r.evidenceQuality ?? "—"} · R${r.reasoning ?? "—"} · coef ${coef} → ${h} (${band})`;
      return `<tr>
        <td>${escapeHtml(String(r.setIndex ?? "—"))}</td>
        <td><code class="criterion-a-setscores">${escapeHtml(scoreLine)}</code></td>
        <td>${escapeHtml(r.briefComment || "—")}</td>
      </tr>`;
    })
    .join("");
  return `<div class="criterion-a-step2b-block">
    <h3 class="criterion-a-step2b-block__title">Step 2 — verified overall grade (separate pass)</h3>
    <p class="criterion-a-step2b-block__lede">Per-set numbers below are from the paragraph audit; brief comments were added in a follow-up pass that only sees this digest plus the source and full paragraph (reduces invented overall marks).</p>
    <table class="drift-table criterion-a-step2b-table">
      <thead>
        <tr><th scope="col">Set</th><th scope="col">Scores (audit)</th><th scope="col">Brief comment</th></tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderAuditOutput(fullParagraph, rawJson, data) {
  if (!outputEl || !outputSection) return;
  const strip = buildCriterionGradeStrip(
    "Step 2 of 4 — Paragraph audit (Criterion A)",
    data.criterionA_grade_step2
  );
  const summaries = buildCriterionAStep2SetSummariesTable(data);
  const html = strip + summaries + buildHighlightedHtml(fullParagraph, data);
  outputEl.innerHTML = window.DOMPurify.sanitize(html, {
    ADD_ATTR: ["tabindex", "role", "aria-label", "data-set-index", "title"],
  });
  bindHighlightInteractions(outputEl, data);
  if (outputSection.dataset) outputSection.dataset.rawMarkdown = rawJson;
}

/**
 * @param {object} topicData
 * @param {string} rawJson
 */
function renderTopicArgumentOutput(topicData, rawJson) {
  if (!topicAuditOutput || !topicArgumentSection) return;

  const c1 = topicData.check1_topicSentenceSophistication || {};
  const drift = Array.isArray(topicData.check2_thematicDrift)
    ? topicData.check2_thematicDrift
    : [];

  const rows = drift
    .sort((a, b) => (a.analyticalSetIndex ?? 0) - (b.analyticalSetIndex ?? 0))
    .map((row) => {
      const rel = Number(row.relevance) === 1 ? 1 : 0;
      const badgeClass = rel === 1 ? "badge-rel badge-rel--1" : "badge-rel badge-rel--0";
      const badgeText = rel === 1 ? "1 — Relevant" : "0 — Drift / not aligned";
      return `<tr>
        <td>${escapeHtml(String(row.analyticalSetIndex ?? "—"))}</td>
        <td><span class="${badgeClass}">${badgeText}</span></td>
        <td>${escapeHtml(row.justification || "—")}</td>
      </tr>`;
    })
    .join("");

  const g3strip = buildCriterionGradeStrip(
    "Step 3 of 4 — Topic / argument alignment (Criterion A)",
    topicData.criterionA_grade_step3
  );

  const html = `
    ${g3strip}
    <div class="topic-check-block">
      <h3>Check 1 — Topic sentence sophistication</h3>
      <p><strong>Score:</strong> ${escapeHtml(String(c1.score ?? "—"))} / 4</p>
      <p>${escapeHtml(c1.justification || "—")}</p>
    </div>
    <div class="topic-check-block">
      <h3>Check 2 — Thematic drift (each analytical set vs topic sentence)</h3>
      <table class="drift-table">
        <thead>
          <tr><th>Set</th><th>Relevance</th><th>Justification</th></tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="3">—</td></tr>`}</tbody>
      </table>
    </div>
  `;

  topicAuditOutput.innerHTML = window.DOMPurify.sanitize(html);
  if (topicArgumentSection.dataset) topicArgumentSection.dataset.rawTopicJson = rawJson;
}

/**
 * Step 4 of 4: final Criterion A = mean of step 2 and step 3 grades (client-side).
 * @param {object} auditData
 * @param {object} topicData
 */
function renderFinalCriterionGrade(auditData, topicData) {
  if (!finalGradeOutput) return;

  const g2 = auditData && auditData.criterionA_grade_step2;
  const g3 = topicData && topicData.criterionA_grade_step3;
  const n2 = Number(g2 && g2.score);
  const n3 = Number(g3 && g3.score);
  const step2NewScale = auditData && auditData.criterionAHolisticFormulaVersion === 1;
  const ok2 = Number.isFinite(n2) && n2 >= 0 && n2 <= 5;
  const ok3 = Number.isFinite(n3) && n3 >= 0 && n3 <= 5;

  let avgHtml = "";
  if (ok2 && ok3) {
    const avg = (n2 + n3) / 2;
    const avgNorm = normalizeCriterionAWholeEssayHolisticScore(avg);
    const avgDisp =
      avgNorm != null
        ? Number.isInteger(avgNorm)
          ? String(avgNorm)
          : avgNorm.toFixed(1)
        : Number.isInteger(avg)
          ? String(avg)
          : avg.toFixed(1);
    avgHtml = `<p class="final-grade__mean"><strong>Final Criterion A (mean of steps 2 &amp; 3):</strong> ${escapeHtml(avgDisp)} / 5</p>`;
  } else {
    avgHtml = `<p class="final-grade__mean final-grade__mean--na">Final Criterion A could not be computed (missing step grades).</p>`;
  }

  const html = `
    <div class="final-grade__grid">
      <div class="final-grade__card">
        <p class="final-grade__step">Step 2 of 4</p>
        <p class="final-grade__num">${ok2 ? escapeHtml(String(n2)) : "—"} <span class="final-grade__denom">/ 5</span></p>
        <p class="final-grade__sub">Paragraph audit</p>
        <p class="final-grade__mini">${ok2 ? escapeHtml(g2.justification || "—") : "—"}</p>
      </div>
      <div class="final-grade__card">
        <p class="final-grade__step">Step 3 of 4</p>
        <p class="final-grade__num">${ok3 ? escapeHtml(String(n3)) : "—"} <span class="final-grade__denom">/ 5</span></p>
        <p class="final-grade__sub">Topic / argument audit</p>
        <p class="final-grade__mini">${ok3 ? escapeHtml(g3.justification || "—") : "—"}</p>
      </div>
    </div>
    ${avgHtml}
    <p class="final-grade__note">${
      step2NewScale
        ? "Step 2 allows <strong>0–5</strong> with <strong>4.5</strong> as the only half mark; step 3 is <strong>0–5</strong> integers. The final value is the arithmetic mean of the two."
        : "The final score is the arithmetic mean of the two Criterion A ratings (steps 2 and 3) on the historical 0–5 step-2 scale."
    }</p>
  `;

  finalGradeOutput.innerHTML = window.DOMPurify.sanitize(html, {
    ADD_ATTR: ["class", "scope", "colspan", "aria-label"],
  });
  if (finalGradeSection) finalGradeSection.hidden = false;
}

/**
 * @param {unknown} n
 * @returns {number | null}
 */
function normalizeCriterionAWholeEssayHolisticScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(Math.min(5, Math.max(0, x)) * 2) / 2;
}

/**
 * HTML: official Criterion A (Knowledge and understanding) rubric as a compact table, 5 down to 0 in 0.5 steps.
 * @param {number | null | undefined} highlightScore Normalized 0–5 in steps of 0.5; matching row gets highlight class.
 * @returns {string}
 */
function buildCriterionAKnowledgeRubricTableHtml(highlightScore) {
  const hi =
    highlightScore == null || !Number.isFinite(Number(highlightScore))
      ? null
      : normalizeCriterionAWholeEssayHolisticScore(highlightScore);
  const rows = [];
  for (let eighth = 10; eighth >= 0; eighth--) {
    const rowScore = eighth / 2;
    const disp = Number.isInteger(rowScore) ? String(rowScore) : rowScore.toFixed(1);
    const isInt = Number.isInteger(rowScore);
    const lev = Math.floor(rowScore);
    const upper = Math.ceil(rowScore);
    const desc = isInt
      ? CRITERION_A_KNOWLEDGE_RUBRIC_INTEGER_DESCRIPTORS[rowScore]
      : `Between the official level ${lev} and level ${upper} descriptors`;
    const active = hi != null && Math.abs(rowScore - hi) < 1e-6;
    const rowClass = `criterion-a-ib-rubric-row${active ? " criterion-a-ib-rubric-row--active" : ""}${isInt ? " criterion-a-ib-rubric-row--integer" : " criterion-a-ib-rubric-row--half"}`;
    rows.push(
      `<tr class="${rowClass}"><td class="criterion-a-ib-rubric__mark">${escapeHtml(disp)}</td><td class="criterion-a-ib-rubric__desc">${escapeHtml(desc)}</td></tr>`
    );
  }
  return `<section class="criterion-a-ib-rubric" aria-label="Criterion A Knowledge and understanding rubric">
    <header class="criterion-a-ib-rubric__head">
      <h3 class="criterion-a-ib-rubric__title">${escapeHtml(CRITERION_A_KNOWLEDGE_RUBRIC_OFFICIAL_HEADING)}</h3>
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

/**
 * HTML: official Criterion B (Analysis and interpretation) rubric as a compact table, 5 down to 0 in 0.5 steps — same structure/classes as {@link buildCriterionAKnowledgeRubricTableHtml}.
 * @param {number | null | undefined} highlightScore Normalized 0–5 in steps of 0.5; matching row gets highlight class.
 * @returns {string}
 */
function buildCriterionBAnalysisRubricTableHtml(highlightScore) {
  const hi =
    highlightScore == null || !Number.isFinite(Number(highlightScore))
      ? null
      : normalizeCriterionBHolisticScore(highlightScore);
  const rows = [];
  for (let eighth = 10; eighth >= 0; eighth--) {
    const rowScore = eighth / 2;
    const disp = Number.isInteger(rowScore) ? String(rowScore) : rowScore.toFixed(1);
    const isInt = Number.isInteger(rowScore);
    const lev = Math.floor(rowScore);
    const upper = Math.ceil(rowScore);
    const desc = isInt
      ? CRITERION_B_OFFICIAL_DESCRIPTOR_BY_LEVEL[rowScore]
      : `Between the official level ${lev} and level ${upper} descriptors`;
    const active = hi != null && Math.abs(rowScore - hi) < 1e-6;
    const rowClass = `criterion-a-ib-rubric-row${active ? " criterion-a-ib-rubric-row--active" : ""}${isInt ? " criterion-a-ib-rubric-row--integer" : " criterion-a-ib-rubric-row--half"}`;
    rows.push(
      `<tr class="${rowClass}"><td class="criterion-a-ib-rubric__mark">${escapeHtml(disp)}</td><td class="criterion-a-ib-rubric__desc">${escapeHtml(desc)}</td></tr>`
    );
  }
  return `<section class="criterion-a-ib-rubric criterion-b-ib-rubric" aria-label="Criterion B Analysis and interpretation rubric">
    <header class="criterion-a-ib-rubric__head">
      <h3 class="criterion-a-ib-rubric__title">${escapeHtml(CRITERION_B_OFFICIAL_RUBRIC_TABLE_HEADING)}</h3>
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

/** Short title for the reference rubric table on the Criterion C detail page (parallel to A / B). */
const CRITERION_C_FOCUS_ORGANIZATION_RUBRIC_TABLE_HEADING =
  "Criterion C: Focus and Organization — official descriptors";

/**
 * HTML: official Criterion C (Focus and Organization) rubric as a compact table, 5 down to 0 in 0.5 steps — same structure/classes as {@link buildCriterionAKnowledgeRubricTableHtml}.
 * @param {number | null | undefined} highlightScore Normalized 0–5 in steps of 0.5; matching row gets highlight class.
 * @returns {string}
 */
function buildCriterionCFocusOrganizationRubricTableHtml(highlightScore) {
  const hi =
    highlightScore == null || !Number.isFinite(Number(highlightScore))
      ? null
      : normalizeFinalCriterionCMark(highlightScore);
  const rows = [];
  for (let eighth = 10; eighth >= 0; eighth--) {
    const rowScore = eighth / 2;
    const disp = Number.isInteger(rowScore) ? String(rowScore) : rowScore.toFixed(1);
    const isInt = Number.isInteger(rowScore);
    const lev = Math.floor(rowScore);
    const upper = Math.ceil(rowScore);
    const desc = isInt
      ? CRITERION_C_OFFICIAL_DESCRIPTOR_BY_LEVEL[rowScore]
      : `Between the official level ${lev} and level ${upper} descriptors`;
    const active = hi != null && Math.abs(rowScore - hi) < 1e-6;
    const rowClass = `criterion-a-ib-rubric-row${active ? " criterion-a-ib-rubric-row--active" : ""}${isInt ? " criterion-a-ib-rubric-row--integer" : " criterion-a-ib-rubric-row--half"}`;
    rows.push(
      `<tr class="${rowClass}"><td class="criterion-a-ib-rubric__mark">${escapeHtml(disp)}</td><td class="criterion-a-ib-rubric__desc">${escapeHtml(desc)}</td></tr>`
    );
  }
  return `<section class="criterion-a-ib-rubric criterion-c-ib-rubric" aria-label="Criterion C Focus and Organization rubric">
    <header class="criterion-a-ib-rubric__head">
      <h3 class="criterion-a-ib-rubric__title">${escapeHtml(CRITERION_C_FOCUS_ORGANIZATION_RUBRIC_TABLE_HEADING)}</h3>
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

/**
 * @param {object} data
 */
function normalizeCriterionAWholeEssayAuditDataInPlace(data) {
  if (!data || typeof data !== "object") return;
  const h = data.wholeEssayBenchmarkHolistic;
  if (h && typeof h === "object") {
    const s = normalizeCriterionAWholeEssayHolisticScore(h.score);
    if (s != null) h.score = s;
  }
}

/**
 * @param {object | null | undefined} hol
 */
function buildWholeEssayHolisticStrip(hol) {
  if (!hol || typeof hol !== "object") return "";
  const s = normalizeCriterionAWholeEssayHolisticScore(hol.score);
  if (s == null) return "";
  const disp = Number.isInteger(s) ? String(s) : s.toFixed(1);
  const just = hol.justification != null ? String(hol.justification) : "—";
  return `<div class="criterion-a-strip criterion-a-strip--whole-essay-holistic">
    <p class="criterion-a-strip__label">Whole-essay map — supplementary holistic (strict met rules)</p>
    <p class="criterion-a-strip__score"><strong>Score:</strong> ${escapeHtml(disp)} / 5</p>
    <p class="criterion-a-strip__just">${escapeHtml(just)}</p>
  </div>`;
}

/**
 * @param {object | null | undefined} data
 */
function criterionAWholeEssayAuditSummaryLine(data) {
  if (!data || typeof data !== "object") return "—";
  const hol = data.wholeEssayBenchmarkHolistic;
  let scorePrefix = "—";
  if (hol && hol.score != null) {
    const sc = normalizeCriterionAWholeEssayHolisticScore(hol.score);
    if (sc != null) scorePrefix = Number.isInteger(sc) ? String(sc) : sc.toFixed(1);
  }
  const l2 = Array.isArray(data.level2Rows) ? data.level2Rows : [];
  const l3 = Array.isArray(data.level3Rows) ? data.level3Rows : [];
  const m = Array.isArray(data.misconceptionRows) ? data.misconceptionRows : [];
  const met2 = l2.filter((r) => r && String(r.status).toLowerCase() === "met").length;
  const met3 = l3.filter((r) => r && String(r.status).toLowerCase() === "met").length;
  const bad = m.filter((r) => r && r.studentCommits === true).length;
  const c1v = data.holisticCheck1InterClaimCoherence?.verdict;
  const c2v = data.holisticCheck2SourceCoverage?.verdict;
  const c1s = c1v != null && String(c1v).trim() !== "" ? String(c1v).trim() : "—";
  const c2s = c2v != null && String(c2v).trim() !== "" ? String(c2v).trim() : "—";
  return `${scorePrefix} · L2 ${met2}/${l2.length} · L3 ${met3}/${l3.length} · misc ${bad}/${m.length} · claims ${c1s} · src ${c2s}`;
}

/**
 * @param {object[]} rows
 */
function buildCriterionAWholeEssayLevelTableBody(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return `<tr><td colspan="5">—</td></tr>`;
  }
  return list
    .map((r, i) => {
      const rawSt = String(r?.status || "").toLowerCase();
      const met = rawSt === "met";
      const stLabel = met ? "Met" : "Not met";
      const badgeClass = met ? "badge-rel badge-rel--1" : "badge-rel badge-rel--0";
      const bullet = (r?.benchmarkBulletVerbatim != null ? String(r.benchmarkBulletVerbatim) : "").trim() || "—";
      const keys = (r?.keyConceptsInOwnVoice != null ? String(r.keyConceptsInOwnVoice) : "").trim();
      const keysDisp = met && keys ? keys : "—";
      const sup = (r?.supportingStudentVerbatim != null ? String(r.supportingStudentVerbatim) : "").trim();
      const supDisp = met && sup ? sup : "—";
      return `<tr>
        <td>${escapeHtml(String(i + 1))}</td>
        <td>${escapeHtml(bullet)}</td>
        <td><span class="${badgeClass}">${escapeHtml(stLabel)}</span></td>
        <td class="criterion-a-whole-essay-concepts">${escapeHtml(keysDisp)}</td>
        <td><code class="criterion-a-whole-essay-quote">${escapeHtml(supDisp)}</code></td>
      </tr>`;
    })
    .join("");
}

/**
 * @param {object[]} rows
 */
/**
 * @param {object | null | undefined} c1
 */
function buildWholeEssayHolisticCheck1Html(c1) {
  if (!c1 || typeof c1 !== "object") {
    return `<p class="output-hint">Holistic check 1 (inter-claim) was not returned for this run.</p>`;
  }
  const v = String(c1.verdict ?? "—").trim() || "—";
  const claims = Array.isArray(c1.majorClaims) ? c1.majorClaims : [];
  const rows =
    claims.length > 0
      ? claims
          .map((c, i) => {
            const sum = (c?.claimSummary != null ? String(c.claimSummary) : "").trim() || "—";
            const loc = (c?.locationHint != null ? String(c.locationHint) : "").trim() || "—";
            return `<tr>
            <td>${escapeHtml(String(i + 1))}</td>
            <td>${escapeHtml(sum)}</td>
            <td>${escapeHtml(loc)}</td>
          </tr>`;
          })
          .join("")
      : `<tr><td colspan="3">—</td></tr>`;
  const just = c1.justification != null ? String(c1.justification) : "—";
  return `<div class="criterion-a-whole-essay-holistic-extra">
    <h4 class="criterion-a-whole-essay-block__sub">Holistic check 1 — Inter-claim coherence</h4>
    <p class="criterion-a-whole-essay-holistic-extra__verdict">
      <strong>Verdict:</strong> <code class="criterion-a-whole-essay-verdict">${escapeHtml(v)}</code>
      <span class="output-hint criterion-a-whole-essay-holistic-extra__legend">
        <strong>--</strong> prevalent contradictions between major claims ·
        <strong>-</strong> sometimes contradicts, not serious ·
        <strong>+</strong> none detected
      </span>
    </p>
    <table class="drift-table criterion-a-whole-essay-table">
      <thead>
        <tr><th scope="col">#</th><th scope="col">Major claim (summary)</th><th scope="col">Location in essay</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="criterion-a-strip__just">${escapeHtml(just)}</p>
  </div>`;
}

/**
 * @param {object | null | undefined} c2
 */
function buildWholeEssayHolisticCheck2Html(c2) {
  if (!c2 || typeof c2 !== "object") {
    return `<p class="output-hint">Holistic check 2 (source coverage) was not returned for this run.</p>`;
  }
  const v = String(c2.verdict ?? "—").trim() || "—";
  const parts = Array.isArray(c2.sourceMajorParts) ? c2.sourceMajorParts : [];
  const covLabel = (raw) => {
    const x = String(raw || "").toLowerCase();
    if (x === "detailed") return "Detailed";
    if (x === "brief") return "Brief only";
    if (x === "neglect") return "Neglect";
    return raw ? String(raw) : "—";
  };
  const rows =
    parts.length > 0
      ? parts
          .map((p, i) => {
            const title = (p?.partTitle != null ? String(p.partTitle) : "").trim() || "—";
            const srcS = (p?.sourceContentSummary != null ? String(p.sourceContentSummary) : "").trim() || "—";
            const cov = covLabel(p?.coverageLevel);
            const ej = (p?.essayCoverageJustification != null ? String(p.essayCoverageJustification) : "").trim() || "—";
            return `<tr>
            <td>${escapeHtml(String(i + 1))}</td>
            <td>${escapeHtml(title)}</td>
            <td>${escapeHtml(srcS)}</td>
            <td>${escapeHtml(cov)}</td>
            <td>${escapeHtml(ej)}</td>
          </tr>`;
          })
          .join("")
      : `<tr><td colspan="5">—</td></tr>`;
  const just = c2.justification != null ? String(c2.justification) : "—";
  return `<div class="criterion-a-whole-essay-holistic-extra">
    <h4 class="criterion-a-whole-essay-block__sub">Holistic check 2 — Source coverage (3–4 major parts)</h4>
    <p class="criterion-a-whole-essay-holistic-extra__verdict">
      <strong>Verdict:</strong> <code class="criterion-a-whole-essay-verdict">${escapeHtml(v)}</code>
      <span class="output-hint criterion-a-whole-essay-holistic-extra__legend">
        <strong>--</strong> serious imbalance (e.g. neglect across ~half+ of parts) ·
        <strong>-</strong> at least one part neglect ·
        <strong>+</strong> all covered but imbalanced / gloss ·
        <strong>++</strong> strong detailed coverage, balanced
      </span>
    </p>
    <table class="drift-table criterion-a-whole-essay-table">
      <thead>
        <tr>
          <th scope="col">Part</th>
          <th scope="col">Label</th>
          <th scope="col">Source slice (summary)</th>
          <th scope="col">Essay coverage</th>
          <th scope="col">Justification</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="criterion-a-strip__just">${escapeHtml(just)}</p>
  </div>`;
}

function buildCriterionAWholeEssayMisconceptionTableBody(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return `<tr><td colspan="4">—</td></tr>`;
  }
  return list
    .map((r, i) => {
      const hit = r && r.studentCommits === true;
      const stLabel = hit ? "Yes" : "No";
      const badgeClass = hit ? "badge-rel badge-rel--0" : "badge-rel badge-rel--1";
      const bullet =
        (r?.misconceptionBulletVerbatim != null ? String(r.misconceptionBulletVerbatim) : "").trim() || "—";
      const sup = (r?.supportingStudentVerbatim != null ? String(r.supportingStudentVerbatim) : "").trim();
      const supDisp = hit && sup ? sup : "—";
      return `<tr>
        <td>${escapeHtml(String(i + 1))}</td>
        <td>${escapeHtml(bullet)}</td>
        <td><span class="${badgeClass}">${escapeHtml(stLabel)}</span></td>
        <td><code class="criterion-a-whole-essay-quote">${escapeHtml(supDisp)}</code></td>
      </tr>`;
    })
    .join("");
}

/**
 * Essay detail: full-essay examiner pass (Level 2/3 bullets + misconceptions).
 * @param {object} parentBundle version 2 essay-mode Criterion A bundle
 */
function renderCriterionAWholeEssayAuditPanel(parentBundle) {
  hideTooltip();
  if (!outputEl || !outputSection) return;

  const wa = parentBundle && parentBundle.criterionAEssayWholeEssayAudit;
  if (!wa) {
    const html = `<div class="criterion-a-whole-essay-block">
      <h3 class="criterion-a-whole-essay-block__title">Whole essay — benchmark alignment</h3>
      <p class="output-hint">Re-run <strong>Criterion A</strong> from the dashboard to generate this check.</p>
    </div>`;
    outputEl.innerHTML = window.DOMPurify.sanitize(html);
    if (outputSection.dataset) delete outputSection.dataset.rawMarkdown;
    return;
  }

    if (wa.error) {
    const html = `<div class="criterion-a-whole-essay-block">
      <h3 class="criterion-a-whole-essay-block__title">Whole essay — benchmark alignment</h3>
      <p class="final-grade__mean final-grade__mean--na">${escapeHtml(String(wa.error))}</p>
    </div>`;
    outputEl.innerHTML = window.DOMPurify.sanitize(html);
    if (outputSection.dataset) outputSection.dataset.rawMarkdown = JSON.stringify(wa);
    return;
  }

  const d = wa.data;
  normalizeCriterionAWholeEssayAuditDataInPlace(d);
  const holStrip = buildWholeEssayHolisticStrip(d?.wholeEssayBenchmarkHolistic);
  const check1Html = buildWholeEssayHolisticCheck1Html(d?.holisticCheck1InterClaimCoherence);
  const check2Html = buildWholeEssayHolisticCheck2Html(d?.holisticCheck2SourceCoverage);
  const l2body = buildCriterionAWholeEssayLevelTableBody(d?.level2Rows);
  const l3body = buildCriterionAWholeEssayLevelTableBody(d?.level3Rows);
  const miscBody = buildCriterionAWholeEssayMisconceptionTableBody(d?.misconceptionRows);

  const html = `<div class="criterion-a-whole-essay-block">
    <h3 class="criterion-a-whole-essay-block__title">Whole essay — Level 2 &amp; 3 benchmark map</h3>
    ${holStrip}
    ${check1Html}
    ${check2Html}
    <p class="criterion-a-whole-essay-block__lede output-hint">
      Two Gemini passes: a strict benchmark met/not_met map (with its supplementary 0–5 holistic from those rows), then inter-claim coherence and source coverage. Supporting wording where the model marked a row as met.
    </p>
    <h4 class="criterion-a-whole-essay-block__sub">Level 2 — Competent / analytical perceptions (benchmark section 2)</h4>
    <table class="drift-table criterion-a-whole-essay-table">
      <thead>
        <tr><th scope="col">#</th><th scope="col">Benchmark bullet</th><th scope="col">Status</th><th scope="col">Core gist of bullet (≥2, own words, no quotes)</th><th scope="col">Verbatim student support</th></tr>
      </thead>
      <tbody>${l2body}</tbody>
    </table>
    <h4 class="criterion-a-whole-essay-block__sub">Level 3 — Perceptive &amp; nuanced insights (benchmark section 3)</h4>
    <table class="drift-table criterion-a-whole-essay-table">
      <thead>
        <tr><th scope="col">#</th><th scope="col">Benchmark bullet</th><th scope="col">Status</th><th scope="col">Core gist of bullet (≥2, own words, no quotes)</th><th scope="col">Verbatim student support</th></tr>
      </thead>
      <tbody>${l3body}</tbody>
    </table>
    <h4 class="criterion-a-whole-essay-block__sub">Misconceptions &amp; logic breakdowns (benchmark section 4)</h4>
    <table class="drift-table criterion-a-whole-essay-table">
      <thead>
        <tr><th scope="col">#</th><th scope="col">Misconception / failure mode</th><th scope="col">Student commits?</th><th scope="col">Verbatim student evidence</th></tr>
      </thead>
      <tbody>${miscBody}</tbody>
    </table>
  </div>`;

  outputEl.innerHTML = window.DOMPurify.sanitize(html);
  if (outputSection.dataset) {
    try {
      outputSection.dataset.rawMarkdown = d != null ? JSON.stringify(d) : wa.rawJson != null ? String(wa.rawJson) : "";
    } catch {
      outputSection.dataset.rawMarkdown = wa.rawJson != null ? String(wa.rawJson) : "";
    }
  }

}

/**
 * @param {string} key
 * @param {string} src
 * @param {string} fullEssay
 * @param {string} benchmarkText
 * @returns {Promise<{ data: object, rawJson: string }>}
 */
async function runCriterionAEssayWholeEssayAudit(key, src, fullEssay, benchmarkText) {
  setGradingStepLine("Criterion A — whole-essay benchmark map (met / not met, pass 1)");
  setDashboardLoading(true, "Criterion A: whole-essay benchmark map — pass 1 of 2…");
  const promptBench = buildCriterionAEssayWholeEssayAuditBenchmarkMessage(src, benchmarkText, fullEssay);
  let rawBench;
  try {
    rawBench = await callGemini(key, promptBench, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_A_ESSAY_WHOLE_ESSAY_AUDIT_BENCHMARK_SCHEMA,
    });
  } catch (firstErr) {
    try {
      rawBench = await callGemini(key, promptBench, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }

  let dataBench;
  try {
    let c = rawBench.trim();
    if (c.startsWith("```")) {
      c = c.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/u, "");
    }
    dataBench = JSON.parse(c);
  } catch {
    throw new Error("Whole-essay benchmark map (pass 1) did not return valid JSON. Try again.");
  }
  if (!dataBench || typeof dataBench !== "object") {
    throw new Error("Whole-essay benchmark map (pass 1) returned an invalid structure.");
  }

  setGradingStepLine("Criterion A — whole-essay holistics (checks 1–2, pass 2)");
  setDashboardLoading(true, "Criterion A: whole-essay holistics — pass 2 of 2…");
  const promptHol = buildCriterionAEssayWholeEssayAuditHolisticsMessage(src, fullEssay);
  let rawHol;
  try {
    rawHol = await callGemini(key, promptHol, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_A_ESSAY_WHOLE_ESSAY_AUDIT_HOLISTICS_SCHEMA,
    });
  } catch (firstErr2) {
    try {
      rawHol = await callGemini(key, promptHol, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr2 instanceof Error ? firstErr2 : new Error(String(firstErr2));
    }
  }

  let dataHol;
  try {
    let c = rawHol.trim();
    if (c.startsWith("```")) {
      c = c.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/u, "");
    }
    dataHol = JSON.parse(c);
  } catch {
    throw new Error("Whole-essay holistics (pass 2) did not return valid JSON. Try again.");
  }
  if (!dataHol || typeof dataHol !== "object") {
    throw new Error("Whole-essay holistics (pass 2) returned an invalid structure.");
  }

  const data = { ...dataBench, ...dataHol };
  normalizeCriterionAWholeEssayAuditDataInPlace(data);
  let serialized;
  try {
    serialized = JSON.stringify(data);
  } catch {
    serialized = rawBench;
  }
  return { data, rawJson: serialized };
}

function truncateForAssignerDigest(s, max) {
  const t = String(s ?? "").trim();
  if (!t) return "(none)";
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function summarizeDriftShort(topicData) {
  const rows = Array.isArray(topicData?.check2_thematicDrift) ? topicData.check2_thematicDrift : [];
  if (!rows.length) return "(no thematic drift rows)";
  const sorted = [...rows].sort((a, b) => (a.analyticalSetIndex ?? 0) - (b.analyticalSetIndex ?? 0));
  return sorted
    .map((r) => {
      const rel = Number(r.relevance) === 1 ? "relevant" : "drift";
      return `set ${r.analyticalSetIndex ?? "?"}: ${rel}`;
    })
    .join("; ");
}

/**
 * @param {object} bundle Essay-mode bundle: needs criterionAEssayParagraphBundles; optional whole-essay audit.
 */
function buildCriterionAEssayFinalAssignerDigest(bundle) {
  const lines = [];
  lines.push("## Weighting you must apply");
  lines.push("- Roughly **60%** on per-body-paragraph signals below.");
  lines.push("- Roughly **40%** on whole-essay holistic signals at the end.");
  lines.push("");

  const per = Array.isArray(bundle?.criterionAEssayParagraphBundles) ? bundle.criterionAEssayParagraphBundles : [];
  per.forEach((inner, idx) => {
    lines.push(`### Body paragraph ${idx + 1}`);
    const n12 = inner?.step2Score;
    const n3 = inner?.step3Score;
    const g2 = inner?.auditData?.criterionA_grade_step2;
    const g3 = inner?.topicData?.criterionA_grade_step3;
    lines.push(
      `- **Step 2 (paragraph audit) holistic:** ${g2?.score != null ? g2.score : n12 != null ? n12 : "—"} / 5 — ${truncateForAssignerDigest(g2?.justification, 8000)}`
    );
    lines.push(
      `- **Step 3 (topic / argument alignment) holistic:** ${g3?.score != null ? g3.score : n3 != null ? n3 : "—"} / 5 — ${truncateForAssignerDigest(g3?.justification, 8000)}`
    );
    const c1 = inner?.topicData?.check1_topicSentenceSophistication;
    if (c1 && typeof c1 === "object") {
      lines.push(
        `- **Check 1 — topic sentence sophistication:** ${c1.score != null ? c1.score : "—"} / 4 — ${truncateForAssignerDigest(c1.justification, 6000)}`
      );
    }
    lines.push(`- **Check 2 — thematic drift (sets vs topic sentence):** ${summarizeDriftShort(inner?.topicData)}`);
    const sums = Array.isArray(inner?.auditData?.criterionA_step2SetSummaries) ? inner.auditData.criterionA_step2SetSummaries : [];
    if (sums.length) {
      lines.push("- **Step 2 digest — brief comment per analytical set:**");
      sums.forEach((row, j) => {
        lines.push(`  - Set ${j}: ${truncateForAssignerDigest(row?.briefComment, 4000)}`);
      });
    }
    lines.push("");
  });

  lines.push("### Whole-essay holistic file (strict benchmark map + checks)");
  const wa = bundle?.criterionAEssayWholeEssayAudit;
  if (!wa || wa.error) {
    lines.push(
      `- **Whole-essay benchmark audit:** ${wa?.error ? `ERROR — ${truncateForAssignerDigest(wa.error, 4000)}` : "not available"}`
    );
    lines.push("");
  } else {
    const wd = wa.data;
    if (!wd || typeof wd !== "object") {
      lines.push("- **Whole-essay audit data:** missing");
      lines.push("");
    } else {
      const hol = wd.wholeEssayBenchmarkHolistic;
      const l2 = Array.isArray(wd.level2Rows) ? wd.level2Rows : [];
      const l3 = Array.isArray(wd.level3Rows) ? wd.level3Rows : [];
      const mr = Array.isArray(wd.misconceptionRows) ? wd.misconceptionRows : [];
      const met2 = l2.filter((r) => r && String(r.status).toLowerCase() === "met").length;
      const met3 = l3.filter((r) => r && String(r.status).toLowerCase() === "met").length;
      const misc = mr.filter((r) => r && r.studentCommits === true).length;
      lines.push(
        `- **Whole-essay supplementary holistic (0–5, strict benchmark map):** ${hol?.score != null ? hol.score : "—"} / 5 — ${truncateForAssignerDigest(hol?.justification, 8000)}`
      );
      lines.push(`- **Strict Level-2 benchmarks met:** ${met2} / ${l2.length}`);
      lines.push(`- **Strict Level-3 benchmarks met:** ${met3} / ${l3.length}`);
      lines.push(`- **Misconception rows committed:** ${misc} / ${mr.length}`);
      const h1 = wd.holisticCheck1InterClaimCoherence;
      const h2 = wd.holisticCheck2SourceCoverage;
      lines.push(`- **Inter-claim coherence verdict:** ${h1?.verdict != null ? String(h1.verdict) : "—"}`);
      lines.push(`- **Source coverage verdict (3–4 passage parts):** ${h2?.verdict != null ? String(h2.verdict) : "—"}`);
      lines.push(`- **Inter-claim note (truncated):** ${truncateForAssignerDigest(h1?.justification, 8000)}`);
      lines.push(`- **Source-coverage note (truncated):** ${truncateForAssignerDigest(h2?.justification, 8000)}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * @param {string} key
 * @param {object} bundle
 * @returns {Promise<{ data: { score: number, examinerReport: string }, rawJson: string }>}
 */
async function runCriterionAEssayFinalAssigner(key, bundle) {
  setGradingStepLine("Criterion A — final whole-essay examiner mark");
  const digest = buildCriterionAEssayFinalAssignerDigest(bundle);
  const prompt = buildCriterionAEssayFinalAssignerMessage(digest);
  let rawJson;
  try {
    rawJson = await callGemini(key, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_A_ESSAY_FINAL_ASSIGNER_SCHEMA,
    });
  } catch (firstErr) {
    try {
      rawJson = await callGemini(key, prompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }

  let data;
  try {
    let c = rawJson.trim();
    if (c.startsWith("```")) {
      c = c.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/u, "");
    }
    data = JSON.parse(c);
  } catch {
    throw new Error("Final Criterion A assigner did not return valid JSON.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Final Criterion A assigner returned an invalid structure.");
  }
  const s = normalizeCriterionAWholeEssayHolisticScore(data.score);
  if (s == null) {
    throw new Error("Final Criterion A assigner returned a non-numeric score.");
  }
  data.score = s;
  if (data.examinerReport == null || !String(data.examinerReport).trim()) {
    throw new Error("Final Criterion A assigner returned an empty examiner report.");
  }
  data.examinerReport = String(data.examinerReport).trim();
  let serialized;
  try {
    serialized = JSON.stringify(data);
  } catch {
    serialized = rawJson;
  }
  return { data, rawJson: serialized };
}

function syncCriterionAFinalEssayAssignerSection(bundle) {
  const sec = document.getElementById("criterionAFinalEssayAssignerSection");
  const body = document.getElementById("criterionAFinalEssayAssignerBody");
  const hint = document.getElementById("criterionAFinalEssayAssignerHint");
  if (!sec || !body) return;
  if (!bundle || bundle.version !== 2 || !bundle.essayMode) {
    sec.hidden = true;
    body.innerHTML = "";
    if (hint) {
      hint.hidden = true;
      hint.innerHTML = "";
    }
    return;
  }
  sec.hidden = false;
  const fa = bundle.criterionAFinalEssayAssigner;
  if (hint) {
    hint.hidden = false;
    hint.innerHTML = window.DOMPurify.sanitize(
      `<p class="output-hint">This is the same <strong>final Criterion A</strong> mark as on the dashboard.</p>`
    );
  }
  if (!fa || fa.error) {
    const err = fa?.error ? escapeHtml(String(fa.error)) : "Not produced. Run Criterion A again from the dashboard.";
    body.innerHTML = window.DOMPurify.sanitize(`<p class="final-grade__mean final-grade__mean--na">${err}</p>`);
    return;
  }
  const sc = normalizeCriterionAWholeEssayHolisticScore(fa.score);
  const disp = sc != null ? (Number.isInteger(sc) ? String(sc) : sc.toFixed(1)) : "—";
  const rep = fa.examinerReport != null ? String(fa.examinerReport) : "—";
  const strip = `<div class="criterion-a-strip criterion-a-strip--whole-essay-holistic">
    <p class="criterion-a-strip__label">Final Criterion A (whole essay — examiner synthesis)</p>
    <p class="criterion-a-strip__score"><strong>Score:</strong> ${escapeHtml(disp)} / 5</p>
    <p class="criterion-a-strip__just">${escapeHtml(rep)}</p>
  </div>`;
  const rubric = buildCriterionAKnowledgeRubricTableHtml(sc);
  body.innerHTML = window.DOMPurify.sanitize(strip + rubric, {
    ADD_ATTR: ["class", "scope", "colspan", "aria-label"],
  });
}

const GEMINI_GRADING_COOLDOWN_MS = 3000;

/** Reset when a grading progress session starts; incremented on each failed `callGemini` while grading. */
let gradingGeminiConsecutiveFailures = 0;
const MAX_GRADING_GEMINI_CONSECUTIVE_FAILURES = 12;

function resetGradingGeminiSessionCounters() {
  gradingGeminiConsecutiveFailures = 0;
}

/**
 * Abort long runs when the API keeps failing (e.g. quota, regional block). Retries inside a step count toward this limit.
 */
function bumpGradingGeminiFailureAndMaybeStop() {
  if (typeof isGradingProgressSessionActive !== "function" || !isGradingProgressSessionActive()) {
    return;
  }
  gradingGeminiConsecutiveFailures += 1;
  if (gradingGeminiConsecutiveFailures > MAX_GRADING_GEMINI_CONSECUTIVE_FAILURES) {
    throw new Error(
      `Grading stopped after ${MAX_GRADING_GEMINI_CONSECUTIVE_FAILURES} failed Gemini API attempts in a row. Check quota, billing, model access, and regional support, then try again.`
    );
  }
}

async function maybeCooldownAfterGradingGeminiCall() {
  if (typeof isGradingProgressSessionActive === "function" && isGradingProgressSessionActive()) {
    await new Promise((resolve) => setTimeout(resolve, GEMINI_GRADING_COOLDOWN_MS));
  }
}

/**
 * Build a single user-facing string from Gemini REST error JSON (always show in red error box).
 * @param {Response} res
 * @param {object} resData
 */
function formatGeminiHttpErrorMessage(res, resData) {
  const e = resData && resData.error;
  if (e && typeof e === "object" && e.message != null) {
    let s = String(e.message).trim();
    if (e.status && String(e.status) !== s) {
      s += ` [${String(e.status)}]`;
    }
    if (e.code != null && !s.includes(String(e.code))) {
      s += ` (code ${e.code})`;
    }
    return s;
  }
  return `Gemini API error (HTTP ${res.status}). Check your API key, billing, model name, and whether your region supports the Generative Language API.`;
}

/**
 * When candidates are missing or empty: finishReason, safety block, etc.
 * @param {object} resData
 */
function formatGeminiNoOutputMessage(resData) {
  const pf = resData?.promptFeedback;
  const blockReason = pf?.blockReason;
  if (blockReason) {
    return `Gemini blocked this request or output (${String(blockReason)}). Try shorter input, different wording, or another model.`;
  }
  const c0 = resData?.candidates?.[0];
  const fr = c0?.finishReason;
  if (fr) {
    return `No model text returned (finish: ${String(fr)}). Try again or shorten the input.`;
  }
  return "No text returned from the model (empty response).";
}

/**
 * Shows Gemini failures in the main dashboard error box when not in the grading overlay.
 * During grading, errors are thrown only; the overlay + preflight handler show the message after the run stops.
 */
function showGeminiErrorInRedBox(message) {
  const m = String(message || "").trim();
  if (!m) return;
  if (typeof isGradingProgressSessionActive === "function" && isGradingProgressSessionActive()) {
    return;
  }
  if (typeof setError === "function") {
    setError(m);
  }
}

async function callGemini(apiKey, promptText, options = {}) {
  if (typeof notifyGradingGeminiRequestSent === "function") {
    notifyGradingGeminiRequestSent();
  }
  const {
    maxOutputTokens = GEMINI_MAX_OUTPUT_TOKENS_JSON,
    responseSchema,
    responseMimeType,
    temperature = 1.0,
    /** Optional `generationConfig.thinkingConfig` object for models that support it. Omitted unless passed. */
    thinkingConfig: thinkingConfigOverride,
  } = options;
  const modelId = getSelectedGeminiModelId();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const generationConfig = {
    temperature,
    maxOutputTokens,
  };
  if (thinkingConfigOverride && typeof thinkingConfigOverride === "object") {
    generationConfig.thinkingConfig = thinkingConfigOverride;
  }
  if (responseMimeType) {
    generationConfig.responseMimeType = responseMimeType;
  }
  if (responseSchema) {
    generationConfig.responseSchema = responseSchema;
  }

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }],
      },
    ],
    generationConfig,
  };

  let res;
  let resData = {};
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    resData = await res.json().catch(() => ({}));
  } catch (netErr) {
    const msg =
      netErr instanceof Error
        ? `Could not reach Gemini API: ${netErr.message}`
        : `Could not reach Gemini API: ${String(netErr)}`;
    bumpGradingGeminiFailureAndMaybeStop();
    showGeminiErrorInRedBox(msg);
    throw new Error(msg);
  }

  if (!res.ok) {
    const msg = formatGeminiHttpErrorMessage(res, resData);
    await maybeCooldownAfterGradingGeminiCall();
    bumpGradingGeminiFailureAndMaybeStop();
    showGeminiErrorInRedBox(msg);
    throw new Error(msg);
  }

  const parts = resData?.candidates?.[0]?.content?.parts;
  if (!parts?.length) {
    const msg = formatGeminiNoOutputMessage(resData);
    await maybeCooldownAfterGradingGeminiCall();
    bumpGradingGeminiFailureAndMaybeStop();
    showGeminiErrorInRedBox(msg);
    throw new Error(msg);
  }

  const text = parts.map((p) => p.text || "").join("");
  if (typeof isGradingProgressSessionActive === "function" && isGradingProgressSessionActive()) {
    gradingGeminiConsecutiveFailures = 0;
  }
  await maybeCooldownAfterGradingGeminiCall();
  return text;
}

function buildSessionBundle(src, para, data, rawJson, topicData, topicRaw, step2OverallRawJson) {
  const g2 = data.criterionA_grade_step2;
  const g3 = topicData.criterionA_grade_step3;
  const n2 = Number(g2 && g2.score);
  const n3 = Number(g3 && g3.score);
  const step2NewScale = data.criterionAHolisticFormulaVersion === 1;
  const ok2 = Number.isFinite(n2) && n2 >= 0 && n2 <= 5;
  const ok3 = Number.isFinite(n3) && n3 >= 0 && n3 <= 5;
  let finalAverage = null;
  if (ok2 && ok3) {
    const avg = (n2 + n3) / 2;
    finalAverage = Number.isInteger(avg) ? avg : Math.round(avg * 10) / 10;
  }
  const out = {
    version: 1,
    sourceText: src,
    studentParagraph: para,
    auditRawJson: rawJson,
    auditData: data,
    topicRawJson: topicRaw,
    topicData,
    finalAverage,
    step2Score: ok2 ? n2 : null,
    step3Score: ok3 ? n3 : null,
  };
  if (step2OverallRawJson != null && String(step2OverallRawJson).trim() !== "") {
    out.criterionAStep2OverallRawJson = String(step2OverallRawJson);
  }
  return out;
}

async function fetchCriterionABenchmarkText(key, src) {
  setStatus("Step 1 of 4: Building benchmark (hidden)…");
  return await callGemini(key, buildBenchmarkMessage(src), { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON });
}

/**
 * @returns {Promise<{ data: object, rawJson: string, topicData: object, topicRaw: string }>}
 */
async function runCriterionAPipelineFromBenchmarkText(key, src, para, benchmarkText) {
  setStatus("Step 2 of 4: Auditing your paragraph (per-set scores)…");
  setGradingStepLine("Criterion A — step 2: paragraph audit (per-set scores)");
  const auditPrompt = buildAuditMessage(src, benchmarkText, para);
  let rawJson;
  try {
    rawJson = await callGemini(key, auditPrompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: AUDIT_RESPONSE_SCHEMA,
    });
  } catch (firstErr) {
    try {
      rawJson = await callGemini(key, auditPrompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }

  let data;
  try {
    let cleaned = rawJson.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/u, "");
    }
    data = JSON.parse(cleaned);
  } catch {
    throw new Error("Model did not return valid JSON. Try again.");
  }

  if (!data || typeof data !== "object") {
    throw new Error("Invalid audit structure returned.");
  }

  enrichCriterionAAuditDataWithHolisticScores(data, { normalizeStep2: false });
  data.criterionAHolisticFormulaVersion = 1;

  setStatus("Step 2 of 4: Verifying paragraph grade (digest-only pass)…");
  setGradingStepLine("Criterion A — step 2: holistic paragraph grade (digest pass)");
  const step2GradePrompt = buildCriterionAStep2OverallGradeMessage(src, para, data);
  let step2OverallRawJson;
  try {
    step2OverallRawJson = await callGemini(key, step2GradePrompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_A_STEP2_OVERALL_GRADE_SCHEMA,
    });
  } catch (gErr) {
    try {
      step2OverallRawJson = await callGemini(key, step2GradePrompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw gErr instanceof Error ? gErr : new Error(String(gErr));
    }
  }

  let step2Parsed;
  try {
    let gclean = step2OverallRawJson.trim();
    if (gclean.startsWith("```")) {
      gclean = gclean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/u, "");
    }
    step2Parsed = JSON.parse(gclean);
  } catch {
    throw new Error("Step 2 paragraph grade pass did not return valid JSON. Try again.");
  }
  mergeCriterionAStep2OverallGradeIntoAudit(data, step2Parsed);
  enrichCriterionAAuditDataWithHolisticScores(data, { normalizeStep2: true });

  setStatus("Step 3 of 4: Topic sentence / argument audit…");
  setGradingStepLine("Criterion A — step 3: topic / argument audit");
  const topicPrompt = buildTopicArgumentAuditMessage(src, para, data);
  let topicRaw;
  try {
    topicRaw = await callGemini(key, topicPrompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: TOPIC_ARGUMENT_AUDIT_SCHEMA,
    });
  } catch (topicErr) {
    try {
      topicRaw = await callGemini(key, topicPrompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw topicErr instanceof Error ? topicErr : new Error(String(topicErr));
    }
  }

  let topicData;
  try {
    let tc = topicRaw.trim();
    if (tc.startsWith("```")) {
      tc = tc.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/u, "");
    }
    topicData = JSON.parse(tc);
  } catch {
    throw new Error("Topic/argument audit did not return valid JSON. Try again.");
  }

  return { data, rawJson, topicData, topicRaw, step2OverallRawJson };
}

/**
 * @returns {Promise<{ data: object, rawJson: string, topicData: object, topicRaw: string }>}
 */
async function runCriterionAPipeline(key, src, para) {
  setGradingStepLine("Criterion A — step 1: benchmark (hidden)");
  const benchmarkText = await fetchCriterionABenchmarkText(key, src);
  return runCriterionAPipelineFromBenchmarkText(key, src, para, benchmarkText);
}

function formatDashboardScoreDisp(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function fillCriterionTilePerParaScores(ulId, scores) {
  const ul = document.getElementById(ulId);
  if (!ul) return;
  if (!scores || scores.length === 0) {
    ul.hidden = true;
    ul.replaceChildren();
    return;
  }
  ul.hidden = false;
  ul.replaceChildren();
  scores.forEach((s, i) => {
    const li = document.createElement("li");
    const lbl = document.createElement("span");
    lbl.className = "criterion-tile__per-para-label";
    lbl.textContent = `Body ${i + 1}`;
    const num = document.createElement("span");
    num.className = "criterion-tile__per-para-num";
    num.textContent = typeof s === "string" ? s : formatDashboardScoreDisp(s);
    li.appendChild(lbl);
    li.appendChild(document.createTextNode(" "));
    li.appendChild(num);
    ul.appendChild(li);
  });
}

/**
 * @param {HTMLElement | null} panel
 * @param {HTMLTableSectionElement | null} tbody
 * @param {object[]} innerList
 * @param {(inner: object, idx: number) => string} getScoreLabel
 * @param {(inner: object, idx: number) => void} onSelect
 * @param {{ getSummary: () => string, onPick: () => void } | null | undefined} [wholeEssayRow] Criterion A only: extra table row for full-essay benchmark map.
 */
function wireEssayDetailParagraphPicker(panel, tbody, innerList, getScoreLabel, onSelect, wholeEssayRow) {
  if (!panel || !tbody || !innerList.length) return;
  panel.hidden = false;
  tbody.replaceChildren();
  const rowEls = [];
  let wholeRowEl = null;

  innerList.forEach((inner, idx) => {
    const tr = document.createElement("tr");
    tr.className = "essay-para-picker__row";
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    const td1 = document.createElement("td");
    td1.textContent = String(idx + 1);
    const td2 = document.createElement("td");
    td2.textContent = getScoreLabel(inner, idx);
    tr.appendChild(td1);
    tr.appendChild(td2);
    const pick = () => {
      wholeRowEl?.classList.remove("essay-para-picker__row--selected");
      rowEls.forEach((r, j) => r.classList.toggle("essay-para-picker__row--selected", j === idx));
      onSelect(inner, idx);
    };
    tr.addEventListener("click", pick);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    });
    tbody.appendChild(tr);
    rowEls.push(tr);
  });

  if (wholeEssayRow && typeof wholeEssayRow.onPick === "function") {
    wholeRowEl = document.createElement("tr");
    wholeRowEl.className = "essay-para-picker__row essay-para-picker__row--whole-essay";
    wholeRowEl.tabIndex = 0;
    wholeRowEl.setAttribute("role", "button");
    const wtd1 = document.createElement("td");
    wtd1.textContent = "Whole essay";
    const wtd2 = document.createElement("td");
    wtd2.textContent =
      typeof wholeEssayRow.getSummary === "function" ? wholeEssayRow.getSummary() : "—";
    wholeRowEl.appendChild(wtd1);
    wholeRowEl.appendChild(wtd2);
    const pickWhole = () => {
      rowEls.forEach((r) => r.classList.remove("essay-para-picker__row--selected"));
      wholeRowEl.classList.add("essay-para-picker__row--selected");
      wholeEssayRow.onPick();
    };
    wholeRowEl.addEventListener("click", pickWhole);
    wholeRowEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pickWhole();
      }
    });
    tbody.appendChild(wholeRowEl);
  }

  onSelect(innerList[0], 0);
  rowEls[0]?.classList.add("essay-para-picker__row--selected");
}

/**
 * Essay-mode Criterion C detail: paragraph steps vs whole-essay holistics panel.
 * @param {"paragraph" | "holistic"} mode
 */
function syncCriterionCEssayDetailSectionVisibility(mode) {
  const isParagraph = mode === "paragraph";
  const paragraphOnlyIds = ["criterionCLoraSection", "criterionCTangentSection", "criterionCModeratorSection"];
  for (const id of paragraphOnlyIds) {
    const el = document.getElementById(id);
    if (el) el.hidden = !isParagraph;
  }
  const essayEl = document.getElementById("criterionCEssayHolisticSection");
  if (essayEl) {
    essayEl.hidden = isParagraph;
  }
}

/**
 * Criterion C essay detail: body rows + three whole-essay holistic rows (stars in score column).
 * @param {HTMLElement | null} panel
 * @param {HTMLTableSectionElement | null} tbody
 * @param {object[]} innerList
 * @param {object} parentBundle
 */
function wireCriterionCEssayDetailParagraphPicker(panel, tbody, innerList, parentBundle) {
  if (!panel || !tbody || !innerList.length) return;
  panel.hidden = false;
  tbody.replaceChildren();
  const bodyRowEls = [];
  const holisticRows = [];
  const chk = parentBundle?.criterionCEssayHolisticChecks;

  const starFromH1 = () => {
    const o = chk?.thesisAndTopicsConsistency;
    const r = o?.thesisTopicsConsistencyRating;
    const n = typeof normalizeCriterionCEssayHolisticStar === "function" ? normalizeCriterionCEssayHolisticStar(r) : null;
    if (n != null) return `thesis/topics ${n}`;
    const raw = String(r ?? "—").trim() || "—";
    return raw === "—" ? "—" : `thesis/topics ${raw}`;
  };
  const starFromH2 = () => {
    const o = chk?.paragraphSwappingMacroStructure;
    if (o && typeof o === "object") {
      const p1 =
        typeof normalizeCriterionCEssayHolisticStar === "function"
          ? normalizeCriterionCEssayHolisticStar(o.macroStructurePhase1Rating)
          : null;
      const p2 =
        typeof normalizeCriterionCEssayHolisticStar === "function"
          ? normalizeCriterionCEssayHolisticStar(o.shuffleTestPhase2Rating)
          : null;
      if (p1 != null && p2 != null) return `structure ${p1} · shuffle ${p2}`;
      if (p1 != null) return `structure ${p1}`;
      if (p2 != null) return `shuffle ${p2}`;
    }
    const leg = chk?.interParagraphProgression;
    const r = leg?.interParagraphProgressionRating;
    const n =
      typeof normalizeCriterionCEssayHolisticStar === "function" ? normalizeCriterionCEssayHolisticStar(r) : null;
    if (n != null) return `progression ${n}`;
    const raw = String(r ?? "—").trim() || "—";
    return raw === "—" ? "—" : `progression ${raw}`;
  };
  const starFromH3 = () => {
    const ic = chk?.introAndConclusionCheck;
    if (ic && typeof ic === "object") {
      const ir =
        typeof normalizeCriterionCEssayHolisticStar === "function"
          ? normalizeCriterionCEssayHolisticStar(ic.introRating)
          : null;
      const cr =
        typeof normalizeCriterionCEssayHolisticStar === "function"
          ? normalizeCriterionCEssayHolisticStar(ic.conclusionRating)
          : null;
      if (ir != null && cr != null) return `intro ${ir} · con ${cr}`;
      if (ir != null) return `intro ${ir}`;
      if (cr != null) return `con ${cr}`;
    }
    const o = chk?.wholeEssayDevelopmentBalance;
    const r = o?.wholeEssayDevelopmentBalanceRating;
    const n = typeof normalizeCriterionCEssayHolisticStar === "function" ? normalizeCriterionCEssayHolisticStar(r) : null;
    if (n != null) return `development ${n}`;
    const raw = String(r ?? "—").trim() || "—";
    return raw === "—" ? "—" : `development ${raw}`;
  };

  innerList.forEach((inner, idx) => {
    const tr = document.createElement("tr");
    tr.className = "essay-para-picker__row";
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    const td1 = document.createElement("td");
    td1.textContent = String(idx + 1);
    const td2 = document.createElement("td");
    td2.textContent = criterionCInnerFinalMarkDisplay(inner);
    tr.appendChild(td1);
    tr.appendChild(td2);
    const pick = () => {
      holisticRows.forEach((r) => r.classList.remove("essay-para-picker__row--selected"));
      bodyRowEls.forEach((r, j) => r.classList.toggle("essay-para-picker__row--selected", j === idx));
      renderCriterionCDetailBody(inner);
      syncCriterionCEssayDetailSectionVisibility("paragraph");
    };
    tr.addEventListener("click", pick);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    });
    tbody.appendChild(tr);
    bodyRowEls.push(tr);
  });

  const addHolisticRow = (label, scoreOnly, holisticIndex) => {
    const tr = document.createElement("tr");
    tr.className = "essay-para-picker__row essay-para-picker__row--holistic";
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    if (holisticIndex >= 1 && holisticIndex <= 3) {
      tr.dataset.criterionCHolisticIndex = String(holisticIndex);
    }
    const t1 = document.createElement("td");
    t1.textContent = label;
    const t2 = document.createElement("td");
    t2.textContent = scoreOnly;
    if (typeof scoreOnly === "string" && scoreOnly.length > 0) {
      t2.title = scoreOnly;
    }
    tr.appendChild(t1);
    tr.appendChild(t2);
    const pickHolistic = () => {
      bodyRowEls.forEach((r) => r.classList.remove("essay-para-picker__row--selected"));
      holisticRows.forEach((r) => r.classList.remove("essay-para-picker__row--selected"));
      tr.classList.add("essay-para-picker__row--selected");
      renderCriterionCEssayHolisticChecksPanel(parentBundle, holisticIndex);
      syncCriterionCEssayDetailSectionVisibility("holistic");
    };
    tr.addEventListener("click", pickHolistic);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pickHolistic();
      }
    });
    tbody.appendChild(tr);
    holisticRows.push(tr);
  };

  addHolisticRow("Whole essay — thesis & topics", starFromH1(), 1);
  addHolisticRow("Whole essay — structure & shuffle", starFromH2(), 2);
  addHolisticRow("Whole essay — intro & conclusion", starFromH3(), 3);

  renderCriterionCDetailBody(innerList[0]);
  renderCriterionCEssayHolisticChecksPanel(parentBundle);
  renderCriterionCEssayFinalIbExaminerPanel(parentBundle);
  syncCriterionCEssayDetailSectionVisibility("paragraph");
  bodyRowEls[0]?.classList.add("essay-para-picker__row--selected");
}

/**
 * Criterion D essay detail: body rows with four per-paragraph /5 columns (no holistic in the picker).
 * @param {HTMLElement | null} panel
 * @param {HTMLTableSectionElement | null} tbody
 * @param {object[]} innerList
 * @param {object} parentBundle
 */
function wireCriterionDEssayDetailParagraphPicker(panel, tbody, innerList, parentBundle) {
  if (!panel || !tbody || !innerList.length) return;
  panel.hidden = false;
  tbody.replaceChildren();
  const rowEls = [];

  innerList.forEach((inner, idx) => {
    const tr = document.createElement("tr");
    tr.className = "essay-para-picker__row";
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    const tdN = document.createElement("td");
    tdN.textContent = String(idx + 1);
    tr.appendChild(tdN);
    const cells = criterionDParagraphFourScoreCells(inner);
    for (let c = 0; c < cells.length; c++) {
      const td = document.createElement("td");
      td.textContent = cells[c];
      tr.appendChild(td);
    }
    const pick = () => {
      rowEls.forEach((r, j) => r.classList.toggle("essay-para-picker__row--selected", j === idx));
      renderCriterionDDetailBody(inner, parentBundle);
    };
    tr.addEventListener("click", pick);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    });
    tbody.appendChild(tr);
    rowEls.push(tr);
  });

  renderCriterionDEssayFinalModeratorPanel(parentBundle);
  const step4 = document.getElementById("criterionDStep4Section");
  if (step4) step4.hidden = true;

  renderCriterionDDetailBody(innerList[0], parentBundle);
  rowEls[0]?.classList.add("essay-para-picker__row--selected");
}

function updateCriterionATileFromBundle(bundle) {
  const scoreLine = document.getElementById("criterionATileScoreLine");
  const numEl = document.getElementById("criterionATileScoreNum");
  const cap = document.getElementById("criterionATileScoreCaption");
  const link = document.getElementById("criterionATileDetailLink");
  if (!scoreLine || !numEl) return;

  if (bundle.finalAverage != null && Number.isFinite(bundle.finalAverage)) {
    const v = bundle.finalAverage;
    const disp = Number.isInteger(v) ? String(v) : v.toFixed(1);
    numEl.textContent = disp;
    scoreLine.hidden = false;
    if (cap) {
      cap.hidden = false;
      cap.textContent = "Criterion A Moderated Mark";
    }
    if (link) link.hidden = false;
    if (bundle.version === 2 && bundle.essayMode) {
      fillCriterionTilePerParaScores("criterionATilePerParaScores", null);
    } else if (Array.isArray(bundle.criterionAEssayParagraphBundles)) {
      fillCriterionTilePerParaScores(
        "criterionATilePerParaScores",
        bundle.criterionAEssayParagraphBundles.map((b) => b.finalAverage)
      );
    } else {
      fillCriterionTilePerParaScores("criterionATilePerParaScores", null);
    }
  } else {
    numEl.textContent = "";
    scoreLine.hidden = true;
    if (cap) {
      cap.hidden = true;
      cap.textContent = "Criterion A Moderated Mark";
    }
    if (link) link.hidden = true;
    fillCriterionTilePerParaScores("criterionATilePerParaScores", null);
  }
}

function clearCriterionATileDisplay() {
  updateCriterionATileFromBundle({ finalAverage: null });
}

async function runCriterionA() {
  setError("");
  saveKey();

  if (!apiKeyInput || !sourceText || !studentParagraph) return;

  const key = apiKeyInput.value.trim();
  if (!key) {
    setError("Add your Gemini API key above.");
    return;
  }

  const src = sourceText.value.trim();
  if (!src) {
    setError("Paste the source text.");
    return;
  }

  const fullText = studentParagraph.value.trim();
  if (!fullText) {
    setError("Paste your analysis paragraph.");
    return;
  }

  const bodies = getEssayBodyParagraphsForGrading();
  if (!bodies) {
    setError("Classify your analysis as a paragraph or essay first.");
    return;
  }

  const isEssay =
    paragraphClassificationRecord?.text === fullText &&
    paragraphClassificationRecord?.kind === "essay" &&
    !!paragraphClassificationRecord?.essayParts;

  setDashboardLoading(true, "Step 1 of 4: Building benchmark (hidden)…");
  hideTooltip();

  const runGen = dashboardClearGeneration;
  try {
    if (!isEssay) {
      const result = await runCriterionAPipeline(key, src, fullText);
      if (runGen !== dashboardClearGeneration) return;
      const bundle = buildSessionBundle(
        src,
        fullText,
        result.data,
        result.rawJson,
        result.topicData,
        result.topicRaw,
        result.step2OverallRawJson
      );
      saveCriterionABundle(bundle);
      updateCriterionATileFromBundle(bundle);
      refreshIbOverallPanel();
      return;
    }

    const { essayIntro, essayConclusion, essayBodyParagraphs } = getEssayMetaFromClassificationRecord();
    setDashboardLoading(true, "Criterion A: building shared benchmark (step 1 of 4)…");
    setGradingStepLine("Criterion A — shared benchmark (essay)");
    const criterionABenchmarkText = await fetchCriterionABenchmarkText(key, src);
    const per = [];
    const scoreParts = [];
    for (let i = 0; i < bodies.length; i++) {
      setDashboardLoading(
        true,
        `Criterion A: body paragraph ${i + 1} of ${bodies.length} — step 2 of 4…`
      );
      setGradingStepLine(`Criterion A — body ${i + 1}/${bodies.length} (steps 2–4)`);
      const result = await runCriterionAPipelineFromBenchmarkText(key, src, bodies[i], criterionABenchmarkText);
      if (runGen !== dashboardClearGeneration) return;
      const inner = buildSessionBundle(
        src,
        bodies[i],
        result.data,
        result.rawJson,
        result.topicData,
        result.topicRaw,
        result.step2OverallRawJson
      );
      per.push(inner);
      if (inner.finalAverage != null && Number.isFinite(inner.finalAverage)) {
        scoreParts.push(inner.finalAverage);
      }
    }

    let criterionAEssayWholeEssayAudit = null;
    try {
      setDashboardLoading(true, "Criterion A: whole-essay benchmark map + holistics (2 Gemini passes)…");
      criterionAEssayWholeEssayAudit = await runCriterionAEssayWholeEssayAudit(
        key,
        src,
        fullText,
        criterionABenchmarkText
      );
    } catch (we) {
      criterionAEssayWholeEssayAudit = {
        error: we instanceof Error ? we.message : String(we),
      };
    }
    if (runGen !== dashboardClearGeneration) return;

    const criterionAEssayParagraphMeanScore = meanScoresClampToNearestHalfStep(scoreParts);
    const tempForAssigner = {
      version: 2,
      essayMode: true,
      criterionAEssayParagraphBundles: per,
      criterionAEssayWholeEssayAudit,
    };
    let criterionAFinalEssayAssigner = null;
    try {
      setDashboardLoading(true, "Criterion A: final examiner assignment (whole essay)…");
      const assign = await runCriterionAEssayFinalAssigner(key, tempForAssigner);
      if (runGen !== dashboardClearGeneration) return;
      criterionAFinalEssayAssigner = {
        score: assign.data.score,
        examinerReport: assign.data.examinerReport,
        rawJson: assign.rawJson,
      };
    } catch (asg) {
      if (runGen !== dashboardClearGeneration) return;
      criterionAFinalEssayAssigner = {
        error: asg instanceof Error ? asg.message : String(asg),
      };
    }

    const finalAverage =
      criterionAFinalEssayAssigner && !criterionAFinalEssayAssigner.error
        ? normalizeCriterionAWholeEssayHolisticScore(criterionAFinalEssayAssigner.score)
        : criterionAEssayParagraphMeanScore;

    const bundle = {
      version: 2,
      essayMode: true,
      sourceText: src,
      studentParagraph: fullText,
      essayIntro,
      essayConclusion,
      essayBodyParagraphs,
      criterionABenchmarkText,
      criterionAEssayParagraphBundles: per,
      criterionAEssayWholeEssayAudit,
      criterionAEssayParagraphMeanScore,
      criterionAFinalEssayAssigner,
      finalAverage,
    };
    saveCriterionABundle(bundle);
    updateCriterionATileFromBundle(bundle);
    refreshIbOverallPanel();
  } catch (e) {
    if (runGen !== dashboardClearGeneration) {
      return;
    }
    const err = e instanceof Error ? e : new Error(String(e));
    if (typeof shouldDeferGradingErrorToPreflight === "function" && shouldDeferGradingErrorToPreflight()) {
      throw err;
    }
    setError(err.message);
  } finally {
    setDashboardLoading(false);
    setStatus("");
  }
}

async function runClassifyParagraphOrEssay() {
  setError("");
  saveKey();

  const key = apiKeyInput?.value.trim();
  if (!key) {
    setError("Add your Gemini API key above.");
    return;
  }

  const para = (studentParagraph?.value ?? "").trim();
  if (!para) {
    setError("Paste your analysis paragraph before classifying.");
    return;
  }

  const btn = document.getElementById("classifyParagraphEssayBtn");
  const labelSpan = btn?.querySelector(".classify-paragraph-essay__label");
  const runGen = dashboardClearGeneration;

  if (btn) btn.dataset.classifying = "1";
  try {
    if (btn) {
      btn.disabled = true;
      if (labelSpan) labelSpan.textContent = "Classifying…";
    }
    const { kind, rationale } = await classifyParagraphOrEssayWithGemini(key, para);
    if (runGen !== dashboardClearGeneration) return;

    if (kind === "essay") {
      if (labelSpan) labelSpan.textContent = "Splitting essay (verbatim)…";
      const parts = await splitEssayVerbatimPartsWithGemini(key, para);
      if (runGen !== dashboardClearGeneration) return;
      const v = validateVerbatimEssaySlices(
        para,
        parts.introduction,
        parts.body_paragraphs,
        parts.conclusion
      );
      if (!v.ok) {
        paragraphClassificationRecord = null;
        updateParagraphFormatLabelUI();
        updateEssayModeChrome();
        persistParagraphClassificationRecord();
        setError(v.message || "Essay split failed.");
        return;
      }
      paragraphClassificationRecord = {
        text: para,
        kind: "essay",
        rationale,
        essayParts: {
          intro: parts.introduction,
          bodyParagraphs: parts.body_paragraphs.slice(),
          conclusion: parts.conclusion,
        },
      };
      updateParagraphFormatLabelUI();
      updateEssayModeChrome();
      persistParagraphClassificationRecord();
      setError("");
    } else {
      paragraphClassificationRecord = { text: para, kind, rationale };
      updateParagraphFormatLabelUI();
      updateEssayModeChrome();
      persistParagraphClassificationRecord();
      setError("");
    }
  } catch (e) {
    if (runGen === dashboardClearGeneration) {
      paragraphClassificationRecord = null;
      updateParagraphFormatLabelUI();
      updateEssayModeChrome();
      persistParagraphClassificationRecord();
      setError(e instanceof Error ? e.message : String(e));
    }
  } finally {
    if (btn) delete btn.dataset.classifying;
    syncClassifyParagraphEssayButtonState();
    syncDashboardCriterionRunLocks();
  }
}

/** Minimum trimmed length per final-moderation decision string when the criterion preliminary is **fractional** (expect ~2–3 sentences). Locked preliminaries use a fixed short sentence instead; see `ibOverallFinalModerationLockedDecisionTextOk`. */
const IB_OVERALL_DECISION_FIELD_MIN_LEN = 85;

/**
 * @param {"A" | "B" | "C" | "D"} letter
 * @param {number} prelim
 * @param {string} text
 */
function ibOverallFinalModerationLockedDecisionTextOk(letter, prelim, text) {
  const n = Math.round(Number(prelim));
  if (!Number.isFinite(n) || n < 0 || n > 5) return false;
  const t = String(text || "")
    .trim()
    .replace(/\s+/g, " ");
  const re = new RegExp(`^The Criterion ${letter} grade of ([0-5]) is locked\\.?$`, "i");
  const m = t.match(re);
  if (!m) return false;
  return Number(m[1]) === n;
}

const IB_OVERALL_FINAL_MODERATION_SCHEMA = {
  type: "object",
  properties: {
    adjustedA: {
      type: "integer",
      minimum: 0,
      maximum: 5,
      description:
        "Criterion A 0–5 integer: lock to preliminary if whole; if preliminary has a fraction, must be floor OR ceil of that preliminary—pick using official A descriptors + student text (not arbitrary rounding).",
    },
    adjustedB: {
      type: "integer",
      minimum: 0,
      maximum: 5,
      description:
        "Criterion B 0–5 integer: same locking / floor–ceil bracket rule as adjustedA, using official B descriptors.",
    },
    adjustedC: {
      type: "integer",
      minimum: 0,
      maximum: 5,
      description:
        "Criterion C 0–5 integer: same locking / floor–ceil bracket rule as adjustedA, using official C descriptors.",
    },
    adjustedD: {
      type: "integer",
      minimum: 0,
      maximum: 5,
      description:
        "Criterion D 0–5 integer: same locking / floor–ceil bracket rule as adjustedA, using official D descriptors.",
    },
    decisionCriterionA: {
      type: "string",
      description:
        "If preliminary A is a **whole integer** (locked): output **only** this exact sentence (no extra justification): `The Criterion A grade of N is locked.` where N is that integer 0–5. If preliminary A is **fractional**: exactly two or three complete sentences — preliminary→adjusted, descriptor + script/digest; IB examiner tone; no bullets.",
    },
    decisionCriterionB: {
      type: "string",
      description:
        "Same pattern as decisionCriterionA: locked preliminary → only `The Criterion B grade of N is locked.`; fractional → two or three sentences.",
    },
    decisionCriterionC: {
      type: "string",
      description:
        "Same pattern as decisionCriterionA: locked preliminary → only `The Criterion C grade of N is locked.`; fractional → two or three sentences.",
    },
    decisionCriterionD: {
      type: "string",
      description:
        "Same pattern as decisionCriterionA: locked preliminary → only `The Criterion D grade of N is locked.`; fractional → two or three sentences.",
    },
    decisionFinalBand: {
      type: "string",
      description:
        "Exactly two or three complete sentences on total /20 and IB band 1–7. If discretion applied, clarify that IB 'boundary' here means the bottom or top integer inside a band's mark range (e.g. band 4 = 9–11 allows discretion at totals 9 and 11), or integer joins between bands — not half-marks or totals outside the scale. Non-locked criteria only; never break locking rules. No bullet list.",
    },
    paragraphWhatWorkedWell: {
      type: "string",
      description:
        "One paragraph only, IB examiner voice: strengths with at least one concrete reference to the student's wording or argumentative moves.",
    },
    paragraphPrioritiesNextBand: {
      type: "string",
      description:
        "One paragraph only, IB examiner voice: two or three priorities to reach the next higher IB band, grounded in this response.",
    },
  },
  required: [
    "adjustedA",
    "adjustedB",
    "adjustedC",
    "adjustedD",
    "decisionCriterionA",
    "decisionCriterionB",
    "decisionCriterionC",
    "decisionCriterionD",
    "decisionFinalBand",
    "paragraphWhatWorkedWell",
    "paragraphPrioritiesNextBand",
  ],
};

/**
 * @param {number} sA
 * @param {number} sB
 * @param {number} sC
 * @param {number} sD
 * @param {object} data
 */
function repairIbOverallAdjustedScoresFromModel(sA, sB, sC, sD, data) {
  const orig = [sA, sB, sC, sD];
  const keys = ["adjustedA", "adjustedB", "adjustedC", "adjustedD"];
  const out = [];
  for (let i = 0; i < 4; i++) {
    const o = Number(orig[i]);
    let a = Number(data[keys[i]]);
    if (typeof ibOverallPreliminaryMarkIsWholeInteger === "function" && ibOverallPreliminaryMarkIsWholeInteger(o)) {
      out.push(Math.round(o));
    } else {
      if (!Number.isFinite(a)) a = NaN;
      let v = Math.round(a);
      if (!Number.isFinite(v)) v = Math.round(o);
      v = Math.max(0, Math.min(5, v));
      if (Number.isFinite(o)) {
        let lo = Math.floor(o + 1e-9);
        let hi = Math.ceil(o - 1e-9);
        lo = Math.max(0, Math.min(5, lo));
        hi = Math.max(0, Math.min(5, hi));
        if (hi > lo) {
          if (v < lo) v = lo;
          else if (v > hi) v = hi;
        }
      }
      out.push(v);
    }
  }
  return { A: out[0], B: out[1], C: out[2], D: out[3] };
}

/**
 * Full official A–D band descriptors (same source strings as per-criterion grading prompts).
 * @returns {string}
 */
function buildIbOverallOfficialRubricsReferenceBlock() {
  return `### Official IB Paper 1 criterion descriptors (complete Criteria A–D)

Treat this section as **authoritative**. When you choose an adjusted mark, you must be able to justify it with **specific phrasing from the relevant descriptor level** together with **evidence from the student's script** (the digest may support that evidence but must not replace reading the script).

When a preliminary mark is **not** a whole integer, your job is to resolve it to **one** adjacent integer (floor or ceil of that preliminary, clamped to 0–5). **Do not** choose by automatic rounding habit (e.g. “2.5 always → 3”): you must **weigh** which integer level is the **better overall fit**.

---

${CRITERION_A_IB_KNOWLEDGE_RUBRIC_BLOCK}

---

${CRITERION_B_IB_OFFICIAL_RUBRIC_BLOCK}

---

${CRITERION_C_IB_OFFICIAL_RUBRIC_BLOCK}

---

${CRITERION_D_IB_OFFICIAL_RUBRIC_BLOCK}`;
}

/**
 * @param {string} fullEssay
 * @param {string} digestText
 * @param {number} sA
 * @param {number} sB
 * @param {number} sC
 * @param {number} sD
 */
function buildIbOverallFinalModerationUserPrompt(fullEssay, digestText, sA, sB, sC, sD) {
  const rubrics = buildIbOverallOfficialRubricsReferenceBlock();
  return `You are a senior IB English A: Language and Literature Paper 1 examiner.

Your task: assign final **adjusted** criterion marks A–D (each out of 5) using the **official descriptors below**, the student's **full** analytical response, the **preliminary** marks from the automated pipelines, and the **abbreviated digest** of examiner-style comments. Work deliberately: each mark must survive cross-check against the rubric. Then output the **decision explanations** (for transparency), then the **two student-facing examiner paragraphs**.

---

${rubrics}

---

### Full student analytical response (verbatim)

${fullEssay}

---

### Preliminary marks (from the application; honour the locking rules below)

- Criterion A (Knowledge and understanding): ${formatMarkForDashboard(sA)} / 5
- Criterion B (Analysis and evaluation): ${formatMarkForDashboard(sB)} / 5
- Criterion C (Focus, organization and development): ${formatMarkForDashboard(sC)} / 5
- Criterion D (Language): ${formatMarkForDashboard(sD)} / 5

---

### Examiner comments digest (condensed — do not invent evidence beyond the digest + the student text)

${digestText}

---

### Mark adjustment rules (strict)

1. Preliminary marks may use half-point steps (e.g. 2.5) or other fractional values produced by the app (e.g. 3.8).
2. **Whole integer** preliminary marks (0, 1, 2, 3, 4, 5 with **no** fractional part) are **LOCKED**: your adjusted mark for that criterion must be **exactly** that same integer.
3. **Fractional preliminaries — careful resolution (mandatory process):**
   - For each such criterion, identify the **two adjacent integer candidates** (typically **floor** and **ceil** of the preliminary mark, still clamped to 0–5).
   - Read the **official descriptors for BOTH** of those integers in that criterion’s section above.
   - Weigh **all** relevant evidence: the **full student text** (primary), then the digest (secondary). Ask: which descriptor’s **required qualities** are **more consistently and strongly** met across the response as a whole? Which descriptor’s **failure conditions** are **more clearly** triggered?
   - Choose the **single** integer (one of those neighbours) that is the **most appropriate** fit. Prefer the level whose **distinctive** wording (e.g. “thorough and perceptive”, “very good evaluation”, “well focused”, “high degree of accuracy”) is **best supported** by the script. **Avoid** defaulting to “round up” or “round down” without this comparison.
   - If evidence truly straddles both neighbours, pick the integer that yields the **fairer** holistic judgment for that criterion alone (still obeying rule 4 when the **overall total** calls for IB band-range discretion).
4. The application will sum adjustedA+adjustedB+adjustedC+adjustedD as **total /20** (integer totals after your adjustments) and map to IB band **1–7** using: 7 = 17–20, 6 = 14–16, 5 = 12–13, 4 = 9–11, 3 = 6–8, 2 = 3–5, 1 = 0–2.
   **IB band-range “boundary” discretion (read carefully):** This is **not** about preliminary half-marks (rule 3) and **not** about totals outside 0–20. It means defensible judgment when the **integer total** sits at the **low or high end of a band’s own mark span**, or at the **join between two bands**. Example: band **4** is **9–11** marks — both **9** (the band’s **bottom** integer) and **11** (its **top** integer) are typical places to exercise discretion (weak vs strong fit for that band vs the neighbour). Likewise, totals like **8 vs 9** or **11 vs 12** straddle band edges. Use genuine examiner discretion on **non-locked** criteria only to choose the band that best fits the whole response (**never** break rule 2).
5. Output **only** JSON matching the schema. No markdown outside JSON.

---

### Decision explanations (required — output **before** the student-facing comments in JSON field order does not matter)

These are **for teachers / transparency**, not addressed to the student.

- **decisionCriterionA** … **decisionCriterionD** — **Locked preliminary (whole integer 0–5, rule 2):** **Do not** justify that criterion. Output **only** this single sentence (exact wording, optional terminal period): **The Criterion [A|B|C|D] grade of N is locked.** where **[A|B|C|D]** and **N** match that criterion’s preliminary. **No** descriptor quotes, **no** evidence, **no** second sentence.
- **decisionCriterionA** … **decisionCriterionD** — **Fractional preliminary:** **Exactly two or three complete sentences** (no bullet lists). Explain the move from preliminary to **adjusted**. Reference **descriptor language** and **concrete evidence** from the script or digest. Show you weighed **both** neighbouring integers.
- **decisionFinalBand**: **Exactly two or three complete sentences.** Explain how the **four adjusted integers** yield **total /20** and **IB band 1–7**. If you used discretion, spell out that this was because the total sat at a **band-range endpoint** (e.g. for band 4 = 9–11, totals **9** or **11**) or at an **integer join between bands** — **not** merely because a preliminary had a “.5”, and **not** because the total was outside the IB mapping.

---

### Prose requirements (student-facing)

- **paragraphWhatWorkedWell**: exactly **one** substantial paragraph in IB examiner voice: what the response did well, with **at least one** concrete reference to phrasing or moves in the student's text.
- **paragraphPrioritiesNextBand**: exactly **one** substantial paragraph in IB examiner voice: **two or three** clear priorities the student should address to reach the **next higher IB band**, tied to observable weaknesses in this script.

Return JSON with adjustedA–D, the five decision strings, and the two paragraph strings.`;
}

/**
 * @param {string} apiKey
 * @param {object | null} bundleA
 * @param {object | null} bundleB
 * @param {object | null} bundleC
 * @param {object | null} bundleD
 * @param {number} sA
 * @param {number} sB
 * @param {number} sC
 * @param {number} sD
 */
async function runIbOverallFinalModerationGemini(apiKey, bundleA, bundleB, bundleC, bundleD, sA, sB, sC, sD) {
  const fullEssay =
    typeof getFullStudentAnalysisTextForIbModeration === "function"
      ? getFullStudentAnalysisTextForIbModeration()
      : studentParagraph?.value.trim() ?? "";
  if (!String(fullEssay).trim()) {
    throw new Error("No student analysis text to moderate.");
  }
  const digest = buildIbOverallExaminerCommentsDigest(bundleA, bundleB, bundleC, bundleD);
  const userMsg = buildIbOverallFinalModerationUserPrompt(fullEssay, digest, sA, sB, sC, sD);
  let rawJson;
  try {
    rawJson = await callGemini(apiKey, userMsg, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: IB_OVERALL_FINAL_MODERATION_SCHEMA,
    });
  } catch (firstErr) {
    try {
      rawJson = await callGemini(apiKey, userMsg, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }
  const data = parseModelJsonObject(rawJson);
  const adjusted = repairIbOverallAdjustedScoresFromModel(sA, sB, sC, sD, data);
  const dA = data.decisionCriterionA != null ? String(data.decisionCriterionA).trim() : "";
  const dB = data.decisionCriterionB != null ? String(data.decisionCriterionB).trim() : "";
  const dC = data.decisionCriterionC != null ? String(data.decisionCriterionC).trim() : "";
  const dD = data.decisionCriterionD != null ? String(data.decisionCriterionD).trim() : "";
  const dBand = data.decisionFinalBand != null ? String(data.decisionFinalBand).trim() : "";
  const critDecisions = [
    ["A", sA, dA, "Criterion A decision"],
    ["B", sB, dB, "Criterion B decision"],
    ["C", sC, dC, "Criterion C decision"],
    ["D", sD, dD, "Criterion D decision"],
  ];
  for (const [letter, prelim, t, label] of critDecisions) {
    const locked =
      typeof ibOverallPreliminaryMarkIsWholeInteger === "function" &&
      ibOverallPreliminaryMarkIsWholeInteger(Number(prelim));
    if (locked) {
      if (!ibOverallFinalModerationLockedDecisionTextOk(letter, prelim, t)) {
        throw new Error(
          `Final moderation: "${label}" must be exactly: The Criterion ${letter} grade of N is locked. (N = locked preliminary integer). No extra text. Try again.`
        );
      }
    } else if (t.length < IB_OVERALL_DECISION_FIELD_MIN_LEN) {
      throw new Error(
        `Final moderation: "${label}" was too short (need at least ${IB_OVERALL_DECISION_FIELD_MIN_LEN} characters for a fractional preliminary). Try again.`
      );
    }
  }
  if (dBand.length < IB_OVERALL_DECISION_FIELD_MIN_LEN) {
    throw new Error(
      `Final moderation: "Total and IB band decision" was too short (need at least ${IB_OVERALL_DECISION_FIELD_MIN_LEN} characters). Try again.`
    );
  }
  const p1 = data.paragraphWhatWorkedWell != null ? String(data.paragraphWhatWorkedWell).trim() : "";
  const p2 = data.paragraphPrioritiesNextBand != null ? String(data.paragraphPrioritiesNextBand).trim() : "";
  if (p1.length < 40 || p2.length < 40) {
    throw new Error("Final moderation returned comments that were too short. Try again.");
  }
  const fpEssay =
    typeof getFullStudentAnalysisTextForIbModeration === "function"
      ? getFullStudentAnalysisTextForIbModeration()
      : studentParagraph?.value.trim() ?? "";
  const fingerprint = computeIbOverallModerationFingerprint(fpEssay, sA, sB, sC, sD);
  return {
    version: 1,
    fingerprint,
    preliminary: { A: sA, B: sB, C: sC, D: sD },
    adjusted,
    decisionCriterionA: dA,
    decisionCriterionB: dB,
    decisionCriterionC: dC,
    decisionCriterionD: dD,
    decisionFinalBand: dBand,
    paragraphWhatWorkedWell: p1,
    paragraphPrioritiesNextBand: p2,
    rawJson: typeof rawJson === "string" ? rawJson : JSON.stringify(rawJson),
  };
}

async function handleIbOverallRevealClick() {
  setError("");
  saveKey();
  const key = apiKeyInput?.value.trim() ?? "";
  if (!key) {
    setError("Add your Gemini API key above.");
    return;
  }
  const bundleA = parseDashboardCriterionBundle(loadCriterionABundleRaw());
  const bundleB = parseDashboardCriterionBundle(loadCriterionBBundleRaw());
  const bundleC = parseDashboardCriterionBundle(loadCriterionCBundleRaw());
  const bundleD = parseDashboardCriterionBundle(loadCriterionDBundleRaw());
  const sA = getDashboardCriterionAScore(bundleA);
  const sB = getDashboardCriterionBScore(bundleB);
  const sC = getDashboardCriterionCScore(bundleC);
  const sD = getDashboardCriterionDScore(bundleD);
  const complete = sA != null && sB != null && sC != null && sD != null;
  if (!complete) {
    setError("Score Criteria A, B, C, and D before revealing the final score.");
    return;
  }

  const ibRevealBtn = document.getElementById("ibOverallRevealBtn");
  if (ibRevealBtn?.dataset.ibModerationBusy === "1") return;
  if (ibRevealBtn?.classList.contains("ib-overall-reveal-btn--moderated")) return;
  setIbOverallModerationLoading(true);
  try {
    const rec = await runIbOverallFinalModerationGemini(key, bundleA, bundleB, bundleC, bundleD, sA, sB, sC, sD);
    if (typeof saveIbOverallModerationRecord === "function") {
      saveIbOverallModerationRecord(rec);
    }
    ibOverallScoreRevealed = true;
    refreshIbOverallPanel();
    document.getElementById("ibOverallResult")?.focus();
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  } finally {
    setIbOverallModerationLoading(false);
  }
}

function initDashboard() {
  document.getElementById("classifyParagraphEssayBtn")?.addEventListener("click", () => {
    void runClassifyParagraphOrEssay();
  });

  criterionATileRun?.addEventListener("click", () => void executeCriterionRunWithPreflight("A", runCriterionA));
  const detailLink = document.getElementById("criterionATileDetailLink");
  detailLink?.addEventListener("click", (ev) => {
    try {
      if (!loadCriterionABundleRaw()) {
        ev.preventDefault();
        setError('Run "Criterion A" first, then open See detail.');
      }
    } catch {
      ev.preventDefault();
    }
  });

  criterionBTileRun?.addEventListener("click", () => void executeCriterionRunWithPreflight("B", runCriterionB));
  const detailLinkB = document.getElementById("criterionBTileDetailLink");
  detailLinkB?.addEventListener("click", (ev) => {
    try {
      if (!loadCriterionBBundleRaw()) {
        ev.preventDefault();
        setError('Run "Criterion B" first, then open See detail.');
      }
    } catch {
      ev.preventDefault();
    }
  });

  criterionCTileRun?.addEventListener("click", () => void executeCriterionRunWithPreflight("C", runCriterionC));
  const detailLinkC = document.getElementById("criterionCTileDetailLink");
  detailLinkC?.addEventListener("click", (ev) => {
    try {
      if (!loadCriterionCBundleRaw()) {
        ev.preventDefault();
        setError('Run "Criterion C" first, then open See detail.');
      }
    } catch {
      ev.preventDefault();
    }
  });

  criterionDTileRun?.addEventListener("click", () => void executeCriterionRunWithPreflight("D", runCriterionD));
  const detailLinkD = document.getElementById("criterionDTileDetailLink");
  detailLinkD?.addEventListener("click", (ev) => {
    try {
      if (!loadCriterionDBundleRaw()) {
        ev.preventDefault();
        setError('Run "Criterion D" first, then open See detail.');
      }
    } catch {
      ev.preventDefault();
    }
  });

  try {
    const bundle = parseDashboardCriterionBundle(loadCriterionABundleRaw());
    if (bundle) updateCriterionATileFromBundle(bundle);
  } catch {
    /* ignore */
  }

  try {
    const bundleB = parseDashboardCriterionBundle(loadCriterionBBundleRaw());
    if (bundleB) updateCriterionBTileFromBundle(bundleB);
  } catch {
    /* ignore */
  }

  try {
    const bundleC = parseDashboardCriterionBundle(loadCriterionCBundleRaw());
    if (bundleC) updateCriterionCTileFromBundle(bundleC);
  } catch {
    /* ignore */
  }

  try {
    const bundleD = parseDashboardCriterionBundle(loadCriterionDBundleRaw());
    if (bundleD) updateCriterionDTileFromBundle(bundleD);
  } catch {
    /* ignore */
  }

  const ibRevealBtn = document.getElementById("ibOverallRevealBtn");
  if (ibRevealBtn && !ibRevealBtn.dataset.ibRevealBound) {
    ibRevealBtn.dataset.ibRevealBound = "1";
    ibRevealBtn.addEventListener("click", () => void handleIbOverallRevealClick());
  }

  const ibPdfBtn = document.getElementById("ibOverallPdfBtn");
  if (ibPdfBtn && !ibPdfBtn.dataset.ibPdfBound) {
    ibPdfBtn.dataset.ibPdfBound = "1";
    ibPdfBtn.addEventListener("click", () => {
      setError("");
      try {
        downloadIbFullReportPdf();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  refreshIbOverallPanel();
  syncDashboardCriterionRunLocks();
  updateEssayModeChrome();
}

function renderCriterionADetailBody(bundle) {
  const para = bundle.studentParagraph || "";
  if (bundle.auditData) enrichCriterionAAuditDataWithHolisticScores(bundle.auditData, { normalizeStep2: false });
  renderAuditOutput(para, bundle.auditRawJson, bundle.auditData);
  if (criterionADetailEssayModeActive && criterionADetailEssayWholeEssayHolisticView) {
    return;
  }
  renderTopicArgumentOutput(bundle.topicData, bundle.topicRawJson);
  renderFinalCriterionGrade(bundle.auditData, bundle.topicData);
}

function initCriterionADetailPage() {
  let bundle;
  try {
    const raw = loadCriterionABundleRaw();
    if (!raw) {
      throw new Error('No saved results. Go back and run "Criterion A" from the dashboard.');
    }
    bundle = JSON.parse(raw);
    if (!bundle || !bundle.version || !((bundle.version === 1 && bundle.auditData) || bundle.version === 2)) {
      throw new Error("Saved results are invalid or incomplete.");
    }
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
    return;
  }

  if (bundle.version === 2 && bundle.essayMode) {
    const innerList = bundle.criterionAEssayParagraphBundles;
    if (!Array.isArray(innerList) || innerList.length === 0 || !innerList[0]?.auditData) {
      setError("Saved essay-mode Criterion A results are incomplete.");
      return;
    }
    const panel = document.getElementById("criterionAEssayParaPicker");
    const tbody = document.getElementById("criterionAEssayParaPickerTbody");
    const wa = bundle.criterionAEssayWholeEssayAudit;
    const wholeRow =
      wa && (wa.data || wa.error)
        ? {
            getSummary() {
              if (wa.error) return "Error";
              return criterionAWholeEssayAuditSummaryLine(wa.data);
            },
            onPick() {
              setCriterionADetailEssayChrome(true, true);
              renderCriterionAWholeEssayAuditPanel(bundle);
            },
          }
        : null;
    setCriterionADetailEssayChrome(true, false);
    wireEssayDetailParagraphPicker(
      panel,
      tbody,
      innerList,
      (inner) => formatDashboardScoreDisp(inner.finalAverage),
      (inner) => {
        setCriterionADetailEssayChrome(true, false);
        renderCriterionADetailBody(inner);
      },
      wholeRow
    );
    syncCriterionAFinalEssayAssignerSection(bundle);
    return;
  }

  setCriterionADetailEssayChrome(false);
  syncCriterionAFinalEssayAssignerSection(bundle);
  renderCriterionADetailBody(bundle);
}

/**
 * Essay-mode Criterion B detail: toggle which panels are visible (paragraph audit vs whole-essay holistics).
 * Final examiner panel is always left as-is.
 * @param {"paragraph" | "holistic"} mode
 */
function syncCriterionBEssayDetailSectionVisibility(mode) {
  const isParagraph = mode === "paragraph";
  const paragraphOnlyIds = [
    "criterionBOutputSection",
    "criterionBSetBlocksSection",
    "criterionBPhase1Section",
    "criterionBSummarySection",
  ];
  for (const id of paragraphOnlyIds) {
    const el = document.getElementById(id);
    if (el) el.hidden = !isParagraph;
  }
  const essayEl = document.getElementById("criterionBEssayHolisticSection");
  if (essayEl) {
    essayEl.hidden = isParagraph;
  }
}

/**
 * Score column only (Criterion A–style table): step 3 holistic / 5 for this body paragraph.
 * @param {object} inner
 * @returns {string}
 */
function formatCriterionBEssayPickerScoreCell(inner) {
  let v =
    inner.finalCriterionBScore != null && Number.isFinite(inner.finalCriterionBScore)
      ? inner.finalCriterionBScore
      : null;
  if ((v == null || !Number.isFinite(v)) && inner.criterionBStep3Data) {
    v = normalizeCriterionBHolisticScore(inner.criterionBStep3Data.score);
  }
  return formatDashboardScoreDisp(v);
}

/**
 * Essay-mode Criterion B detail: same 2-column table as Criterion A (Paragraph | Score), plus two whole-essay rows (rating only in Score).
 * @param {HTMLElement | null} panel
 * @param {HTMLTableSectionElement | null} tbody
 * @param {object[]} innerList
 * @param {object} parentBundle
 */
function wireCriterionBEssayDetailParagraphPicker(panel, tbody, innerList, parentBundle) {
  if (!panel || !tbody || !innerList.length) return;
  panel.hidden = false;
  tbody.replaceChildren();
  const bodyRowEls = [];
  const chk = parentBundle?.criterionBEssayHolisticChecks;
  const holisticRows = [];

  innerList.forEach((inner, idx) => {
    const tr = document.createElement("tr");
    tr.className = "essay-para-picker__row";
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    const td1 = document.createElement("td");
    td1.textContent = String(idx + 1);
    const td2 = document.createElement("td");
    td2.textContent = formatCriterionBEssayPickerScoreCell(inner);
    tr.appendChild(td1);
    tr.appendChild(td2);
    const pick = () => {
      holisticRows.forEach((r) => r.classList.remove("essay-para-picker__row--selected"));
      bodyRowEls.forEach((r, j) => r.classList.toggle("essay-para-picker__row--selected", j === idx));
      renderCriterionBDetailBody(inner, parentBundle);
      renderCriterionBEssayHolisticChecksPanel(parentBundle);
      syncCriterionBEssayDetailSectionVisibility("paragraph");
    };
    tr.addEventListener("click", pick);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    });
    tbody.appendChild(tr);
    bodyRowEls.push(tr);
  });

  const addHolisticRow = (label, scoreOnly) => {
    const tr = document.createElement("tr");
    tr.className = "essay-para-picker__row essay-para-picker__row--holistic";
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    const t1 = document.createElement("td");
    t1.textContent = label;
    const t2 = document.createElement("td");
    t2.textContent = scoreOnly;
    tr.appendChild(t1);
    tr.appendChild(t2);
    const pickHolistic = () => {
      bodyRowEls.forEach((r) => r.classList.remove("essay-para-picker__row--selected"));
      holisticRows.forEach((r) => r.classList.remove("essay-para-picker__row--selected"));
      tr.classList.add("essay-para-picker__row--selected");
      renderCriterionBEssayHolisticChecksPanel(parentBundle);
      syncCriterionBEssayDetailSectionVisibility("holistic");
    };
    tr.addEventListener("click", pickHolistic);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pickHolistic();
      }
    });
    tbody.appendChild(tr);
    holisticRows.push(tr);
  };

  const shiftScore =
    chk && typeof chk === "object" ? String(chk.shiftsHolisticRating ?? "—").trim() || "—" : "—";
  const genreScore =
    chk && typeof chk === "object" ? String(chk.genreHolisticRating ?? "—").trim() || "—" : "—";

  addHolisticRow("Whole essay — shifts", shiftScore);
  addHolisticRow("Whole essay — genre", genreScore);

  renderCriterionBDetailBody(innerList[0], parentBundle);
  renderCriterionBEssayHolisticChecksPanel(parentBundle);
  syncCriterionBEssayDetailSectionVisibility("paragraph");
  bodyRowEls[0]?.classList.add("essay-para-picker__row--selected");
}

/**
 * @param {object} bundle Inner paragraph bundle or full v1 bundle.
 * @param {object} [essayParentBundle] When essay mode: parent bundle (holds criterionBFinalExaminer).
 */
function renderCriterionBDetailBody(bundle, essayParentBundle) {
  const para = bundle.studentParagraph || "";
  const data = bundle.criterionBData;
  const parent = essayParentBundle != null ? essayParentBundle : bundle;
  renderCriterionBFinalExaminerPanel(parent);
  renderCriterionBMainOutput(para, bundle.criterionBRawJson, data);
  renderCriterionBSetDetailBlocks(data);
  renderCriterionBPhase1Table(data);
  renderCriterionBHolisticPanel(bundle.criterionBStep3Data);
}

function initCriterionBDetailPage() {
  setError("");
  criterionBTooltip = document.getElementById("criterionBTooltip");

  let bundle;
  try {
    const raw = loadCriterionBBundleRaw();
    if (!raw) {
      throw new Error('No saved results. Go back and run "Criterion B" from the dashboard.');
    }
    bundle = JSON.parse(raw);
    if (!bundle || !bundle.version || !((bundle.version === 1 && bundle.criterionBData) || bundle.version === 2)) {
      throw new Error("Saved Criterion B results are invalid or incomplete.");
    }
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
    return;
  }

  if (bundle.version === 2 && bundle.essayMode) {
    const innerList = bundle.criterionBEssayParagraphBundles;
    if (!Array.isArray(innerList) || innerList.length === 0 || !innerList[0]?.criterionBData) {
      setError("Saved essay-mode Criterion B results are incomplete.");
      return;
    }
    const panel = document.getElementById("criterionBEssayParaPicker");
    const tbody = document.getElementById("criterionBEssayParaPickerTbody");
    wireCriterionBEssayDetailParagraphPicker(panel, tbody, innerList, bundle);
    return;
  }

  renderCriterionBEssayHolisticChecksPanel(null);
  renderCriterionBDetailBody(bundle);
}

function renderCriterionCDetailBody(bundle) {
  const sp = bundle.studentParagraph || "";
  if (bundle.version === 4 && bundle.criterionCLoraData) {
    renderCriterionCLoraDetail(bundle.criterionCLoraData, bundle.criterionCLoraRawJson || "", sp);
    renderCriterionCTangentDetail(bundle.criterionCTangentData || null, bundle.criterionCTangentRawJson || "");
    renderCriterionCModeratorDetail(bundle.criterionCModeratorData || null, bundle.criterionCModeratorRawJson || "", bundle);
    return;
  }
  if (bundle.version === 3 && bundle.criterionCLoraData) {
    renderCriterionCLoraDetail(bundle.criterionCLoraData, bundle.criterionCLoraRawJson || "", sp);
    const tangOut = document.getElementById("criterionCTangentOutput");
    const modOut = document.getElementById("criterionCModeratorOutput");
    if (tangOut) tangOut.innerHTML = "";
    if (modOut) modOut.innerHTML = "";
    return;
  }
  const out = document.getElementById("criterionCLoraOutput");
  const meta = document.getElementById("criterionCLoraMetaOutput");
  if (out) {
    out.innerHTML =
      "<p>This saved bundle uses a <strong>legacy</strong> Criterion C format. Run <strong>Criterion C</strong> again from the dashboard to use the current workflow.</p>";
  }
  if (meta) meta.innerHTML = "";
}

function criterionCInnerFinalMarkDisplay(inner) {
  const v = getCriterionCFinalIbMarkFromBundle(inner);
  return v != null ? formatDashboardScoreDisp(v) : "—";
}

function initCriterionCDetailPage() {
  setError("");

  let bundle;
  try {
    const raw = loadCriterionCBundleRaw();
    if (!raw) {
      throw new Error('No saved results. Go back and run "Criterion C" from the dashboard.');
    }
    bundle = JSON.parse(raw);
    const okSingleV4 =
      bundle.version === 4 &&
      bundle.criterionCLoraData &&
      bundle.criterionCTangentData &&
      bundle.criterionCModeratorData &&
      !bundle.essayMode;
    const okEssayV4 =
      bundle.version === 4 &&
      bundle.essayMode &&
      Array.isArray(bundle.criterionCEssayParagraphBundles) &&
      bundle.criterionCEssayParagraphBundles[0]?.criterionCLoraData &&
      bundle.criterionCEssayParagraphBundles[0]?.criterionCTangentData &&
      bundle.criterionCEssayParagraphBundles[0]?.criterionCModeratorData;
    const okSingleV3 = bundle.version === 3 && bundle.criterionCLoraData && !bundle.essayMode;
    const okEssayV3 =
      bundle.version === 3 &&
      bundle.essayMode &&
      Array.isArray(bundle.criterionCEssayParagraphBundles) &&
      bundle.criterionCEssayParagraphBundles[0]?.criterionCLoraData;
    const okLegacyEssay =
      bundle.version === 2 &&
      bundle.essayMode &&
      Array.isArray(bundle.criterionCEssayParagraphBundles) &&
      bundle.criterionCEssayParagraphBundles[0]?.criterionCStep1Data;
    const okLegacySingle = bundle.version === 1 && bundle.criterionCStep1Data;
    if (
      !bundle ||
      !bundle.version ||
      !(okSingleV4 || okEssayV4 || okSingleV3 || okEssayV3 || okLegacyEssay || okLegacySingle)
    ) {
      throw new Error("Saved Criterion C results are invalid or incomplete.");
    }
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
    return;
  }

  if (bundle.version === 4 && bundle.essayMode) {
    const innerList = bundle.criterionCEssayParagraphBundles;
    if (!Array.isArray(innerList) || innerList.length === 0 || !innerList[0]?.criterionCModeratorData) {
      setError("Saved essay-mode Criterion C results are incomplete.");
      return;
    }
    const panel = document.getElementById("criterionCEssayParaPicker");
    const tbody = document.getElementById("criterionCEssayParaPickerTbody");
    wireCriterionCEssayDetailParagraphPicker(panel, tbody, innerList, bundle);
    return;
  }

  if (bundle.version === 3 && bundle.essayMode) {
    const innerList = bundle.criterionCEssayParagraphBundles;
    if (!Array.isArray(innerList) || innerList.length === 0 || !innerList[0]?.criterionCLoraData) {
      setError("Saved essay-mode Criterion C results are incomplete.");
      return;
    }
    const panel = document.getElementById("criterionCEssayParaPicker");
    const tbody = document.getElementById("criterionCEssayParaPickerTbody");
    wireEssayDetailParagraphPicker(panel, tbody, innerList, (inner) => criterionCInnerFinalMarkDisplay(inner), (inner) => {
      renderCriterionCDetailBody(inner);
    });
    return;
  }

  if (bundle.version === 2 && bundle.essayMode) {
    const innerList = bundle.criterionCEssayParagraphBundles;
    if (!Array.isArray(innerList) || innerList.length === 0 || !innerList[0]?.criterionCStep1Data) {
      setError("Saved essay-mode Criterion C results are incomplete.");
      return;
    }
    const panel = document.getElementById("criterionCEssayParaPicker");
    const tbody = document.getElementById("criterionCEssayParaPickerTbody");
    wireEssayDetailParagraphPicker(panel, tbody, innerList, (inner) => criterionCInnerFinalMarkDisplay(inner), (inner) => {
      renderCriterionCDetailBody(inner);
    });
    return;
  }

  renderCriterionCEssayHolisticChecksPanel(null);
  renderCriterionCEssayFinalIbExaminerPanel(null);
  renderCriterionCDetailBody(bundle);
}

/**
 * @param {object} bundle Inner paragraph bundle (steps 1–3).
 * @param {object} [essayParentBundle] When set (essay mode), Step 4 is read from the parent whole-essay bundle.
 */
function renderCriterionDDetailBody(bundle, essayParentBundle) {
  criterionDLexTooltip = document.getElementById("criterionDLexTooltip");
  criterionDRegTooltip = document.getElementById("criterionDRegTooltip");
  hideCriterionDLexTooltip();
  hideCriterionDRegTooltip();
  const sp = bundle.studentParagraph || "";
  renderCriterionDStep1Detail(bundle.criterionDStep1Data, bundle.criterionDStep1RawJson || "");
  renderCriterionDStep2Detail(bundle.criterionDStep2Data || null, bundle.criterionDStep2RawJson || "", sp);
  renderCriterionDStep3Detail(bundle.criterionDStep3Data || null, bundle.criterionDStep3RawJson || "", sp);
  const p4 =
    essayParentBundle &&
    essayParentBundle.version === 3 &&
    essayParentBundle.essayMode &&
    essayParentBundle.criterionDStep4Data
      ? essayParentBundle.criterionDStep4Data
      : bundle.criterionDStep4Data;
  const r4 =
    essayParentBundle &&
    essayParentBundle.version === 3 &&
    essayParentBundle.essayMode &&
    essayParentBundle.criterionDStep4RawJson != null
      ? essayParentBundle.criterionDStep4RawJson
      : bundle.criterionDStep4RawJson;
  if (!essayParentBundle) {
    renderCriterionDStep4Detail(p4 || null, r4 || "");
  }
}

function initCriterionDDetailPage() {
  setError("");

  let bundle;
  try {
    const raw = loadCriterionDBundleRaw();
    if (!raw) {
      throw new Error('No saved results. Go back and run "Criterion D" from the dashboard.');
    }
    bundle = JSON.parse(raw);
    const okSingle = bundle.version === 3 && !bundle.essayMode && bundle.criterionDStep1Data;
    const okEssay =
      bundle.version === 3 &&
      bundle.essayMode &&
      Array.isArray(bundle.criterionDEssayParagraphBundles) &&
      bundle.criterionDEssayParagraphBundles.length > 0 &&
      bundle.criterionDEssayParagraphBundles[0]?.criterionDStep1Data;
    if (!bundle || !bundle.version || !(okSingle || okEssay)) {
      throw new Error(
        "Saved Criterion D results are missing or from an older format. Run **Criterion D** again from the dashboard."
      );
    }
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
    return;
  }

  if (bundle.version === 3 && bundle.essayMode) {
    const innerList = bundle.criterionDEssayParagraphBundles;
    if (!Array.isArray(innerList) || innerList.length === 0 || !innerList[0]?.criterionDStep1Data) {
      setError("Saved essay-mode Criterion D results are incomplete.");
      return;
    }
    const panel = document.getElementById("criterionDEssayParaPicker");
    const tbody = document.getElementById("criterionDEssayParaPickerTbody");
    wireCriterionDEssayDetailParagraphPicker(panel, tbody, innerList, bundle);
    return;
  }

  renderCriterionDEssayFinalModeratorPanel(null);
  const step4El = document.getElementById("criterionDStep4Section");
  if (step4El) step4El.hidden = false;
  const pickerEl = document.getElementById("criterionDEssayParaPicker");
  if (pickerEl) pickerEl.hidden = true;
  renderCriterionDDetailBody(bundle);
}

function boot() {
  const page = document.body?.dataset?.page || "dashboard";
  if (page === "criterion-a-detail") {
    initCriterionADetailPage();
  } else if (page === "criterion-b-detail") {
    initCriterionBDetailPage();
  } else if (page === "criterion-c-detail") {
    initCriterionCDetailPage();
  } else if (page === "criterion-d-detail") {
    initCriterionDDetailPage();
  } else {
    initDashboard();
  }
  loadKey();
  loadGeminiModelChoice();
  loadDraftText();
  updateCharCount();
  updateParaCharCount();
  tryRestoreParagraphClassificationRecordAfterDraftLoad();
  if (page === "dashboard") {
    syncDashboardCriterionRunLocks();
  }
}

/**
 * Dashboard only: wipe inputs, persisted drafts, all criterion bundles/scores/tiles,
 * errors, status, and IB overall reveal — does not remove the API key.
 */
function performDashboardFullReset() {
  dashboardClearGeneration += 1;
  skipDashboardLockSync = true;
  try {
    if (typeof setIbOverallModerationLoading === "function") setIbOverallModerationLoading(false);
    setDashboardLoading(false);
    setCriterionBLoading(false, "");
    setCriterionCLoading(false, "");
    setCriterionDLoading(false, "");

    clearCriterionABundle();
    clearCriterionBBundle();
    clearCriterionCBundle();
    clearCriterionDBundle();

    clearCriterionATileDisplay();
    clearCriterionBTileDisplay();
    clearCriterionCTileDisplay();
    clearCriterionDTileDisplay();
    ibOverallScoreRevealed = false;
    if (typeof clearIbOverallModerationRecord === "function") clearIbOverallModerationRecord();
    refreshIbOverallPanel();

    if (sourceText) sourceText.value = "";
    if (studentParagraph) studentParagraph.value = "";
    clearDraftText();
    updateCharCount();
    updateParaCharCount();
    resetParagraphClassificationForDashboard();

    setError("");
    setStatus("");
  } finally {
    skipDashboardLockSync = false;
    syncDashboardCriterionRunLocks();
  }
}

clearBtn?.addEventListener("click", () => {
  const ok = window.confirm(
    "This will clear the source text and your paragraph, all criterion scores, saved analysis for this session, status messages, and errors. Your Gemini API key will stay in this browser.\n\nContinue?"
  );
  if (!ok) return;
  performDashboardFullReset();
});

sourceText?.addEventListener("input", persistDraftSource);
studentParagraph?.addEventListener("input", () => {
  invalidateParagraphClassificationIfStudentTextChanged();
  persistDraftParagraph();
});
apiKeyInput?.addEventListener("change", saveKey);
modelSelect?.addEventListener("change", persistGeminiModelChoice);

copyBtn?.addEventListener("click", async () => {
  const raw = outputSection && outputSection.dataset && outputSection.dataset.rawMarkdown;
  if (!raw) return;
  try {
    await navigator.clipboard.writeText(raw);
    copyBtn.textContent = "Copied";
    setTimeout(() => {
      copyBtn.textContent = "Copy audit (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

copyTopicAuditBtn?.addEventListener("click", async () => {
  const raw = topicArgumentSection && topicArgumentSection.dataset && topicArgumentSection.dataset.rawTopicJson;
  if (!raw) return;
  try {
    await navigator.clipboard.writeText(raw);
    copyTopicAuditBtn.textContent = "Copied";
    setTimeout(() => {
      copyTopicAuditBtn.textContent = "Copy topic audit (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    hideTooltip();
    hideCriterionBTooltip();
    hideCriterionCTooltip();
    hideCriterionDLexTooltip();
    hideCriterionDRegTooltip();
  }
});

document.getElementById("criterionBCopyBtn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionBOutputSection");
  const raw = section && section.dataset && section.dataset.rawCriterionBJson;
  if (!raw) return;
  const btn = document.getElementById("criterionBCopyBtn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy grading (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.getElementById("criterionBCopyStep3Btn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionBSummarySection");
  const raw = section && section.dataset && section.dataset.rawStep3Json;
  if (!raw) return;
  const btn = document.getElementById("criterionBCopyStep3Btn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy step 3 (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.getElementById("criterionBCopyEssayHolisticBtn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionBEssayHolisticSection");
  const raw = section && section.dataset && section.dataset.rawEssayHolisticJson;
  if (!raw) return;
  const btn = document.getElementById("criterionBCopyEssayHolisticBtn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy essay holistic checks (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.getElementById("criterionBCopyFinalExaminerBtn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionBFinalExaminerSection");
  const raw = section && section.dataset && section.dataset.rawFinalExaminerJson;
  if (!raw) return;
  const btn = document.getElementById("criterionBCopyFinalExaminerBtn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy final examiner (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.getElementById("criterionCCopyLoraBtn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionCLoraSection");
  const raw = section && section.dataset && section.dataset.rawCriterionCLoraJson;
  if (!raw) return;
  const btn = document.getElementById("criterionCCopyLoraBtn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy step 1 (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.getElementById("criterionCCopyTangentBtn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionCTangentSection");
  const raw = section && section.dataset && section.dataset.rawCriterionCTangentJson;
  if (!raw) return;
  const btn = document.getElementById("criterionCCopyTangentBtn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy step 2 (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.getElementById("criterionCCopyModeratorBtn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionCModeratorSection");
  const raw = section && section.dataset && section.dataset.rawCriterionCModeratorJson;
  if (!raw) return;
  const btn = document.getElementById("criterionCCopyModeratorBtn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy step 3 (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.getElementById("criterionCCopyEssayHolisticBtn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionCEssayHolisticSection");
  const raw = section && section.dataset && section.dataset.rawCriterionCEssayHolisticJson;
  if (!raw) return;
  const btn = document.getElementById("criterionCCopyEssayHolisticBtn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy essay holistic checks (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.getElementById("criterionCCopyEssayFinalExaminerBtn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionCEssayFinalExaminerSection");
  const raw = section && section.dataset && section.dataset.rawCriterionCEssayFinalExaminerJson;
  if (!raw) return;
  const btn = document.getElementById("criterionCCopyEssayFinalExaminerBtn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy final examiner (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.getElementById("criterionDCopyEssayFinalModeratorBtn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionDEssayFinalModeratorSection");
  const raw = section && section.dataset && section.dataset.rawCriterionDEssayFinalModeratorJson;
  if (!raw) return;
  const btn = document.getElementById("criterionDCopyEssayFinalModeratorBtn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy final moderator (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.getElementById("criterionDCopyStep1Btn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionDStep1Section");
  const raw = section && section.dataset && section.dataset.rawCriterionDStep1Json;
  if (!raw) return;
  const btn = document.getElementById("criterionDCopyStep1Btn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy step 1 (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.getElementById("criterionDCopyStep2Btn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionDStep2Section");
  const raw = section && section.dataset && section.dataset.rawCriterionDStep2Json;
  if (!raw) return;
  const btn = document.getElementById("criterionDCopyStep2Btn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy step 2 (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.getElementById("criterionDCopyStep3Btn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionDStep3Section");
  const raw = section && section.dataset && section.dataset.rawCriterionDStep3Json;
  if (!raw) return;
  const btn = document.getElementById("criterionDCopyStep3Btn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy step 3 (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

document.getElementById("criterionDCopyStep4Btn")?.addEventListener("click", async () => {
  const section = document.getElementById("criterionDStep4Section");
  const raw = section && section.dataset && section.dataset.rawCriterionDStep4Json;
  if (!raw) return;
  const btn = document.getElementById("criterionDCopyStep4Btn");
  try {
    await navigator.clipboard.writeText(raw);
    if (btn) btn.textContent = "Copied";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy step 4 (JSON)";
    }, 2000);
  } catch {
    setError("Could not copy to clipboard.");
  }
});

/**
 * Surface otherwise-silent failures during a grading run so Criterion B / C / D cannot
 * "stop abruptly without error". A thrown error inside the main grading try/catch will
 * still render via setError; this is the safety net for unhandled rejections anywhere else.
 */
window.addEventListener("unhandledrejection", (ev) => {
  const reason = ev && ev.reason;
  const msg = reason instanceof Error ? reason.message : String(reason || "");
  if (!msg) return;
  try {
    setError(`Unexpected error during grading: ${msg}. Check the browser console for details, then run again.`);
  } catch {
    /* ignore */
  }
  try {
    if (typeof setCriterionBLoading === "function") setCriterionBLoading(false, "");
    if (typeof setCriterionCLoading === "function") setCriterionCLoading(false, "");
    if (typeof setCriterionDLoading === "function") setCriterionDLoading(false, "");
    if (typeof endGradingProgressSession === "function") endGradingProgressSession();
  } catch {
    /* ignore */
  }
});

window.addEventListener("error", (ev) => {
  const msg = ev && ev.message ? String(ev.message) : "";
  if (!msg) return;
  try {
    setError(`Unexpected error: ${msg}. Check the browser console for details, then run again.`);
  } catch {
    /* ignore */
  }
});

boot();

