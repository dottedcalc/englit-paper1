
function loadCriterionCBundleRaw() {
  try {
    return localStorage.getItem(CRITERION_C_BUNDLE_KEY);
  } catch {
    return null;
  }
}

/**
 * @param {{ version: number, sourceText: string, studentParagraph: string, criterionCStep1Data: object, criterionCStep1RawJson: string, criterionCStep2Data?: object, criterionCStep2RawJson?: string, criterionCStep3Data?: object, criterionCStep3RawJson?: string, criterionCStep4Data?: object, criterionCStep4RawJson?: string, criterionCStep5Data?: object, criterionCStep5RawJson?: string, finalCriterionCStep1Score?: number | null, finalCriterionCStep2Score?: number | null, finalCriterionCStep3Score?: number | null, finalCriterionCStep4Score?: number | null, finalCriterionCMark?: number | null }} bundle
 */
function saveCriterionCBundle(bundle) {
  try {
    localStorage.setItem(CRITERION_C_BUNDLE_KEY, JSON.stringify(bundle));
  } catch {
    /* ignore */
  }
}

function clearCriterionCBundle() {
  try {
    localStorage.removeItem(CRITERION_C_BUNDLE_KEY);
  } catch {
    /* ignore */
  }
}

function loadCriterionDBundleRaw() {
  try {
    return localStorage.getItem(CRITERION_D_BUNDLE_KEY);
  } catch {
    return null;
  }
}

/**
 * Per-body scores for essay-mode picker rows: syntax, sentence, vocabulary, register — each /5.
 * @param {object | null} inner
 * @returns {[string, string, string, string]}
 */
function criterionDParagraphFourScoreCells(inner) {
  if (!inner || typeof inner !== "object") return ["—", "—", "—", "—"];
  const s1 = inner.criterionDStep1Data;
  const syn = s1 && normalizeCriterionDPhase1OnlyScore(s1.criterionD_phase1_only_score?.score);
  const sent = s1 && normalizeCriterionDPhase2OnlyScore(s1.sentenceRhythmPhase2?.score);
  const voc = normalizeCriterionDAgent2Score(inner.criterionDStep2Data?.criterionD_agent2_score?.score);
  const reg = normalizeCriterionDAgent3Score(inner.criterionDStep3Data?.criterionD_agent3_score?.score);
  const fmt = (n) => (n != null && Number.isFinite(n) ? String(n) : "—");
  return [fmt(syn), fmt(sent), fmt(voc), fmt(reg)];
}

/**
 * Essay-mode parent bundle: whole-essay Criterion D moderator (step 4) + official language rubric.
 * @param {{ criterionDStep4Data?: object, criterionDStep4RawJson?: string } | null} bundle
 */
function renderCriterionDEssayFinalModeratorPanel(bundle) {
  const section = document.getElementById("criterionDEssayFinalModeratorSection");
  const out = document.getElementById("criterionDEssayFinalModeratorOutput");
  if (!section || !out) return;

  const st = bundle?.criterionDStep4Data;
  const grade = st && typeof st === "object" ? st.criterionD_moderator_score : null;
  if (!grade || grade.score == null) {
    section.hidden = true;
    out.innerHTML = "";
    if (section.dataset) delete section.dataset.rawCriterionDEssayFinalModeratorJson;
    return;
  }

  section.hidden = false;
  if (section.dataset) {
    if (bundle.criterionDStep4RawJson) {
      section.dataset.rawCriterionDEssayFinalModeratorJson = bundle.criterionDStep4RawJson;
    } else {
      delete section.dataset.rawCriterionDEssayFinalModeratorJson;
    }
  }

  const sc = normalizeCriterionDFinalModeratorScore(grade.score);
  const disp = sc == null ? "—" : formatCriterionDFinalModeratorDisplay(sc);
  const just = grade.justification != null ? escapeHtml(String(grade.justification)) : "—";
  const rubric = buildCriterionDLanguageRubricTableHtml(sc);

  const html = `<p class="final-grade__mean"><strong>Final mark (IB official descriptor bands):</strong> ${escapeHtml(disp)} / 5</p>
    <p class="criterion-b-holistic__label">Moderator synthesis</p>
    <p class="criterion-b-holistic__just">${just}</p>
    <div class="criterion-d-final-examiner__descriptor-ref">${rubric}</div>`;

  out.innerHTML = window.DOMPurify.sanitize(html, {
    ADD_ATTR: ["class", "scope", "colspan", "aria-label"],
  });
}

/**
 * @param {{ version: 3, essayMode?: boolean, sourceText: string, studentParagraph: string, criterionDStep1Data: object, criterionDStep1RawJson: string, criterionDStep2Data?: object, criterionDStep2RawJson?: string, criterionDStep3Data?: object, criterionDStep3RawJson?: string, criterionDStep4Data?: object, criterionDStep4RawJson?: string, criterionDEssayParagraphBundles?: object[], essayIntro?: string, essayConclusion?: string, essayBodyParagraphs?: string[], finalCriterionDStep1Score?: number | null, finalCriterionDStep2Score?: number | null, finalCriterionDStep3Score?: number | null, finalCriterionDModeratorScore?: number | null }} bundle
 */
function saveCriterionDBundle(bundle) {
  try {
    localStorage.setItem(CRITERION_D_BUNDLE_KEY, JSON.stringify(bundle));
  } catch {
    /* ignore */
  }
}

function clearCriterionDBundle() {
  try {
    localStorage.removeItem(CRITERION_D_BUNDLE_KEY);
  } catch {
    /* ignore */
  }
}

function updateCriterionDTileFromBundle(bundle) {
  const scoreLineFinal = document.getElementById("criterionDTileScoreLineFinal");
  const numElFinal = document.getElementById("criterionDTileScoreNumFinal");
  const capFinal = document.getElementById("criterionDTileScoreCaptionFinal");
  const link = document.getElementById("criterionDTileDetailLink");

  let vFinal = null;
  if (bundle.finalCriterionDModeratorScore != null && Number.isFinite(bundle.finalCriterionDModeratorScore)) {
    vFinal = bundle.finalCriterionDModeratorScore;
  } else if (bundle.criterionDStep4Data?.criterionD_moderator_score) {
    vFinal = normalizeCriterionDFinalModeratorScore(bundle.criterionDStep4Data.criterionD_moderator_score.score);
  }

  if (scoreLineFinal && numElFinal) {
    if (vFinal != null && Number.isFinite(vFinal)) {
      numElFinal.textContent = formatCriterionDFinalModeratorDisplay(vFinal);
      scoreLineFinal.hidden = false;
      if (capFinal) {
        capFinal.hidden = false;
        capFinal.textContent = "Criterion D Moderated Mark";
      }
      fillCriterionTilePerParaScores("criterionDTilePerParaScores", null);
    } else {
      numElFinal.textContent = "";
      scoreLineFinal.hidden = true;
      if (capFinal) {
        capFinal.hidden = true;
        capFinal.textContent = "Criterion D Moderated Mark";
      }
      fillCriterionTilePerParaScores("criterionDTilePerParaScores", null);
    }
  }

  const hasEssaySubs =
    bundle.version === 3 &&
    bundle.essayMode &&
    Array.isArray(bundle.criterionDEssayParagraphBundles) &&
    (bundle.criterionDEssayParagraphBundles.some(
      (sub) =>
        (sub.criterionDStep1Data && typeof sub.criterionDStep1Data === "object") ||
        (sub.criterionDStep2Data && typeof sub.criterionDStep2Data === "object") ||
        (sub.criterionDStep3Data && typeof sub.criterionDStep3Data === "object")
    ) ||
      (bundle.criterionDStep4Data && typeof bundle.criterionDStep4Data === "object"));
  const hasAnyStepData =
    hasEssaySubs ||
    (bundle.criterionDStep1Data && typeof bundle.criterionDStep1Data === "object") ||
    (bundle.criterionDStep2Data && typeof bundle.criterionDStep2Data === "object") ||
    (bundle.criterionDStep3Data && typeof bundle.criterionDStep3Data === "object") ||
    (bundle.criterionDStep4Data && typeof bundle.criterionDStep4Data === "object");

  if (link) {
    const has = (vFinal != null && Number.isFinite(vFinal)) || hasAnyStepData;
    link.hidden = !has;
  }
}

function clearCriterionDTileDisplay() {
  updateCriterionDTileFromBundle({
    version: 3,
    essayMode: false,
    finalCriterionDModeratorScore: null,
    criterionDStep4Data: null,
    finalCriterionDStep1Score: null,
    criterionDStep1Data: null,
    finalCriterionDStep2Score: null,
    criterionDStep2Data: null,
    finalCriterionDStep3Score: null,
    criterionDStep3Data: null,
  });
}

/** When true, dashboard shows composite total + IB band (requires all four criteria scored). */
let ibOverallScoreRevealed = false;

/** Bumped on each confirmed "Clear all" so a run started earlier does not re-save after the workspace was cleared. */
let dashboardClearGeneration = 0;

/**
 * @param {string | null} raw
 * @returns {object | null}
 */
function parseDashboardCriterionBundle(raw) {
  if (!raw) return null;
  try {
    const b = JSON.parse(raw);
    if (!b || typeof b.version !== "number") return null;
    if (b.version === 1 || b.version === 2 || b.version === 3 || b.version === 4) return b;
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {object | null} bundleA
 * @returns {number | null}
 */
function getDashboardCriterionAScore(bundleA) {
  if (!bundleA) return null;
  const v = bundleA.finalAverage;
  if (v == null || !Number.isFinite(v) || v < 0 || v > 5) return null;
  return v;
}

/**
 * @param {object | null} bundleB
 * @returns {number | null}
 */
function getDashboardCriterionBScore(bundleB) {
  if (!bundleB) return null;
  let v = null;
  if (
    bundleB.criterionBFinalExaminer != null &&
    bundleB.criterionBFinalExaminer.score != null &&
    Number.isFinite(Number(bundleB.criterionBFinalExaminer.score))
  ) {
    v = normalizeCriterionBHolisticScore(bundleB.criterionBFinalExaminer.score);
  }
  if ((v == null || !Number.isFinite(v)) && bundleB.finalCriterionBScore != null && Number.isFinite(bundleB.finalCriterionBScore)) {
    v = normalizeCriterionBHolisticScore(bundleB.finalCriterionBScore);
  }
  if ((v == null || !Number.isFinite(v)) && bundleB.criterionBStep3Data) {
    v = normalizeCriterionBHolisticScore(bundleB.criterionBStep3Data.score);
  }
  if ((v == null || !Number.isFinite(v)) && bundleB.criterionBData) {
    v = computeCriterionBMeanScaledTo5(bundleB.criterionBData);
  }
  if (v == null || !Number.isFinite(v) || v < 0 || v > 5) return null;
  return v;
}

/**
 * @param {object | null} bundleC
 * @returns {number | null}
 */
function getDashboardCriterionCScore(bundleC) {
  if (!bundleC) return null;
  const vf = getCriterionCFinalIbMarkFromBundle(bundleC);
  if (vf == null || !Number.isFinite(vf) || vf < 0 || vf > 5) return null;
  return vf;
}

/**
 * @param {object | null} bundleD
 * @returns {number | null}
 */
function getDashboardCriterionDScore(bundleD) {
  if (!bundleD || bundleD.version !== 3) return null;
  let vFinal = null;
  if (bundleD.finalCriterionDModeratorScore != null && Number.isFinite(bundleD.finalCriterionDModeratorScore)) {
    vFinal = bundleD.finalCriterionDModeratorScore;
  } else if (bundleD.criterionDStep4Data?.criterionD_moderator_score) {
    vFinal = normalizeCriterionDFinalModeratorScore(bundleD.criterionDStep4Data.criterionD_moderator_score.score);
  }
  if (vFinal == null || !Number.isFinite(vFinal) || vFinal < 0 || vFinal > 5) return null;
  return vFinal;
}

/**
 * Sum of four criterion marks (each 0–5). Caller ensures all parts are non-null.
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 */
function compositePaper1TotalMarks(a, b, c, d) {
  return a + b + c + d;
}

/**
 * IB Paper 1-style band from total /20 (A+B+C+D).
 * @param {number} total
 * @returns {number | null}
 */
function totalMarksToIbBand(total) {
  const t = Number(total);
  if (!Number.isFinite(t)) return null;
  const x = Math.min(20, Math.max(0, t));
  if (x >= 17) return 7;
  if (x >= 14) return 6;
  if (x >= 12) return 5;
  if (x >= 9) return 4;
  if (x >= 6) return 3;
  if (x >= 3) return 2;
  return 1;
}

/**
 * @param {number | null} x
 */
function formatMarkForDashboard(x) {
  if (x == null || !Number.isFinite(x)) return "—";
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

/**
 * @param {string | null | undefined} s
 * @param {number} maxLen
 */
/** Character caps for IB overall moderation digest fields (aligned with large Gemini JSON output budget). */
const IB_OVERALL_EXAMINER_DIGEST_FIELD_MAX = 8000;
const IB_OVERALL_EXAMINER_DIGEST_SHORT_MAX = 6000;

function truncIbOverallDigestText(s, maxLen) {
  const t = s == null ? "" : String(s).replace(/\s+/g, " ").trim();
  if (!t) return "—";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

/**
 * True when the preliminary mark is a whole integer 0–5 (locked in final moderation).
 * @param {number} n
 */
function ibOverallPreliminaryMarkIsWholeInteger(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return false;
  return Math.abs(x - Math.round(x)) < 1e-6;
}

/**
 * @param {object | null} bundleA
 * @param {object | null} bundleB
 * @param {object | null} bundleC
 * @param {object | null} bundleD
 * @returns {string}
 */
function buildIbOverallExaminerCommentsDigest(bundleA, bundleB, bundleC, bundleD) {
  const lines = ["=== Examiner comments digest (abbreviated) ===", ""];

  if (bundleA?.essayMode && bundleA?.criterionAFinalEssayAssigner && !bundleA.criterionAFinalEssayAssigner.error) {
    const fa = bundleA.criterionAFinalEssayAssigner;
    lines.push("--- Criterion A (whole essay) ---");
    lines.push(truncIbOverallDigestText(fa.examinerReport, IB_OVERALL_EXAMINER_DIGEST_FIELD_MAX));
  } else {
    const g2 = bundleA?.auditData?.criterionA_grade_step2;
    const g3 = bundleA?.topicData?.criterionA_grade_step3;
    lines.push("--- Criterion A (paragraph pipeline) ---");
    lines.push(`Step 2: ${truncIbOverallDigestText(g2?.justification ?? "", IB_OVERALL_EXAMINER_DIGEST_SHORT_MAX)}`);
    lines.push(`Step 3: ${truncIbOverallDigestText(g3?.justification ?? "", IB_OVERALL_EXAMINER_DIGEST_SHORT_MAX)}`);
  }

  const fe = bundleB?.criterionBFinalExaminer;
  lines.push("", "--- Criterion B (final examiner) ---");
  lines.push(truncIbOverallDigestText(fe?.examinerReport, IB_OVERALL_EXAMINER_DIGEST_FIELD_MAX));

  lines.push("", "--- Criterion C ---");
  if (bundleC?.essayMode && bundleC?.criterionCEssayFinalIbExaminer) {
    lines.push(truncIbOverallDigestText(bundleC.criterionCEssayFinalIbExaminer.examinerReport, IB_OVERALL_EXAMINER_DIGEST_FIELD_MAX));
  } else {
    const m = bundleC?.criterionCModeratorData;
    lines.push(
      truncIbOverallDigestText(
        m?.strategicFocusJustification ||
          m?.finalIbMarkJustification ||
          m?.glossCheckNotes ||
          m?.depthCheckNotes ||
          "",
        IB_OVERALL_EXAMINER_DIGEST_FIELD_MAX
      )
    );
  }

  lines.push("", "--- Criterion D (final moderator) ---");
  const dj =
    bundleD?.criterionDStep4Data?.criterionD_moderator_score?.justification ??
    bundleD?.criterionDStep4Data?.criterionD_moderator_score?.examinerSummary;
  lines.push(truncIbOverallDigestText(dj, IB_OVERALL_EXAMINER_DIGEST_FIELD_MAX));

  return lines.join("\n");
}

/**
 * @param {string} fullEssay
 * @param {number} sA
 * @param {number} sB
 * @param {number} sC
 * @param {number} sD
 */
function computeIbOverallModerationFingerprint(fullEssay, sA, sB, sC, sD) {
  const str = String(fullEssay || "");
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  const hx = (h >>> 0).toString(16);
  return `${formatMarkForDashboard(sA)}|${formatMarkForDashboard(sB)}|${formatMarkForDashboard(sC)}|${formatMarkForDashboard(sD)}|${str.length}|${hx}`;
}

/**
 * @returns {object | null}
 */
function parseIbOverallModerationRecordFromStorage() {
  if (typeof loadIbOverallModerationRaw !== "function") return null;
  const raw = loadIbOverallModerationRaw();
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object" || o.version !== 1) return null;
    const p = o.preliminary;
    const a = o.adjusted;
    if (!p || !a || typeof p !== "object" || typeof a !== "object") return null;
    return o;
  } catch {
    return null;
  }
}

/**
 * @param {number} sA
 * @param {number} sB
 * @param {number} sC
 * @param {number} sD
 */
function resolveIbOverallModerationForDisplay(sA, sB, sC, sD) {
  const fullEssay =
    typeof getFullStudentAnalysisTextForIbModeration === "function"
      ? getFullStudentAnalysisTextForIbModeration()
      : studentParagraph?.value.trim() ?? "";
  const fp = computeIbOverallModerationFingerprint(fullEssay, sA, sB, sC, sD);
  const rec = parseIbOverallModerationRecordFromStorage();
  const empty = {
    fingerprint: fp,
    record: null,
    prelimA: sA,
    prelimB: sB,
    prelimC: sC,
    prelimD: sD,
    finalA: sA,
    finalB: sB,
    finalC: sC,
    finalD: sD,
  };
  if (!rec || rec.version !== 1) {
    return empty;
  }
  const p = rec.preliminary;
  const a = rec.adjusted;
  if (!p || !a || typeof p !== "object" || typeof a !== "object") {
    return empty;
  }
  const pA = Number(p.A);
  const pB = Number(p.B);
  const pC = Number(p.C);
  const pD = Number(p.D);
  const aA = Number(a.A);
  const aB = Number(a.B);
  const aC = Number(a.C);
  const aD = Number(a.D);
  if (![pA, pB, pC, pD, aA, aB, aC, aD].every((x) => Number.isFinite(x))) {
    if (typeof clearIbOverallModerationRecord === "function") clearIbOverallModerationRecord();
    return empty;
  }
  return {
    fingerprint: fp,
    record: rec,
    prelimA: pA,
    prelimB: pB,
    prelimC: pC,
    prelimD: pD,
    finalA: aA,
    finalB: aB,
    finalC: aC,
    finalD: aD,
  };
}

const IB_OVERALL_REVEAL_BTN_DEFAULT_LABEL = "Reveal final score";

/**
 * Sync reveal button: primary + enabled when scores are ready to moderate;
 * gray + disabled + "Moderated" after a successful final moderation (until Clear all).
 */
function syncIbOverallRevealBtn() {
  const btn = document.getElementById("ibOverallRevealBtn");
  if (!btn) return;
  if (btn.dataset.ibModerationBusy === "1") return;

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
    btn.textContent = IB_OVERALL_REVEAL_BTN_DEFAULT_LABEL;
    btn.disabled = true;
    btn.hidden = true;
    btn.className = "btn primary ib-overall-reveal-btn";
    btn.removeAttribute("aria-label");
    return;
  }

  const modView = resolveIbOverallModerationForDisplay(sA, sB, sC, sD);
  const moderated = !!(modView.record && ibOverallScoreRevealed);
  if (moderated) {
    btn.textContent = "Moderated";
    btn.disabled = true;
    btn.hidden = false;
    btn.className = "btn ib-overall-reveal-btn ib-overall-reveal-btn--moderated";
    btn.setAttribute(
      "aria-label",
      "Final scores are already moderated for this session. Use Clear all to reset and run again."
    );
    return;
  }

  btn.textContent = IB_OVERALL_REVEAL_BTN_DEFAULT_LABEL;
  btn.disabled = false;
  btn.hidden = false;
  btn.className = "btn primary ib-overall-reveal-btn";
  btn.removeAttribute("aria-label");
}

/**
 * @param {boolean} loading
 */
function setIbOverallModerationLoading(loading) {
  const btn = document.getElementById("ibOverallRevealBtn");
  const lo = document.getElementById("ibOverallModerationLoading");
  if (btn) {
    if (loading) {
      btn.dataset.ibModerationBusy = "1";
      btn.disabled = true;
      btn.hidden = true;
    } else {
      delete btn.dataset.ibModerationBusy;
    }
    btn.setAttribute("aria-busy", loading ? "true" : "false");
  }
  if (lo) {
    lo.hidden = !loading;
    lo.setAttribute("aria-busy", loading ? "true" : "false");
  }
  if (!loading) {
    syncIbOverallRevealBtn();
  }
}

/**
 * @param {number} o Preliminary mark shown with strike when changed.
 * @param {number} a Final moderated mark (red).
 * @param {string} label A–D
 * @returns {string}
 */
function formatIbOverallCriterionCellHtml(o, a, label) {
  const oDisp = formatMarkForDashboard(o);
  const aDisp = formatMarkForDashboard(a);
  const changed = Math.abs(Number(o) - Number(a)) >= 1e-6;
  const marks = changed
    ? `<span class="ib-overall-score-struck"><span class="ib-overall-score-struck__text">${escapeHtml(oDisp)}</span></span><span class="ib-overall-score-final ib-overall-score-final--criterion">${escapeHtml(
        aDisp
      )}</span><span class="ib-overall-criterion-cell__suffix">/5</span>`
    : `<span class="ib-overall-score-final ib-overall-score-final--criterion">${escapeHtml(aDisp)}</span><span class="ib-overall-criterion-cell__suffix">/5</span>`;
  return `<div class="ib-overall-criterion-cell" role="group" aria-label="Criterion ${escapeHtml(label)}">
    <span class="ib-overall-criterion-cell__label">${escapeHtml(label)}</span>
    <div class="ib-overall-criterion-cell__scoreline">${marks}</div>
  </div>`;
}

/**
 * Transparency block: per-criterion and total/band moderation explanations (from final Gemini pass).
 * @param {object | null | undefined} record
 * @returns {string}
 */
function formatIbOverallModerationDecisionsHtml(record) {
  if (!record || typeof record !== "object") return "";
  const rows = [
    ["A", "decisionCriterionA"],
    ["B", "decisionCriterionB"],
    ["C", "decisionCriterionC"],
    ["D", "decisionCriterionD"],
  ];
  const chunks = [];
  for (const [label, key] of rows) {
    const t = record[key] != null ? String(record[key]).trim() : "";
    if (!t) continue;
    chunks.push(
      `<div class="ib-overall-moderation-decision"><span class="ib-overall-moderation-decision__label">Criterion ${escapeHtml(
        label
      )}</span><p class="ib-overall-moderation-decision__text">${escapeHtml(t)}</p></div>`
    );
  }
  const bandT = record.decisionFinalBand != null ? String(record.decisionFinalBand).trim() : "";
  if (bandT) {
    chunks.push(
      `<div class="ib-overall-moderation-decision ib-overall-moderation-decision--band"><span class="ib-overall-moderation-decision__label">Total and IB band</span><p class="ib-overall-moderation-decision__text">${escapeHtml(
        bandT
      )}</p></div>`
    );
  }
  if (!chunks.length) return "";
  return `<section class="ib-overall-moderation-decisions" aria-labelledby="ibOverallModerationDecisionsHeading">
    <h4 class="ib-overall-moderation-decisions__heading" id="ibOverallModerationDecisionsHeading">Moderation decisions</h4>
    <div class="ib-overall-moderation-decisions__list">${chunks.join("")}</div>
  </section>`;
}

/**
 * Dashboard: show “score all first” or Reveal → total /20 + IB band.
 */
function refreshIbOverallPanel() {
  const lockedMsg = document.getElementById("ibOverallLockedMsg");
  const revealWrap = document.getElementById("ibOverallRevealWrap");
  const resultEl = document.getElementById("ibOverallResult");
  const pdfWrap = document.getElementById("ibOverallPdfWrap");
  if (!lockedMsg || !revealWrap || !resultEl) return;

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
    ibOverallScoreRevealed = false;
    if (typeof clearIbOverallModerationRecord === "function") clearIbOverallModerationRecord();
    lockedMsg.hidden = false;
    lockedMsg.textContent = "Score all components first — run Criteria A, B, C, and D.";
    revealWrap.hidden = true;
    resultEl.hidden = true;
    resultEl.innerHTML = "";
    if (pdfWrap) pdfWrap.hidden = true;
    setIbOverallModerationLoading(false);
    return;
  }

  const modView = resolveIbOverallModerationForDisplay(sA, sB, sC, sD);
  if (modView.record) {
    ibOverallScoreRevealed = true;
  } else {
    ibOverallScoreRevealed = false;
  }

  setIbOverallModerationLoading(false);

  lockedMsg.hidden = true;

  if (!ibOverallScoreRevealed) {
    revealWrap.hidden = false;
    resultEl.hidden = true;
    resultEl.innerHTML = "";
    if (pdfWrap) pdfWrap.hidden = true;
    return;
  }

  revealWrap.hidden = false;
  const fA = modView.finalA;
  const fB = modView.finalB;
  const fC = modView.finalC;
  const fD = modView.finalD;
  const total = compositePaper1TotalMarks(fA, fB, fC, fD);
  const band = totalMarksToIbBand(total);
  const dispT = formatMarkForDashboard(total);

  const criteriaRow = `<div class="ib-overall-result__criteria-row">
    ${formatIbOverallCriterionCellHtml(modView.prelimA, fA, "A")}
    ${formatIbOverallCriterionCellHtml(modView.prelimB, fB, "B")}
    ${formatIbOverallCriterionCellHtml(modView.prelimC, fC, "C")}
    ${formatIbOverallCriterionCellHtml(modView.prelimD, fD, "D")}
  </div>`;

  const summaryRow = `<div class="ib-overall-result__summary-row">
    <span class="ib-overall-result__total-inline">Total <strong class="ib-overall-score-final ib-overall-score-final--summary">${escapeHtml(
      dispT
    )}</strong><span class="ib-overall-result__suffix"> / 20</span></span>
    <span class="ib-overall-result__summary-sep" aria-hidden="true">·</span>
    <span class="ib-overall-result__band-inline">IB band <strong class="ib-overall-score-final ib-overall-score-final--band">${escapeHtml(
      band != null ? String(band) : "—"
    )}</strong></span>
  </div>`;

  const decisionsBlock = formatIbOverallModerationDecisionsHtml(modView.record);

  const p1 = modView.record.paragraphWhatWorkedWell != null ? String(modView.record.paragraphWhatWorkedWell).trim() : "";
  const p2 =
    modView.record.paragraphPrioritiesNextBand != null ? String(modView.record.paragraphPrioritiesNextBand).trim() : "";
  const proseBlock =
    p1 || p2
      ? `<div class="ib-overall-moderation-prose">
           ${p1 ? `<p class="ib-overall-moderation-p">${escapeHtml(p1)}</p>` : ""}
           ${p2 ? `<p class="ib-overall-moderation-p">${escapeHtml(p2)}</p>` : ""}
         </div>`
      : "";

  resultEl.hidden = false;
  resultEl.innerHTML = window.DOMPurify.sanitize(
    `<div class="ib-overall-result__inner">
       ${criteriaRow}
       ${summaryRow}
     </div>
     ${decisionsBlock}
     ${proseBlock}`,
    { ADD_ATTR: ["class", "role", "aria-label", "aria-hidden", "aria-busy", "id", "aria-labelledby"] }
  );
  if (pdfWrap) pdfWrap.hidden = false;
}

/** When true, `syncDashboardCriterionRunLocks` is a no-op (used while clearing the workspace). */
let skipDashboardLockSync = false;

const CRITERION_RUN_LOCKED_TITLE =
  "This criterion is already scored. Use Clear all if you need to run it again.";

const CRITERION_RUN_DEFAULT_LABELS = {
  criterionATileRun: "Run Criterion A",
  criterionBTileRun: "Run Criterion B",
  criterionCTileRun: "Run Criterion C",
  criterionDTileRun: "Run Criterion D",
};

/**
 * @param {HTMLButtonElement | null} runBtn
 * @param {HTMLElement | null} spinnerEl
 * @param {boolean} scored
 */
function syncCriterionRunButtonLook(runBtn, spinnerEl, scored) {
  if (!runBtn) return;
  const loading = criterionTileSpinnerIsRunning(spinnerEl);
  const lbl = runBtn.querySelector(".criterion-tile__btn-label");
  const base = CRITERION_RUN_DEFAULT_LABELS[runBtn.id] || "Run";
  if (loading) {
    runBtn.classList.remove("criterion-tile__run--graded");
    if (lbl) lbl.textContent = "Running…";
    return;
  }
  if (scored) {
    runBtn.classList.add("criterion-tile__run--graded");
    if (lbl) lbl.textContent = "Graded";
  } else {
    runBtn.classList.remove("criterion-tile__run--graded");
    if (lbl) lbl.textContent = base;
  }
}

/**
 * @param {object | null} bundle
 */
function bundleHasLockedCriterionAScore(bundle) {
  return !!(bundle && bundle.finalAverage != null && Number.isFinite(bundle.finalAverage));
}

/**
 * @param {object | null} bundle
 */
function bundleHasLockedCriterionBScore(bundle) {
  if (!bundle || !(bundle.version === 1 || (bundle.version === 2 && bundle.essayMode))) return false;
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
  return v != null && Number.isFinite(v);
}

/**
 * @param {object | null} bundle
 */
function bundleHasLockedCriterionCScore(bundle) {
  if (
    !bundle ||
    !(
      bundle.version === 1 ||
      bundle.version === 3 ||
      bundle.version === 4 ||
      (bundle.version === 2 && bundle.essayMode)
    )
  ) {
    return false;
  }
  const vf = getCriterionCFinalIbMarkFromBundle(bundle);
  return vf != null && Number.isFinite(vf);
}

/**
 * @param {object | null} bundle
 */
function bundleHasLockedCriterionDScore(bundle) {
  if (!bundle || bundle.version !== 3) return false;
  let vFinal = null;
  if (bundle.finalCriterionDModeratorScore != null && Number.isFinite(bundle.finalCriterionDModeratorScore)) {
    vFinal = bundle.finalCriterionDModeratorScore;
  } else if (bundle.criterionDStep4Data?.criterionD_moderator_score) {
    vFinal = normalizeCriterionDFinalModeratorScore(bundle.criterionDStep4Data.criterionD_moderator_score.score);
  }
  return vFinal != null && Number.isFinite(vFinal);
}

/**
 * @param {HTMLElement | null} sp
 */
function criterionTileSpinnerIsRunning(sp) {
  return !!(sp && !sp.hidden);
}

/**
 * Disable each criterion run button once that criterion has a saved final/display score, or while its spinner is visible.
 */
function syncDashboardCriterionRunLocks() {
  if (skipDashboardLockSync) return;

  const parseV1 = (raw) => parseDashboardCriterionBundle(raw);

  const bundleA = parseV1(loadCriterionABundleRaw());
  const bundleB = parseV1(loadCriterionBBundleRaw());
  const bundleC = parseV1(loadCriterionCBundleRaw());
  const bundleD = parseV1(loadCriterionDBundleRaw());

  const aScored = bundleHasLockedCriterionAScore(bundleA);
  const bScored = bundleHasLockedCriterionBScore(bundleB);
  const cScored = bundleHasLockedCriterionCScore(bundleC);
  const dScored = bundleHasLockedCriterionDScore(bundleD);

  const cSp = document.getElementById("criterionCTileSpinner");
  const dSp = document.getElementById("criterionDTileSpinner");
  const aRun = criterionTileSpinnerIsRunning(criterionATileSpinner) || aScored;
  const bRun = criterionTileSpinnerIsRunning(criterionBTileSpinner) || bScored;
  const cRun = criterionTileSpinnerIsRunning(cSp) || cScored;
  const dRun = criterionTileSpinnerIsRunning(dSp) || dScored;

  const gateOpen = paragraphFormatCriteriaGateOpen();

  if (criterionATileRun) {
    const spA = criterionTileSpinnerIsRunning(criterionATileSpinner);
    criterionATileRun.disabled = aRun || !gateOpen;
    syncCriterionRunButtonLook(criterionATileRun, criterionATileSpinner, aScored);
    let titleA = "";
    if (!spA) {
      if (aScored) titleA = CRITERION_RUN_LOCKED_TITLE;
      else if (!gateOpen) titleA = CLASSIFY_BEFORE_CRITERIA_TITLE;
    }
    criterionATileRun.title = titleA;
  }
  if (criterionBTileRun) {
    const spB = criterionTileSpinnerIsRunning(criterionBTileSpinner);
    criterionBTileRun.disabled = bRun || !gateOpen;
    syncCriterionRunButtonLook(criterionBTileRun, criterionBTileSpinner, bScored);
    let titleB = "";
    if (!spB) {
      if (bScored) titleB = CRITERION_RUN_LOCKED_TITLE;
      else if (!gateOpen) titleB = CLASSIFY_BEFORE_CRITERIA_TITLE;
    }
    criterionBTileRun.title = titleB;
  }
  if (criterionCTileRun) {
    const spC = criterionTileSpinnerIsRunning(cSp);
    criterionCTileRun.disabled = cRun || !gateOpen;
    syncCriterionRunButtonLook(criterionCTileRun, cSp, cScored);
    let titleC = "";
    if (!spC) {
      if (cScored) titleC = CRITERION_RUN_LOCKED_TITLE;
      else if (!gateOpen) titleC = CLASSIFY_BEFORE_CRITERIA_TITLE;
    }
    criterionCTileRun.title = titleC;
  }
  if (criterionDTileRun) {
    const spD = criterionTileSpinnerIsRunning(dSp);
    criterionDTileRun.disabled = dRun || !gateOpen;
    syncCriterionRunButtonLook(criterionDTileRun, dSp, dScored);
    let titleD = "";
    if (!spD) {
      if (dScored) titleD = CRITERION_RUN_LOCKED_TITLE;
      else if (!gateOpen) titleD = CLASSIFY_BEFORE_CRITERIA_TITLE;
    }
    criterionDTileRun.title = titleD;
  }

  syncClassifyParagraphEssayButtonState();
}

function setCriterionDLoading(loading, statusText) {
  if (criterionDTileRun) {
    criterionDTileRun.disabled = loading;
    if (loading) criterionDTileRun.classList.remove("criterion-tile__run--graded");
  }
  const sp = document.getElementById("criterionDTileSpinner");
  if (sp) sp.hidden = !loading;
  const lbl = document.querySelector("#criterionDTile .criterion-tile__btn-label");
  if (lbl) lbl.textContent = loading ? "Running…" : "Run Criterion D";
  setStatus(loading ? statusText || "" : "");
  if (!loading) syncDashboardCriterionRunLocks();
}

/** @type {Record<string, string>} */
const CRITERION_D_PHASE2_VERDICT_LABELS = {
  HEALTHY_VARIETY: "Healthy variety (no rhythm penalty)",
  MILD_MIXED_ISSUES: "Mild mixed rhythm issues",
  OVERLONG_LITTLE_BREATHING: "Overlong — little breathing room",
  OVERSHORT_CHOPPY: "Too short / choppy",
  MONOTONE_HEAVY_ACADEMIC: "Monotone heavy-academic (low variety)",
};

/**
 * @param {object | null} step1Data
 * @param {string} rawJson
 */
function renderCriterionDStep1Detail(step1Data, rawJson) {
  const section = document.getElementById("criterionDStep1Section");
  const out = document.getElementById("criterionDAgent1Output");
  if (!section || !out) return;

  if (section.dataset && rawJson) {
    section.dataset.rawCriterionDStep1Json = rawJson;
  } else if (section.dataset) {
    delete section.dataset.rawCriterionDStep1Json;
  }

  if (!step1Data || typeof step1Data !== "object") {
    out.innerHTML =
      "<p>Step 1 is not in this bundle. Run <strong>Criterion D</strong> from the dashboard.</p>";
    return;
  }

  const rows = Array.isArray(step1Data.errors) ? step1Data.errors : [];
  const phase1Only = step1Data.criterionD_phase1_only_score || {};
  const p1sc = normalizeCriterionDPhase1OnlyScore(phase1Only.score);

  const tableBody = rows
    .map((row) => {
      const v = row.verbatimFromText != null ? String(row.verbatimFromText) : "—";
      const t = row.typeOfError != null ? String(row.typeOfError) : "—";
      const e = row.onePhraseExplanation != null ? String(row.onePhraseExplanation) : "—";
      const imp = formatCriterionDStep1UnderstandingImpact(row.understandingImpact);
      return `<tr><td><q>${escapeHtml(v)}</q></td><td>${escapeHtml(t)}</td><td>${escapeHtml(imp)}</td><td>${escapeHtml(e)}</td></tr>`;
    })
    .join("");

  const body =
    rows.length > 0
      ? `<table class="criterion-d-error-table">
          <thead><tr><th>Verbatim from text</th><th>Type of error</th><th>Impact on understanding</th><th>One-phrase explanation</th></tr></thead>
          <tbody>${tableBody}</tbody></table>`
      : "<p class=\"criterion-d-muted\">No errors listed under the allowed categories.</p>";

  const ph2 = step1Data.sentenceRhythmPhase2;
  const p1j = phase1Only.justification != null ? String(phase1Only.justification).trim() : "—";
  const p2sc = ph2 && typeof ph2 === "object" ? normalizeCriterionDPhase2OnlyScore(ph2.score) : null;
  let phase2SupplementHtml = "";
  let row2Summary = "";
  if (ph2 && typeof ph2 === "object") {
    const p2just = ph2.justification != null ? String(ph2.justification).trim() : "";
    const vExpl = ph2.explanation != null ? String(ph2.explanation) : "—";
    const vKey = ph2.rhythmVerdict != null ? String(ph2.rhythmVerdict).trim() : "";
    const vLabel = vKey ? CRITERION_D_PHASE2_VERDICT_LABELS[vKey] || vKey : "";
    if (p2sc != null) {
      row2Summary = `<tr><th scope="row">Phase 2 — Sentence structure</th><td>${escapeHtml(String(p2sc))} / 5</td><td class="criterion-d-step1-summary-rationale">${escapeHtml(p2just || "—")}</td></tr>`;
      if (String(vExpl).trim() && String(vExpl).trim() !== "—") {
        phase2SupplementHtml = `<h4 class="criterion-d-subhead criterion-d-subhead--minor">Phase 2 — Structural notes</h4>
          <p class="criterion-d-phase2-expl criterion-d-muted">${escapeHtml(String(vExpl))}</p>`;
      }
    } else if (vLabel) {
      row2Summary = `<tr><th scope="row">Phase 2 — Sentence rhythm</th><td>—</td><td class="criterion-d-step1-summary-rationale">${escapeHtml(
        p2just || String(vExpl).trim() || "—"
      )}</td></tr>`;
      phase2SupplementHtml = `<p class="criterion-d-phase2-verdict criterion-d-muted"><strong>Verdict:</strong> ${escapeHtml(vLabel)}</p>`;
    }
  }

  const summaryHtml = `<h3 class="criterion-d-subhead">Step 1 — Examiner summary</h3>
    <table class="criterion-d-error-table criterion-d-step1-summary-table">
      <thead><tr>
        <th scope="col">Dimension</th>
        <th scope="col">Score / 5</th>
        <th scope="col">Examiner rationale</th>
      </tr></thead>
      <tbody>
        <tr><th scope="row">Phase 1 — Mechanics</th><td>${p1sc != null ? escapeHtml(String(p1sc)) : "—"} / 5</td><td class="criterion-d-step1-summary-rationale">${escapeHtml(p1j)}</td></tr>
        ${row2Summary}
      </tbody>
    </table>
    ${phase2SupplementHtml}`;

  out.innerHTML = window.DOMPurify.sanitize(
    `${body}
     ${summaryHtml}`,
    { ADD_ATTR: ["class", "scope"] }
  );
}

/**
 * @param {object | null} step2Data
 * @param {string} rawJson
 * @param {string} [fullStudentParagraph]
 */
function renderCriterionDStep2Detail(step2Data, rawJson, fullStudentParagraph) {
  const section = document.getElementById("criterionDStep2Section");
  const out = document.getElementById("criterionDAgent2Output");
  if (!section || !out) return;

  hideCriterionDRegTooltip();
  hideCriterionDLexTooltip();

  if (section.dataset && rawJson) {
    section.dataset.rawCriterionDStep2Json = rawJson;
  } else if (section.dataset) {
    delete section.dataset.rawCriterionDStep2Json;
  }

  if (!step2Data || typeof step2Data !== "object") {
    out.innerHTML =
      "<p>Step 2 is not in this bundle. Run <strong>Criterion D</strong> again from the dashboard.</p>";
    return;
  }

  const full = fullStudentParagraph != null ? String(fullStudentParagraph) : "";
  const rows = Array.isArray(step2Data.lexicalRows) ? step2Data.lexicalRows : [];
  const grade = step2Data.criterionD_agent2_score || {};
  const sc = normalizeCriterionDAgent2Score(grade.score);

  const tableBody = rows
    .map((row) => {
      const v = row.verbatimWordOrPhrase != null ? String(row.verbatimWordOrPhrase) : "—";
      const code = normalizeCriterionDLexicalCode(row.indexCode);
      const e = row.onePhraseExplanation != null ? String(row.onePhraseExplanation) : "—";
      return `<tr><td><q>${escapeHtml(v)}</q></td><td>${escapeHtml(code)}</td><td>${escapeHtml(e)}</td></tr>`;
    })
    .join("");

  const tableHtml =
    rows.length > 0
      ? `<table class="criterion-d-error-table criterion-d-lexical-table">
          <thead><tr><th>Verbatim word/phrase</th><th>Index</th><th>One-phrase explanation</th></tr></thead>
          <tbody>${tableBody}</tbody></table>`
      : "<p class=\"criterion-d-muted\">No lexical rows returned.</p>";

  const hlHtml = full.trim()
    ? buildCriterionDLexicalHighlightedHtml(full, rows)
    : "<p class=\"criterion-d-muted\">No student paragraph in bundle for highlights.</p>";

  const gjust = grade.justification != null ? String(grade.justification).trim() : "—";
  const step2SummaryHtml = `<h3 class="criterion-d-subhead">Step 2 — Examiner summary</h3>
    <table class="criterion-d-error-table criterion-d-step1-summary-table">
      <thead><tr>
        <th scope="col">Dimension</th>
        <th scope="col">Score / 5</th>
        <th scope="col">Examiner rationale</th>
      </tr></thead>
      <tbody>
        <tr><th scope="row">Lexical control (Agent 2)</th><td>${sc != null ? escapeHtml(String(sc)) : "—"} / 5</td><td class="criterion-d-step1-summary-rationale">${escapeHtml(gjust)}</td></tr>
      </tbody>
    </table>`;

  out.innerHTML = window.DOMPurify.sanitize(
    `<h3 class="criterion-d-subhead">Highlighted paragraph</h3>
     <p class="output-hint criterion-d-lex-hint">Coloured spans show the sophistication index (student-authored lexis only). Matches inside straight double-quoted passages are not highlighted. Hover or focus a span for code and explanation.</p>
     <div class="criterion-d-highlight-wrap audit-output">${hlHtml}</div>
     <h3 class="criterion-d-subhead">Lexical inventory</h3>
     ${tableHtml}
     ${step2SummaryHtml}`,
    { ADD_ATTR: ["class", "tabindex", "role", "aria-label", "data-d-lex-idx", "title", "scope"] }
  );

  bindCriterionDLexicalInteractions(out, step2Data);
}

/**
 * @param {object | null} step3Data
 * @param {string} rawJson
 * @param {string} [fullStudentParagraph]
 */
function renderCriterionDStep3Detail(step3Data, rawJson, fullStudentParagraph) {
  const section = document.getElementById("criterionDStep3Section");
  const out = document.getElementById("criterionDAgent3Output");
  if (!section || !out) return;

  hideCriterionDLexTooltip();
  hideCriterionDRegTooltip();

  if (section.dataset && rawJson) {
    section.dataset.rawCriterionDStep3Json = rawJson;
  } else if (section.dataset) {
    delete section.dataset.rawCriterionDStep3Json;
  }

  if (!step3Data || typeof step3Data !== "object") {
    out.innerHTML =
      "<p>Step 3 is not in this bundle. Run <strong>Criterion D</strong> again from the dashboard.</p>";
    return;
  }

  const full = fullStudentParagraph != null ? String(fullStudentParagraph) : "";
  const plus = Array.isArray(step3Data.plusRows) ? step3Data.plusRows : [];
  const minus = Array.isArray(step3Data.minusRows) ? step3Data.minusRows : [];
  const grade = step3Data.criterionD_agent3_score || {};
  const sc = normalizeCriterionDAgent3Score(grade.score);

  const { html: hlHtml, metaByFid } = full.trim()
    ? buildCriterionDRegisterHighlightedHtml(full, plus, minus)
    : { html: "<p class=\"criterion-d-muted\">No student paragraph in bundle for highlights.</p>", metaByFid: {} };

  const plusBody = plus
    .map((row) => {
      const v = row.verbatimWordOrPhrase != null ? String(row.verbatimWordOrPhrase) : "—";
      const t = formatCriterionDStep3PlusType(row.plusType);
      const e = row.onePhraseExplanation != null ? String(row.onePhraseExplanation) : "—";
      return `<tr><td><q>${escapeHtml(v)}</q></td><td>${escapeHtml(t)}</td><td>${escapeHtml(e)}</td></tr>`;
    })
    .join("");

  const minusBody = minus
    .map((row) => {
      const v = row.verbatimWordOrPhrase != null ? String(row.verbatimWordOrPhrase) : "—";
      const t = formatCriterionDStep3MinusType(row.minusType);
      const sev = formatCriterionDRegisterMinusSeverity(getCriterionDRegisterMinusSeverityForRow(row));
      const e = row.onePhraseExplanation != null ? String(row.onePhraseExplanation) : "—";
      return `<tr><td><q>${escapeHtml(v)}</q></td><td>${escapeHtml(t)}</td><td>${escapeHtml(sev)}</td><td>${escapeHtml(e)}</td></tr>`;
    })
    .join("");

  const plusTable =
    plus.length > 0
      ? `<table class="criterion-d-error-table criterion-d-register-table criterion-d-register-table--plus">
          <thead><tr><th>Verbatim word/phrase</th><th>Type</th><th>One-phrase explanation</th></tr></thead>
          <tbody>${plusBody}</tbody></table>`
      : "<p class=\"criterion-d-muted\">No PLUS rows returned.</p>";

  const minusTable =
    minus.length > 0
      ? `<table class="criterion-d-error-table criterion-d-register-table criterion-d-register-table--minus">
          <thead><tr><th>Verbatim word/phrase</th><th>Type</th><th>Severity</th><th>One-phrase explanation</th></tr></thead>
          <tbody>${minusBody}</tbody></table>`
      : "<p class=\"criterion-d-muted\">No MINUS rows returned.</p>";

  const rubricHtml = buildCriterionDStep3RegisterRubricTableHtml(sc);
  const gjust = grade.justification != null ? String(grade.justification).trim() : "—";
  const step3SummaryHtml = `<h3 class="criterion-d-subhead">Step 3 — Examiner summary</h3>
    <table class="criterion-d-error-table criterion-d-step1-summary-table">
      <thead><tr>
        <th scope="col">Dimension</th>
        <th scope="col">Score / 5</th>
        <th scope="col">Examiner rationale</th>
      </tr></thead>
      <tbody>
        <tr><th scope="row">Register &amp; protocol (Agent 3)</th><td>${sc != null ? escapeHtml(String(sc)) : "—"} / 5</td><td class="criterion-d-step1-summary-rationale">${escapeHtml(gjust)}</td></tr>
      </tbody>
    </table>`;

  out.innerHTML = window.DOMPurify.sanitize(
    `<h3 class="criterion-d-subhead">Highlighted paragraph</h3>
     <p class="output-hint criterion-d-reg-hint">Green = PLUS strengths. MINUS shades reflect <strong>minusSeverity</strong> (band killer / technical / surface); amber = <strong>DESCRIPTIVE_REGISTER</strong> (overwhelming narrative stance). Hover or focus a span for type, severity, and note.</p>
     <div class="criterion-d-highlight-wrap criterion-d-reg-highlight-wrap audit-output">${hlHtml}</div>
     <h3 class="criterion-d-subhead">PLUSes (strengths)</h3>
     ${plusTable}
     <h3 class="criterion-d-subhead">MINUSes (violations)</h3>
     ${minusTable}
     <h3 class="criterion-d-subhead criterion-d-subhead--minor">Voice &amp; protocol band descriptors (0–5)</h3>
     <p class="output-hint criterion-d-reg-hint">The highlighted row matches the assigned mark when the model score parses cleanly.</p>
     ${rubricHtml}
     ${step3SummaryHtml}`,
    { ADD_ATTR: ["class", "tabindex", "role", "aria-label", "data-d-reg-idx", "title", "scope"] }
  );

  bindCriterionDRegisterInteractions(out, metaByFid);
}

/**
 * @param {object | null} step4Data
 * @param {string} rawJson
 */
function renderCriterionDStep4Detail(step4Data, rawJson) {
  const section = document.getElementById("criterionDStep4Section");
  const out = document.getElementById("criterionDAgent4Output");
  if (!section || !out) return;

  if (section.dataset && rawJson) {
    section.dataset.rawCriterionDStep4Json = rawJson;
  } else if (section.dataset) {
    delete section.dataset.rawCriterionDStep4Json;
  }

  if (!step4Data || typeof step4Data !== "object") {
    out.innerHTML =
      "<p>Step 4 is not in this bundle. Run <strong>Criterion D</strong> again from the dashboard.</p>";
    return;
  }

  const grade = step4Data.criterionD_moderator_score || {};
  const sc = normalizeCriterionDFinalModeratorScore(grade.score);
  const disp = formatCriterionDFinalModeratorDisplay(sc);

  out.innerHTML = window.DOMPurify.sanitize(
    `<p class="criterion-d-final-score criterion-d-final-score--mod"><strong>Final Criterion D mark:</strong> ${escapeHtml(disp)} / 5</p>
     <p class="criterion-d-final-just criterion-d-final-just--mod">${escapeHtml(grade.justification != null ? String(grade.justification) : "—")}</p>`,
    { ADD_ATTR: ["class"] }
  );
}

/**
 * @returns {Promise<{ step1Data: object, step1Raw: string }>}
 */
async function runCriterionDStep1Pipeline(key, src, para) {
  setStatus("Criterion D step 1: Language mechanics…");
  setGradingStepLine("Criterion D — step 1/4: Language mechanics");
  const prompt = buildCriterionDStep1Message(src, para);
  let step1Raw;
  try {
    step1Raw = await callGemini(key, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_D_STEP1_SCHEMA,
    });
  } catch (firstErr) {
    try {
      step1Raw = await callGemini(key, prompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }

  let step1Data;
  try {
    step1Data = parseModelJsonObject(step1Raw);
  } catch {
    throw new Error("Criterion D step 1 did not return valid JSON. Try again.");
  }

  const ph2 = step1Data && step1Data.sentenceRhythmPhase2;
  if (
    !step1Data ||
    typeof step1Data !== "object" ||
    !Array.isArray(step1Data.errors) ||
    !ph2 ||
    typeof ph2 !== "object" ||
    typeof ph2.justification !== "string" ||
    !String(ph2.justification).trim() ||
    typeof ph2.explanation !== "string" ||
    !String(ph2.explanation).trim() ||
    !step1Data.criterionD_phase1_only_score ||
    typeof step1Data.criterionD_phase1_only_score !== "object"
  ) {
    throw new Error("Invalid Criterion D step 1 structure returned.");
  }

  const errs = step1Data.errors;
  for (let i = 0; i < errs.length; i++) {
    const row = errs[i];
    if (!row || typeof row !== "object") {
      throw new Error("Invalid Criterion D step 1 structure returned.");
    }
    const imp = normalizeCriterionDStep1UnderstandingImpactKey(row.understandingImpact);
    if (!imp) {
      throw new Error(
        "Invalid Criterion D step 1: each error must include understandingImpact (negligible | awkward | might hinder understanding | hinders understanding)."
      );
    }
    errs[i] = { ...row, understandingImpact: imp };
  }

  const p1 = step1Data.criterionD_phase1_only_score;
  const p1n = normalizeCriterionDPhase1OnlyScore(p1 && p1.score);
  if (p1 && p1n != null) {
    step1Data.criterionD_phase1_only_score = { ...p1, score: p1n };
  } else {
    throw new Error("Criterion D step 1: criterionD_phase1_only_score must be an integer 0–5.");
  }

  const p2n = normalizeCriterionDPhase2OnlyScore(ph2 && ph2.score);
  if (p2n != null) {
    step1Data.sentenceRhythmPhase2 = { ...ph2, score: p2n };
  } else {
    throw new Error("Criterion D step 1: sentenceRhythmPhase2.score must be an integer 0–5.");
  }

  return { step1Data, step1Raw };
}

/**
 * @returns {Promise<{ step2Data: object, step2Raw: string }>}
 */
async function runCriterionDStep2Pipeline(key, src, para) {
  setStatus("Criterion D step 2: Lexical architect…");
  setGradingStepLine("Criterion D — step 2/4: Lexical architect");
  const prompt = buildCriterionDStep2Message(src, para);
  let step2Raw;
  try {
    step2Raw = await callGemini(key, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_D_STEP2_SCHEMA,
    });
  } catch (firstErr) {
    try {
      step2Raw = await callGemini(key, prompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }

  let step2Data;
  try {
    step2Data = parseModelJsonObject(step2Raw);
  } catch {
    throw new Error("Criterion D step 2 did not return valid JSON. Try again.");
  }

  if (
    !step2Data ||
    typeof step2Data !== "object" ||
    !Array.isArray(step2Data.lexicalRows) ||
    !step2Data.criterionD_agent2_score ||
    typeof step2Data.criterionD_agent2_score !== "object"
  ) {
    throw new Error("Invalid Criterion D step 2 structure returned.");
  }

  const g2 = step2Data.criterionD_agent2_score;
  const sn2 = normalizeCriterionDAgent2Score(g2 && g2.score);
  if (g2 && sn2 != null) {
    step2Data.criterionD_agent2_score = { ...g2, score: sn2 };
  } else {
    throw new Error("Criterion D step 2: criterionD_agent2_score must be an integer 0–5.");
  }

  return { step2Data, step2Raw };
}

/**
 * @returns {Promise<{ step3Data: object, step3Raw: string }>}
 */
async function runCriterionDStep3Pipeline(key, src, para) {
  setStatus("Criterion D step 3: Register & protocol…");
  setGradingStepLine("Criterion D — step 3/4: Register & protocol");
  const prompt = buildCriterionDStep3Message(src, para);
  let step3Raw;
  try {
    step3Raw = await callGemini(key, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_D_STEP3_SCHEMA,
    });
  } catch (firstErr) {
    try {
      step3Raw = await callGemini(key, prompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }

  let step3Data;
  try {
    step3Data = parseModelJsonObject(step3Raw);
  } catch {
    throw new Error("Criterion D step 3 did not return valid JSON. Try again.");
  }

  if (
    !step3Data ||
    typeof step3Data !== "object" ||
    !Array.isArray(step3Data.plusRows) ||
    !Array.isArray(step3Data.minusRows) ||
    !step3Data.criterionD_agent3_score ||
    typeof step3Data.criterionD_agent3_score !== "object"
  ) {
    throw new Error("Invalid Criterion D step 3 structure returned.");
  }

  const g3 = step3Data.criterionD_agent3_score;
  const sn3 = normalizeCriterionDAgent3Score(g3 && g3.score);
  if (g3 && sn3 == null) {
    throw new Error("Criterion D step 3: criterionD_agent3_score.score must be an integer 0–5.");
  }
  if (g3 && sn3 != null) {
    step3Data.criterionD_agent3_score = { ...g3, score: sn3 };
  }

  return { step3Data, step3Raw };
}

/**
 * @returns {Promise<{ step4Data: object, step4Raw: string }>}
 */
async function runCriterionDStep4Pipeline(key, evidence, contextParagraph) {
  setStatus("Criterion D step 4: Final moderator…");
  setGradingStepLine("Criterion D — step 4/4: Final moderator");
  const prompt = buildCriterionDStep4Message(evidence, contextParagraph);
  let step4Raw;
  try {
    step4Raw = await callGemini(key, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_D_STEP4_SCHEMA,
    });
  } catch (firstErr) {
    try {
      step4Raw = await callGemini(key, prompt, {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
        responseMimeType: "application/json",
      });
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }

  let step4Data;
  try {
    step4Data = parseModelJsonObject(step4Raw);
  } catch {
    throw new Error("Criterion D step 4 did not return valid JSON. Try again.");
  }

  if (
    !step4Data ||
    typeof step4Data !== "object" ||
    !step4Data.criterionD_moderator_score ||
    typeof step4Data.criterionD_moderator_score !== "object"
  ) {
    throw new Error("Invalid Criterion D step 4 structure returned.");
  }

  const gm = step4Data.criterionD_moderator_score;
  const sn = normalizeCriterionDFinalModeratorScore(gm && gm.score);
  if (sn == null) {
    throw new Error("Criterion D moderator returned an unusable score (must be 0–5 in half-point steps).");
  }
  step4Data.criterionD_moderator_score = { ...gm, score: sn };

  return { step4Data, step4Raw };
}

async function runCriterionD() {
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

  setCriterionDLoading(true, "Criterion D step 1: Language mechanics…");

  const runGen = dashboardClearGeneration;
  try {
    if (!isEssay) {
      const { step1Data, step1Raw } = await runCriterionDStep1Pipeline(key, src, fullText);
      setCriterionDLoading(true, "Criterion D step 2: Lexical architect…");
      const { step2Data, step2Raw } = await runCriterionDStep2Pipeline(key, src, fullText);
      setCriterionDLoading(true, "Criterion D step 3: Register & protocol…");
      const { step3Data, step3Raw } = await runCriterionDStep3Pipeline(key, src, fullText);
      setCriterionDLoading(true, "Criterion D step 4: Final moderator…");
      const modDigest = buildCriterionDModeratorEvidenceDigest("Analysis paragraph", step1Data, step2Data, step3Data);
      const { step4Data, step4Raw } = await runCriterionDStep4Pipeline(
        key,
        { kind: "single", bodies: [modDigest] },
        fullText
      );
      const finalCriterionDStep1Score = normalizeCriterionDPhase1OnlyScore(
        step1Data.criterionD_phase1_only_score && step1Data.criterionD_phase1_only_score.score
      );
      const finalCriterionDStep2Score = normalizeCriterionDAgent2Score(
        step2Data.criterionD_agent2_score && step2Data.criterionD_agent2_score.score
      );
      const finalCriterionDStep3Score = normalizeCriterionDAgent3Score(
        step3Data.criterionD_agent3_score && step3Data.criterionD_agent3_score.score
      );
      const finalCriterionDModeratorScore = normalizeCriterionDFinalModeratorScore(
        step4Data.criterionD_moderator_score && step4Data.criterionD_moderator_score.score
      );
      const bundle = {
        version: 3,
        essayMode: false,
        sourceText: src,
        studentParagraph: fullText,
        criterionDStep1Data: step1Data,
        criterionDStep1RawJson: step1Raw,
        criterionDStep2Data: step2Data,
        criterionDStep2RawJson: step2Raw,
        criterionDStep3Data: step3Data,
        criterionDStep3RawJson: step3Raw,
        criterionDStep4Data: step4Data,
        criterionDStep4RawJson: step4Raw,
        finalCriterionDStep1Score,
        finalCriterionDStep2Score,
        finalCriterionDStep3Score,
        finalCriterionDModeratorScore,
      };
      if (runGen !== dashboardClearGeneration) return;
      saveCriterionDBundle(bundle);
      updateCriterionDTileFromBundle(bundle);
      refreshIbOverallPanel();
      return;
    }

    const { essayIntro, essayConclusion, essayBodyParagraphs } = getEssayMetaFromClassificationRecord();
    const per = [];
    for (let i = 0; i < bodies.length; i++) {
      const p = bodies[i];
      setCriterionDLoading(true, `Criterion D: body ${i + 1}/${bodies.length} — step 1…`);
      setGradingStepLine(`Criterion D — body ${i + 1}/${bodies.length} (steps 1–3)`);
      const { step1Data, step1Raw } = await runCriterionDStep1Pipeline(key, src, p);
      setCriterionDLoading(true, `Criterion D: body ${i + 1}/${bodies.length} — step 2…`);
      const { step2Data, step2Raw } = await runCriterionDStep2Pipeline(key, src, p);
      setCriterionDLoading(true, `Criterion D: body ${i + 1}/${bodies.length} — step 3…`);
      const { step3Data, step3Raw } = await runCriterionDStep3Pipeline(key, src, p);
      const finalCriterionDStep1Score = normalizeCriterionDPhase1OnlyScore(
        step1Data.criterionD_phase1_only_score && step1Data.criterionD_phase1_only_score.score
      );
      const finalCriterionDStep2Score = normalizeCriterionDAgent2Score(
        step2Data.criterionD_agent2_score && step2Data.criterionD_agent2_score.score
      );
      const finalCriterionDStep3Score = normalizeCriterionDAgent3Score(
        step3Data.criterionD_agent3_score && step3Data.criterionD_agent3_score.score
      );
      const inner = {
        version: 3,
        essayMode: false,
        sourceText: src,
        studentParagraph: p,
        criterionDStep1Data: step1Data,
        criterionDStep1RawJson: step1Raw,
        criterionDStep2Data: step2Data,
        criterionDStep2RawJson: step2Raw,
        criterionDStep3Data: step3Data,
        criterionDStep3RawJson: step3Raw,
        criterionDStep4Data: null,
        criterionDStep4RawJson: null,
        finalCriterionDStep1Score,
        finalCriterionDStep2Score,
        finalCriterionDStep3Score,
        finalCriterionDModeratorScore: null,
      };
      per.push(inner);
      if (runGen !== dashboardClearGeneration) return;
    }
    const modBodies = per.map((inner, i) =>
      buildCriterionDModeratorEvidenceDigest(
        `Body paragraph ${i + 1} of ${per.length}`,
        inner.criterionDStep1Data,
        inner.criterionDStep2Data,
        inner.criterionDStep3Data
      )
    );
    setCriterionDLoading(true, "Criterion D step 4: Whole-essay final moderator…");
    setGradingStepLine("Criterion D — step 4/4: Final moderator (all body paragraphs)");
    const { step4Data, step4Raw } = await runCriterionDStep4Pipeline(
      key,
      { kind: "essay", bodies: modBodies },
      fullText
    );
    const finalCriterionDModeratorScoreAgg = normalizeCriterionDFinalModeratorScore(
      step4Data.criterionD_moderator_score && step4Data.criterionD_moderator_score.score
    );
    const bundle = {
      version: 3,
      essayMode: true,
      sourceText: src,
      studentParagraph: fullText,
      essayIntro,
      essayConclusion,
      essayBodyParagraphs,
      criterionDEssayParagraphBundles: per,
      criterionDStep4Data: step4Data,
      criterionDStep4RawJson: step4Raw,
      finalCriterionDModeratorScore: finalCriterionDModeratorScoreAgg,
    };
    saveCriterionDBundle(bundle);
    updateCriterionDTileFromBundle(bundle);
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
    setCriterionDLoading(false, "");
    setStatus("");
  }
}
