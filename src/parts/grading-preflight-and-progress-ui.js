/**
 * Preflight: estimated Gemini request count + model, then non-cancellable progress while a criterion runs.
 */

/** @type {{ criterion: string, expectedCalls: number, stepLabel: string, completed: number } | null} */
let gradingProgressSession = null;

/** Pause before closing the overlay after a failed run so the in-overlay error is readable. */
const GRADING_OVERLAY_ERROR_PAUSE_MS = 2400;

function shouldDeferGradingErrorToPreflight() {
  return gradingProgressSession != null;
}

/**
 * @param {string} message
 */
function setGradingOverlayError(message) {
  const el = document.getElementById("gradingProgressError");
  if (!el) return;
  const m = String(message || "").trim();
  if (!m) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = m;
}

function clearGradingOverlayError() {
  setGradingOverlayError("");
}

function gradingIsEssayModeForEstimate() {
  const fullText = studentParagraph?.value.trim() ?? "";
  return !!(
    paragraphClassificationRecord &&
    paragraphClassificationRecord.text === fullText &&
    paragraphClassificationRecord.kind === "essay" &&
    paragraphClassificationRecord.essayParts
  );
}

/**
 * @param {"A" | "B" | "C" | "D"} criterion
 * @returns {{ expectedCalls: number; bodyCount: number; isEssay: boolean; title: string } | null}
 */
function computeGradingGeminiEstimate(criterion) {
  const bodies = getEssayBodyParagraphsForGrading();
  if (!bodies || bodies.length === 0) return null;
  const n = bodies.length;
  const isEssay = gradingIsEssayModeForEstimate();
  let expectedCalls = 0;
  let title = "";
  switch (criterion) {
    case "A":
      expectedCalls = isEssay ? 4 + 3 * n : 4;
      title = isEssay ? `Criterion A — essay (${n} body paragraph${n === 1 ? "" : "s"})` : "Criterion A — single paragraph";
      break;
    case "B":
      // Shared benchmark (1) + per body: Step 2 + Step 3 (2 each) + whole-essay shifts/genre (1) + final IB examiner (1).
      // Single paragraph: same pipeline without essay holistics → benchmark + grade + step-3 holistic + final examiner = 4.
      expectedCalls = isEssay ? 3 + 2 * n : 4;
      title = isEssay ? `Criterion B — essay (${n} body paragraph${n === 1 ? "" : "s"})` : "Criterion B — single paragraph";
      break;
    case "C":
      // Per body: LORA + tangent + moderator (3 each); essay mode adds 3 whole-essay holistics + final IB examiner moderator (1).
      expectedCalls = isEssay ? 3 * n + 4 : 3;
      title = isEssay ? `Criterion C — essay (${n} body paragraph${n === 1 ? "" : "s"})` : "Criterion C — single paragraph";
      break;
    case "D":
      // Per body: steps 1–3 (3 calls each); essay adds one whole-essay step 4 moderator. Single: 1×(1+2+3+4) = 4.
      expectedCalls = isEssay ? 3 * n + 1 : 4;
      title = isEssay ? `Criterion D — essay (${n} body paragraph${n === 1 ? "" : "s"})` : "Criterion D — single paragraph";
      break;
    default:
      return null;
  }
  return { expectedCalls, bodyCount: n, isEssay, title };
}

function beginGradingProgressSession(criterion, expectedCalls) {
  clearGradingOverlayError();
  if (typeof resetGradingGeminiSessionCounters === "function") {
    resetGradingGeminiSessionCounters();
  }
  gradingProgressSession = {
    criterion,
    expectedCalls,
    completed: 0,
    stepLabel: "Starting…",
  };
  const backdrop = document.getElementById("gradingProgressBackdrop");
  if (backdrop) {
    backdrop.hidden = false;
    backdrop.setAttribute("aria-hidden", "false");
  }
  updateGradingProgressDom();
}

function endGradingProgressSession() {
  gradingProgressSession = null;
  clearGradingOverlayError();
  const backdrop = document.getElementById("gradingProgressBackdrop");
  if (backdrop) {
    backdrop.hidden = true;
    backdrop.setAttribute("aria-hidden", "true");
  }
}

/**
 * @param {string} text
 */
function setGradingStepLine(text) {
  if (!gradingProgressSession) return;
  gradingProgressSession.stepLabel = String(text || "").trim() || "…";
  updateGradingProgressDom();
}

function notifyGradingGeminiRequestSent() {
  if (!gradingProgressSession) return;
  gradingProgressSession.completed += 1;
  updateGradingProgressDom();
}

/** True while a dashboard grading run has the progress overlay active (after confirm, until run ends). */
function isGradingProgressSessionActive() {
  return gradingProgressSession != null;
}

function updateGradingProgressDom() {
  const backdrop = document.getElementById("gradingProgressBackdrop");
  if (!backdrop || backdrop.hidden || !gradingProgressSession) return;
  const s = gradingProgressSession;
  const max = Math.max(s.expectedCalls, s.completed, 1);
  const pct = Math.min(100, Math.round((s.completed / max) * 100));
  const bar = document.getElementById("gradingProgressBarFill");
  const stepEl = document.getElementById("gradingProgressStep");
  const countEl = document.getElementById("gradingProgressCount");
  const critEl = document.getElementById("gradingProgressCriterion");
  if (bar) bar.style.width = `${pct}%`;
  if (stepEl) stepEl.textContent = s.stepLabel;
  if (countEl)
    countEl.textContent = `Check ${s.completed} / ${max} (estimated minimum before run: ${s.expectedCalls} Gemini requests)`;
  if (critEl) critEl.textContent = `Running: Criterion ${s.criterion}`;
}

/**
 * @param {"A"|"B"|"C"|"D"} criterion
 * @param {() => Promise<void>} runnerAsyncFn
 */
async function executeCriterionRunWithPreflight(criterion, runnerAsyncFn) {
  const estimate = computeGradingGeminiEstimate(criterion);
  if (!estimate) {
    await runnerAsyncFn();
    return;
  }
  const modelId = getSelectedGeminiModelId();
  const ok = await openGradingConfirmDialog(criterion, estimate, modelId);
  if (!ok) return;
  beginGradingProgressSession(criterion, estimate.expectedCalls);
  let runErrorMsg = null;
  try {
    await runnerAsyncFn();
  } catch (e) {
    runErrorMsg =
      e instanceof Error
        ? e.message
        : e == null
          ? `Criterion ${criterion} run failed unexpectedly with no error details.`
          : String(e);
    runErrorMsg = (runErrorMsg || "").trim() || `Criterion ${criterion} run failed unexpectedly.`;
    setGradingOverlayError(runErrorMsg);
    if (GRADING_OVERLAY_ERROR_PAUSE_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, GRADING_OVERLAY_ERROR_PAUSE_MS));
    }
  } finally {
    endGradingProgressSession();
    if (runErrorMsg && typeof setError === "function") {
      setError(runErrorMsg);
    }
  }
}

/**
 * @param {"A"|"B"|"C"|"D"} criterion
 * @param {{ expectedCalls: number; bodyCount: number; isEssay: boolean; title: string }} estimate
 * @param {string} modelId
 * @returns {Promise<boolean>}
 */
function openGradingConfirmDialog(criterion, estimate, modelId) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById("gradingConfirmBackdrop");
    const body = document.getElementById("gradingConfirmBody");
    const yes = document.getElementById("gradingConfirmYes");
    const no = document.getElementById("gradingConfirmNo");
    if (!backdrop || !body || !yes || !no) {
      resolve(true);
      return;
    }

    const titleEl = document.getElementById("gradingConfirmTitle");
    if (titleEl) {
      titleEl.textContent = `Run Grading? (Criteria ${criterion})`;
    }

    const n = estimate.expectedCalls;
    const html = `<div class="grading-confirm-dialog__lead">
<p class="grading-confirm-dialog__lead-line">This run uses the <strong>${escapeHtml(modelId)}</strong> model in your selector.</p>
<p class="grading-confirm-dialog__lead-line">The estimated Gemini API requests is <span class="grading-confirm-dialog__request-count">${escapeHtml(String(n))}</span>.</p>
</div>
<p class="grading-confirm-dialog__retry-note">If a step hits a recoverable issue, the app may <strong>retry that step once</strong>, which can add extra requests.</p>
<p class="grading-confirm-dialog__fine-print">Usage and rate limits depend on your Google AI / Gemini API plan. If you exceed quota or account limits, the request can fail with an error. After you confirm, grading runs to completion. There is no cancel button mid-run. If the API fails repeatedly in a row, grading stops and shows the error.</p>`;

    body.innerHTML = window.DOMPurify.sanitize(html, { ADD_ATTR: ["class"] });

    const done = (v) => {
      yes.removeEventListener("click", onYes);
      no.removeEventListener("click", onNo);
      backdrop.removeEventListener("click", onBackdrop);
      window.removeEventListener("keydown", onKey);
      backdrop.hidden = true;
      backdrop.setAttribute("aria-hidden", "true");
      resolve(v);
    };
    const onYes = () => done(true);
    const onNo = () => done(false);
    const onBackdrop = (ev) => {
      if (ev.target === backdrop) done(false);
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") done(false);
    };

    yes.addEventListener("click", onYes);
    no.addEventListener("click", onNo);
    backdrop.addEventListener("click", onBackdrop);
    window.addEventListener("keydown", onKey);

    backdrop.hidden = false;
    backdrop.setAttribute("aria-hidden", "false");
    yes.focus();
  });
}
