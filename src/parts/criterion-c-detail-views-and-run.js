/**
 * @param {object} loraData
 * @param {string} rawJson
 * @param {string} [fullStudentParagraph]
 */
function renderCriterionCLoraDetail(loraData, rawJson, fullStudentParagraph) {
  const section = document.getElementById("criterionCLoraSection");
  const outMain = document.getElementById("criterionCLoraOutput");
  const outMeta = document.getElementById("criterionCLoraMetaOutput");
  if (!section || !outMain) return;

  if (section.dataset && rawJson) {
    section.dataset.rawCriterionCLoraJson = rawJson;
  } else if (section.dataset) {
    delete section.dataset.rawCriterionCLoraJson;
  }

  if (!loraData || typeof loraData !== "object") {
    outMain.innerHTML =
      "<p>Line of Reasoning Auditor results are missing. Run <strong>Criterion C</strong> from the dashboard.</p>";
    if (outMeta) outMeta.innerHTML = "";
    return;
  }

  const paras = Array.isArray(loraData.bodyParagraphs) ? loraData.bodyParagraphs : [];
  const blocks = [];

  for (const p of paras) {
    const pIdx = p.paragraphIndex != null ? p.paragraphIndex : 0;
    const chunkRows = Array.isArray(p.phase1ChunkRows) ? p.phase1ChunkRows : [];
    const hasNewPhaseFormat = chunkRows.length > 0;

    let phase1Body = "";
    if (hasNewPhaseFormat) {
      const trs = chunkRows
        .map((r) => {
          const cn = r.chunkNumber != null ? String(r.chunkNumber) : "—";
          const vt = r.studentTextVerbatim != null ? String(r.studentTextVerbatim) : "—";
          const core = r.corePremiseOrArgumentOneSentence != null ? String(r.corePremiseOrArgumentOneSentence) : "—";
          const snd = r.soundOrNonSequitur != null ? String(r.soundOrNonSequitur) : "—";
          const piv = r.pivotOrProgressionFromPrevious != null ? String(r.pivotOrProgressionFromPrevious) : "—";
          return `<tr>
            <td>${escapeHtml(cn)}</td>
            <td><q>${escapeHtml(vt)}</q></td>
            <td>${escapeHtml(core)}</td>
            <td>${escapeHtml(snd)}</td>
            <td>${escapeHtml(piv)}</td>
          </tr>`;
        })
        .join("");
      phase1Body = `<div class="criterion-c-lora-table-wrap" role="region" aria-label="Phase 1 chunk table">
          <table class="criterion-c-lora-table">
            <thead>
              <tr>
                <th scope="col">Chunk No.</th>
                <th scope="col">Student text verbatim</th>
                <th scope="col">Core premise or argument (one sentence)</th>
                <th scope="col">Sound or non-sequitur</th>
                <th scope="col">Pivot vs progression from last</th>
              </tr>
            </thead>
            <tbody>${trs}</tbody>
          </table>
        </div>
        <h4 class="criterion-c-subhead">Clarity of shift</h4>
        <p>${escapeHtml(p.phase1ClarityOfShifts != null ? String(p.phase1ClarityOfShifts) : "—")}</p>
        <h4 class="criterion-c-subhead">Pivot note</h4>
        <p>${escapeHtml(p.phase1PivotNote != null ? String(p.phase1PivotNote) : "—")}</p>`;
    } else {
      const steps = Array.isArray(p.reasoningSteps) ? p.reasoningSteps : [];
      const stepRows = steps
        .map((row, i) => {
          const lab = row.stepLabel != null ? String(row.stepLabel) : `Step ${i + 1}`;
          const verb = row.studentTextVerbatim != null ? String(row.studentTextVerbatim) : "—";
          const qv = String(row.quoteVsParaphraseTag || "").trim().toUpperCase() || "—";
          const why = row.whySingleSection != null ? String(row.whySingleSection) : "—";
          const stl = row.stepToLogicLine != null ? String(row.stepToLogicLine) : "—";
          const fault = row.faultOrNonSequiturNote != null ? String(row.faultOrNonSequiturNote) : "—";
          return `<li class="criterion-c-lora__step">
          <p class="criterion-c-lora__step-label"><strong>${escapeHtml(lab)}</strong> <span class="criterion-c-lora__qv">(${escapeHtml(qv)})</span></p>
          <p class="criterion-c-lora__verbatim"><strong>Verbatim:</strong> <q>${escapeHtml(verb)}</q></p>
          <p class="criterion-c-lora__why"><strong>Why one section:</strong> ${escapeHtml(why)}</p>
          <p class="criterion-c-lora__logic"><strong>Step → Logic:</strong> ${escapeHtml(stl)}</p>
          <p class="criterion-c-lora__fault"><strong>Fault / non sequitur:</strong> ${escapeHtml(fault)}</p>
        </li>`;
        })
        .join("");
      const shiftNotes = p.shiftClarityNotes != null ? String(p.shiftClarityNotes) : "—";
      phase1Body = `<h4 class="criterion-c-subhead">Line of reasoning (legacy format)</h4>
        <ol class="criterion-c-lora__steps">${stepRows || "<li>—</li>"}</ol>
        <h4 class="criterion-c-subhead">Clarity of shifts</h4>
        <p>${escapeHtml(shiftNotes)}</p>`;
    }

    const cl = normalizeCriterionCLoraTier123(p.lineOfReasoningClarityScore);
    const th = normalizeCriterionCLoraTier123(p.thematicConsistencyScore);
    const clStars = hasNewPhaseFormat
      ? p.phase1ScoreStars != null
        ? String(p.phase1ScoreStars).trim()
        : criterionCLoraTier123ToStarBand(cl)
      : criterionCLoraTier123ToStarBand(cl);
    const thStars = hasNewPhaseFormat
      ? p.phase2ScoreStars != null
        ? String(p.phase2ScoreStars).trim()
        : criterionCLoraTier123ToStarBand(th)
      : criterionCLoraTier123ToStarBand(th);
    const clJust = hasNewPhaseFormat
      ? p.phase1ScoreReasoning != null
        ? String(p.phase1ScoreReasoning)
        : p.lineOfReasoningClarityJustification != null
          ? String(p.lineOfReasoningClarityJustification)
          : "—"
      : p.lineOfReasoningClarityJustification != null
        ? String(p.lineOfReasoningClarityJustification)
        : "—";
    const thJust = hasNewPhaseFormat
      ? p.phase2ScoreReasoning != null
        ? String(p.phase2ScoreReasoning)
        : p.thematicConsistencyJustification != null
          ? String(p.thematicConsistencyJustification)
          : "—"
      : p.thematicConsistencyJustification != null
        ? String(p.thematicConsistencyJustification)
        : "—";

    const ts = p.topicSentenceVerbatim != null ? String(p.topicSentenceVerbatim) : "—";
    const cs = p.concludingSentenceVerbatim != null ? String(p.concludingSentenceVerbatim) : "—";
    const bridges = Array.isArray(p.phase2BridgeChunks) ? p.phase2BridgeChunks : [];
    const bridgeList =
      bridges.length > 0
        ? `<ul class="criterion-c-lora__bridges">${bridges
            .map((b) => {
              const bv = b.studentTextVerbatim != null ? String(b.studentTextVerbatim) : "—";
              const hc = b.howItConnects != null ? String(b.howItConnects) : "—";
              return `<li><p><q>${escapeHtml(bv)}</q></p><p><strong>How it connects:</strong> ${escapeHtml(hc)}</p></li>`;
            })
            .join("")}</ul>`
        : "<p class=\"criterion-c-muted\">No bridge chunks listed.</p>";

    const tclass = String(p.thematicShiftClassification || "").trim().toUpperCase() || "—";
    const acc = String(p.acceptableShiftSubtype || "").trim() || "—";
    const unacc = String(p.unacceptableShiftSubtype || "").trim() || "—";
    const qnote = p.topicConclusionMinorityQuoteNote != null ? String(p.topicConclusionMinorityQuoteNote) : "—";

    const scoresTable = `<div class="criterion-c-lora-scores-table-wrap" role="region" aria-label="Phase 1 and 2 bands">
        <table class="criterion-c-lora-table criterion-c-lora-table--scores">
          <thead>
            <tr>
              <th scope="col">Phase</th>
              <th scope="col">Band</th>
              <th scope="col">Reasoning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Phase 1 — Line of reasoning</td>
              <td><strong>${escapeHtml(clStars)}</strong></td>
              <td class="criterion-c-lora-scores-reason">${escapeHtml(clJust)}</td>
            </tr>
            <tr>
              <td>Phase 2 — Thematic consistency</td>
              <td><strong>${escapeHtml(thStars)}</strong></td>
              <td class="criterion-c-lora-scores-reason">${escapeHtml(thJust)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;

    blocks.push(`
      <div class="criterion-c-para-block criterion-c-lora-block">
        <h3 class="criterion-c-para-block__title">Paragraph ${escapeHtml(String(pIdx))}</h3>
        <h4 class="criterion-c-subhead">Phase 1 — LORA audit</h4>
        ${phase1Body}
        <h4 class="criterion-c-subhead">Phase 2 — Thematic consistency</h4>
        <p class="criterion-c-ts"><strong>Topic sentence (verbatim):</strong> <q>${escapeHtml(ts)}</q></p>
        <p class="criterion-c-ts"><strong>Concluding sentence(s) (verbatim):</strong> <q>${escapeHtml(cs)}</q></p>
        <h4 class="criterion-c-subhead">Bridge chunk(s) (body)</h4>
        ${bridgeList}
        <p><strong>Thematic shift class:</strong> ${escapeHtml(tclass)}</p>
        <p><strong>Acceptable subtype:</strong> ${escapeHtml(acc)} · <strong>Unacceptable subtype:</strong> ${escapeHtml(unacc)}</p>
        <p><strong>Minority-quote / quote-shell note:</strong> ${escapeHtml(qnote)}</p>
        <h4 class="criterion-c-subhead">Scores summary</h4>
        ${scoresTable}
      </div>
    `);
  }

  outMain.innerHTML = window.DOMPurify.sanitize(
    blocks.length > 0 ? blocks.join("") : "<p class=\"criterion-c-muted\">No paragraph blocks in the response.</p>",
    { ADD_ATTR: ["class"] }
  );

  const cMean = computeCriterionCLoraClarityMean(loraData);
  const tMean = computeCriterionCLoraThematicMean(loraData);
  const cMeanD = cMean != null ? (Number.isInteger(cMean) ? String(cMean) : cMean.toFixed(1)) : "—";
  const tMeanD = tMean != null ? (Number.isInteger(tMean) ? String(tMean) : tMean.toFixed(1)) : "—";

  const legacyIb = getCriterionCLoraFinalIbMarkFromData(loraData);
  const legacyDisp =
    legacyIb != null ? (Number.isInteger(legacyIb) ? String(legacyIb) : legacyIb.toFixed(1)) : null;
  const fmJustLegacy =
    loraData.finalIbMarkJustification != null ? String(loraData.finalIbMarkJustification) : "—";

  if (outMeta) {
    if (legacyDisp != null) {
      outMeta.innerHTML = window.DOMPurify.sanitize(
        `<div class="criterion-c-lora-final" role="region" aria-label="Criterion C IB mark (legacy step 1)">
          <p class="criterion-c-final-assess__kicker">Holistic IB Criterion C (legacy single-step bundle)</p>
          <p class="criterion-c-final-assess__mark"><strong>Final IB mark:</strong> ${escapeHtml(legacyDisp)} / 5</p>
          <p class="criterion-c-overall-note">Mean clarity ${escapeHtml(cMeanD)} / 3 · Mean thematic ${escapeHtml(tMeanD)} / 3</p>
          <h4 class="criterion-c-subhead">Why this IB mark</h4>
          <p>${escapeHtml(fmJustLegacy)}</p>
        </div>`,
        { ADD_ATTR: ["class", "role", "aria-label"] }
      );
    } else {
      outMeta.innerHTML = window.DOMPurify.sanitize(
        `<div class="criterion-c-lora-final criterion-c-lora-final--step1only" role="region" aria-label="Step 1 summary">
          <p class="criterion-c-final-assess__kicker">Step 1 — Line of Reasoning Auditor</p>
          <p class="criterion-c-overall-note">Mean clarity ${escapeHtml(cMeanD)} / 3 · Mean thematic ${escapeHtml(tMeanD)} / 3. Final IB mark (0–5) is assigned in <strong>step 3</strong> (Strategic Evaluator) after the Tangent / Repetition audit.</p>
        </div>`,
        { ADD_ATTR: ["class", "role", "aria-label"] }
      );
    }
  }
}

/**
 * @param {object} tangentData
 * @param {string} rawJson
 */
function renderCriterionCTangentDetail(tangentData, rawJson) {
  const section = document.getElementById("criterionCTangentSection");
  const out = document.getElementById("criterionCTangentOutput");
  if (!section || !out) return;

  if (section.dataset && rawJson) {
    section.dataset.rawCriterionCTangentJson = rawJson;
  } else if (section.dataset) {
    delete section.dataset.rawCriterionCTangentJson;
  }

  if (!tangentData || typeof tangentData !== "object") {
    out.innerHTML =
      "<p>Tangent and Repetition Detector results are missing. Run <strong>Criterion C</strong> from the dashboard.</p>";
    return;
  }

  const paras = Array.isArray(tangentData.bodyParagraphs) ? tangentData.bodyParagraphs : [];
  const blocks = [];

  for (const p of paras) {
    const pIdx = p.paragraphIndex != null ? p.paragraphIndex : 0;
    const auditRows = Array.isArray(p.chunkAuditRows) ? p.chunkAuditRows : [];
    const waste = Array.isArray(p.wasteLog) ? p.wasteLog : [];

    let chunkTableHtml = "";
    if (auditRows.length > 0) {
      const trs = auditRows
        .map((row) => {
          const cn = row.chunkNumber != null ? String(row.chunkNumber) : "—";
          const verb = row.studentTextVerbatim != null ? String(row.studentTextVerbatim) : "—";
          const about = row.studentTalkingAbout != null ? String(row.studentTalkingAbout) : "—";
          const conn = row.connectsToArgumentOrBroaderTS != null ? String(row.connectsToArgumentOrBroaderTS).trim() : "—";
          const ev = row.connectionEvidenceOwnWords != null ? String(row.connectionEvidenceOwnWords) : "—";
          const purp = row.purposeItServes != null ? String(row.purposeItServes) : "—";
          const driftRaw =
            row.driftOrIrrelevantStudentVerbatim != null ? String(row.driftOrIrrelevantStudentVerbatim).trim() : "";
          const driftCell = driftRaw ? `<q>${escapeHtml(driftRaw)}</q>` : "—";
          const assess = formatCriterionCTangentChunkAssessmentForDisplay(row);
          return `<tr>
            <td>${escapeHtml(cn)}</td>
            <td><q>${escapeHtml(verb)}</q></td>
            <td>${escapeHtml(about)}</td>
            <td>${escapeHtml(conn)}</td>
            <td>${escapeHtml(ev)}</td>
            <td>${escapeHtml(purp)}</td>
            <td>${driftCell}</td>
            <td><span class="criterion-c-tangent-vt">${escapeHtml(assess)}</span></td>
          </tr>`;
        })
        .join("");
      chunkTableHtml = `<div class="criterion-c-lora-table-wrap" role="region" aria-label="Chunk audit table">
          <table class="criterion-c-lora-table criterion-c-tangent-chunk-table">
            <thead>
              <tr>
                <th scope="col">Chunk #</th>
                <th scope="col">Student verbatim</th>
                <th scope="col">What the student is talking about</th>
                <th scope="col">Connects to argument / broader TS?</th>
                <th scope="col">Evidence (student’s own words)</th>
                <th scope="col">Purpose</th>
                <th scope="col">Evidence that doesn’t connect to purpose (verbatim)</th>
                <th scope="col">Assessment (PASS / REPETITION / TANGENT / MILD_TANGENT — may list several)</th>
              </tr>
            </thead>
            <tbody>${trs}</tbody>
          </table>
        </div>`;
    }

    const wasteRows = waste
      .map((w) => {
        const lab = w.stepLabel != null ? String(w.stepLabel) : "—";
        const vt = String(w.violationType || "").trim().toUpperCase() || "—";
        const rs = w.reasoning != null ? String(w.reasoning) : "—";
        return `<li><strong>${escapeHtml(lab)}</strong> · <span class="criterion-c-tangent-vt">${escapeHtml(vt)}</span> — ${escapeHtml(rs)}</li>`;
      })
      .join("");

    const sc = normalizeCriterionCLoraTier123(p.tangentRepetitionScore);
    const trStars =
      p.tangentRepetitionScoreStars != null
        ? String(p.tangentRepetitionScoreStars).trim()
        : criterionCLoraTier123ToStarBand(sc);
    const trReason =
      p.tangentRepetitionScoreReasoning != null
        ? String(p.tangentRepetitionScoreReasoning)
        : p.tangentRepetitionJustification != null
          ? String(p.tangentRepetitionJustification)
          : "—";
    const audit = p.auditSummary != null ? String(p.auditSummary) : "—";

    const legacyWaste =
      auditRows.length === 0 && waste.length
        ? `<h4 class="criterion-c-subhead">Waste log (legacy)</h4>
        <ul class="criterion-c-waste-log">${wasteRows}</ul>`
        : "";

    const chunkSection =
      auditRows.length > 0
        ? `<h4 class="criterion-c-subhead">Chunk audit (all body chunks)</h4>
        ${chunkTableHtml}
        <p class="criterion-c-muted criterion-c-tangent-coverage-note">Rows should cover all paragraph text except the topic sentence, aligned to step 1 chunks. The drift column quotes student text that fails to connect to argumentative purpose. Assessment lists all applicable flags; <strong>REPETITION</strong> and <strong>TANGENT</strong> can both apply (e.g. repeating a prior premise without new substance while also drifting).</p>`
        : waste.length
          ? `<h4 class="criterion-c-subhead">Chunk audit</h4>
          <p class="criterion-c-muted">No \`chunkAuditRows\` in this bundle — showing legacy waste log only.</p>
          ${legacyWaste}`
        : `<h4 class="criterion-c-subhead">Chunk audit</h4>
          <p class="criterion-c-muted">No chunk audit rows.</p>`;

    blocks.push(`
      <div class="criterion-c-para-block">
        <h3 class="criterion-c-para-block__title">Paragraph ${escapeHtml(String(pIdx))}</h3>
        <h4 class="criterion-c-subhead">Audit summary</h4>
        <p>${escapeHtml(audit)}</p>
        ${chunkSection}
        <h4 class="criterion-c-subhead">Tangent &amp; repetition band</h4>
        <p class="criterion-c-final-score"><strong>Band:</strong> ${escapeHtml(trStars)}${
          sc != null ? ` (${escapeHtml(String(sc))} / 3)` : ""
        }</p>
        <p class="criterion-c-final-just">${escapeHtml(trReason)}</p>
      </div>
    `);
  }

  const mean = computeCriterionCTangentMean(tangentData);
  const meanD = mean != null ? (Number.isInteger(mean) ? String(mean) : mean.toFixed(1)) : "—";
  const head = `<p class="criterion-c-overall-score"><strong>All paragraphs (mean):</strong> ${escapeHtml(meanD)} / 3</p>`;

  out.innerHTML = window.DOMPurify.sanitize(
    head + (blocks.length ? blocks.join("") : "<p class=\"criterion-c-muted\">No paragraph blocks.</p>"),
    { ADD_ATTR: ["class"] }
  );
}

/**
 * @param {object | null} moderatorData
 * @param {string} rawJson
 * @param {object | null} [bundleForFinalMark] — pass the paragraph bundle so `finalCriterionCMark` is preferred when present.
 */
function renderCriterionCModeratorDetail(moderatorData, rawJson, bundleForFinalMark) {
  const section = document.getElementById("criterionCModeratorSection");
  const out = document.getElementById("criterionCModeratorOutput");
  const markWrap = document.getElementById("criterionCModeratorFinalIbMarkWrap");
  const markNum = document.getElementById("criterionCModeratorFinalIbMarkNum");
  if (!section || !out) return;

  if (section.dataset && rawJson) {
    section.dataset.rawCriterionCModeratorJson = rawJson;
  } else if (section.dataset) {
    delete section.dataset.rawCriterionCModeratorJson;
  }

  const fm =
    bundleForFinalMark && typeof bundleForFinalMark === "object"
      ? getCriterionCFinalIbMarkFromBundle(bundleForFinalMark)
      : getCriterionCModeratorFinalIbMark(moderatorData);
  const markText = fm != null ? (Number.isInteger(fm) ? String(fm) : fm.toFixed(1)) : "—";

  if (markWrap && markNum) {
    markWrap.hidden = false;
    markNum.textContent = `${markText} / 5`;
  }

  if (!moderatorData || typeof moderatorData !== "object" || Array.isArray(moderatorData)) {
    out.innerHTML =
      "<p>Strategic Evaluator (step 3) is missing. Run <strong>Criterion C</strong> from the dashboard.</p>";
    return;
  }

  const gloss = moderatorData.glossCheckNotes != null ? String(moderatorData.glossCheckNotes) : "—";
  const depth = moderatorData.depthCheckNotes != null ? String(moderatorData.depthCheckNotes) : "—";
  const uniform = moderatorData.uniformityPenaltyNotes != null ? String(moderatorData.uniformityPenaltyNotes) : "—";
  const lowFocus =
    moderatorData.lowFocusFlag === true
      ? "Yes (low focus)"
      : moderatorData.lowFocusFlag === false
        ? "No"
        : "—";
  const sfN = normalizeCriterionCLoraTier123(moderatorData.strategicFocusScore);
  const sfStars = sfN === 3 ? "***" : sfN === 2 ? "**" : sfN === 1 ? "*" : "—";
  const sfDisp = sfN != null ? `${sfStars} (${sfN} / 3)` : "—";
  const sfJust =
    moderatorData.strategicFocusJustification != null ? String(moderatorData.strategicFocusJustification) : "—";

  out.innerHTML = window.DOMPurify.sanitize(
    `<div class="criterion-c-final-assess" role="region" aria-label="Criterion C Strategic Evaluator">
      <p class="criterion-c-final-assess__kicker">Step 3 — Strategic Evaluator</p>
      <h4 class="criterion-c-subhead">Gloss check (contextual / menial material)</h4>
      <p class="criterion-c-final-assess__just">${escapeHtml(gloss)}</p>
      <h4 class="criterion-c-subhead">Depth check (core argument / analytical pivot)</h4>
      <p class="criterion-c-final-assess__just">${escapeHtml(depth)}</p>
      <h4 class="criterion-c-subhead">Uniformity penalty</h4>
      <p class="criterion-c-final-assess__just">${escapeHtml(uniform)}</p>
      <p class="criterion-c-final-score"><strong>Low focus flag:</strong> ${escapeHtml(lowFocus)}</p>
      <p class="criterion-c-final-score"><strong>Strategic focus score:</strong> ${escapeHtml(sfDisp)}</p>
      <p class="criterion-c-final-just">${escapeHtml(sfJust)}</p>
    </div>`,
    { ADD_ATTR: ["class", "role", "aria-label"] }
  );
}

function updateCriterionCTileFromBundle(bundle) {
  const scoreFinal = document.getElementById("criterionCTileFinalLine");
  const numFinal = document.getElementById("criterionCTileFinalNum");
  const capFinal = document.getElementById("criterionCTileFinalCaption");
  const link = document.getElementById("criterionCTileDetailLink");
  if (!scoreFinal || !numFinal) return;

  const vf = getCriterionCFinalIbMarkFromBundle(bundle);

  if (vf != null && Number.isFinite(vf)) {
    const dispF = Number.isInteger(vf) ? String(vf) : vf.toFixed(1);
    numFinal.textContent = dispF;
    scoreFinal.hidden = false;
    if (capFinal) {
      capFinal.hidden = false;
      capFinal.textContent = "Criterion C Moderated Mark";
    }
  } else {
    numFinal.textContent = "";
    scoreFinal.hidden = true;
    if (capFinal) {
      capFinal.hidden = true;
      capFinal.textContent = "Criterion C Moderated Mark";
    }
  }

  let hasDetail = false;
  if (bundle.criterionCLoraData && Array.isArray(bundle.criterionCLoraData.bodyParagraphs)) {
    hasDetail = bundle.criterionCLoraData.bodyParagraphs.length > 0;
  } else if (bundle.criterionCStep1Data) {
    hasDetail = true;
  } else if (
    bundle.essayMode &&
    Array.isArray(bundle.criterionCEssayParagraphBundles)
  ) {
    hasDetail = bundle.criterionCEssayParagraphBundles.some(
      (sub) =>
        sub.criterionCLoraData?.bodyParagraphs?.length ||
        sub.criterionCStep1Data
    );
  }

  const hasFinal = vf != null && Number.isFinite(vf);
  if (link) {
    link.hidden = !(hasDetail || hasFinal);
  }
}

function clearCriterionCTileDisplay() {
  updateCriterionCTileFromBundle({
    version: 4,
    finalCriterionCMark: null,
    criterionCLoraData: null,
    criterionCTangentData: null,
    criterionCModeratorData: null,
  });
}

/**
 * @returns {Promise<{ loraData: object, rawJson: string }>}
 */
async function runCriterionCLoraPipeline(key, src, para) {
  setStatus("Criterion C step 1/3: Line of Reasoning Auditor…");
  setGradingStepLine("Criterion C — step 1/3: Line of Reasoning Auditor");
  const prompt = buildCriterionCLoraMessage(src, para);
  let rawJson;
  try {
    rawJson = await callGemini(key, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_C_LORA_SCHEMA,
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

  let loraData;
  try {
    loraData = parseModelJsonObject(rawJson);
  } catch {
    throw new Error("Criterion C step 1 did not return valid JSON. Try again.");
  }

  if (!loraData || typeof loraData !== "object" || !Array.isArray(loraData.bodyParagraphs)) {
    throw new Error("Invalid Criterion C Line of Reasoning Auditor structure returned.");
  }

  enrichCriterionCLoraDataFromPhaseOutput(loraData);

  for (const b of loraData.bodyParagraphs) {
    if (normalizeCriterionCLoraTier123(b.lineOfReasoningClarityScore) == null) {
      throw new Error(
        "Criterion C step 1: missing or invalid Phase 1 band (expected phase1ScoreStars: *, **, or ***)."
      );
    }
    if (normalizeCriterionCLoraTier123(b.thematicConsistencyScore) == null) {
      throw new Error(
        "Criterion C step 1: missing or invalid Phase 2 band (expected phase2ScoreStars: *, **, or ***)."
      );
    }
  }

  return { loraData, rawJson };
}

/**
 * @returns {Promise<{ tangentData: object, rawJson: string }>}
 */
async function runCriterionCTangentPipeline(key, src, para, loraData) {
  setStatus("Criterion C step 2/3: Tangent and Repetition Detector…");
  setGradingStepLine("Criterion C — step 2/3: Tangent and Repetition Detector");
  const prompt = buildCriterionCTangentRepetitionMessage(src, para, loraData);
  let rawJson;
  try {
    rawJson = await callGemini(key, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_C_TANGENT_REPETITION_SCHEMA,
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

  let tangentData;
  try {
    tangentData = parseModelJsonObject(rawJson);
  } catch {
    throw new Error("Criterion C step 2 did not return valid JSON. Try again.");
  }

  if (!tangentData || typeof tangentData !== "object" || !Array.isArray(tangentData.bodyParagraphs)) {
    throw new Error("Invalid Criterion C Tangent and Repetition Detector structure returned.");
  }

  enrichCriterionCTangentDataFromStarOutput(tangentData);

  for (const b of tangentData.bodyParagraphs) {
    if (normalizeCriterionCLoraTier123(b.tangentRepetitionScore) == null) {
      throw new Error(
        "Criterion C step 2: missing or invalid tangent band (expected tangentRepetitionScoreStars: *, **, or ***)."
      );
    }
  }

  return { tangentData, rawJson };
}

/**
 * @returns {Promise<{ moderatorData: object, rawJson: string }>}
 */
async function runCriterionCModeratorPipeline(key, src, para, loraData, tangentData) {
  setStatus("Criterion C step 3/3: Strategic Evaluator…");
  setGradingStepLine("Criterion C — step 3/3: Strategic Evaluator (emphasis vs. contextualization)");
  const prompt = buildCriterionCStrategicEvaluatorMessage(src, para, loraData, tangentData);
  let rawJson;
  try {
    rawJson = await callGemini(key, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_C_STEP3_STRATEGIC_SCHEMA,
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

  let moderatorData;
  try {
    moderatorData = parseModelJsonObject(rawJson);
  } catch {
    throw new Error("Criterion C step 3 did not return valid JSON. Try again.");
  }

  if (!moderatorData || typeof moderatorData !== "object" || Array.isArray(moderatorData)) {
    throw new Error("Invalid Criterion C step 3 structure returned.");
  }

  const sf = normalizeCriterionCLoraTier123(moderatorData.strategicFocusScore);
  if (sf != null) {
    moderatorData.strategicFocusScore = sf;
  }

  delete moderatorData.finalIbMark;
  delete moderatorData.finalIbMarkJustification;

  return { moderatorData, rawJson };
}

/**
 * @param {unknown} s
 * @returns {"*" | "**" | "***" | null}
 */
function normalizeCriterionCEssayHolisticStar(s) {
  const t = String(s ?? "")
    .trim()
    .replace(/\s+/g, "");
  if (t === "*" || t === "**" || t === "***") return t;
  return null;
}

/**
 * Non-functional thesis → force lowest tier per spec.
 * @param {object} data
 */
function applyCriterionCEssayHolistic1ThesisTierGuard(data) {
  if (!data || typeof data !== "object") return;
  const ok = String(data.thesisStatus || "").trim() === "OK_FUNCTIONAL";
  if (!ok) {
    data.thesisTopicsConsistencyRating = "*";
  }
}

/**
 * @returns {Promise<{ data: object, rawJson: string }>}
 */
async function runCriterionCEssayHolistic1ThesisTopics(key, src, fullEssay, meta) {
  setStatus("Criterion C (essay): holistic 1/3 — thesis & topics…");
  setGradingStepLine("Criterion C — essay holistic 1/3: thesis & topics consistency");
  const prompt = buildCriterionCEssayHolistic1ThesisTopicsMessage(src, fullEssay, meta);
  let rawJson;
  try {
    rawJson = await callGemini(key, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_C_ESSAY_HOLISTIC1_THESIS_TOPICS_SCHEMA,
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
    throw new Error("Criterion C essay holistic 1 did not return valid JSON. Try again.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Criterion C essay holistic 1 returned an invalid structure.");
  }
  applyCriterionCEssayHolistic1ThesisTierGuard(data);
  const band = normalizeCriterionCEssayHolisticStar(data.thesisTopicsConsistencyRating);
  if (!band) {
    throw new Error("Criterion C essay holistic 1: expected thesisTopicsConsistencyRating as *, **, or ***.");
  }
  data.thesisTopicsConsistencyRating = band;
  return { data, rawJson };
}

/**
 * @returns {Promise<{ data: object, rawJson: string }>}
 */
async function runCriterionCEssayHolistic2ParagraphSwapping(key, src, fullEssay, meta) {
  setStatus("Criterion C (essay): holistic 2/3 — structure & shuffle test…");
  setGradingStepLine("Criterion C — essay holistic 2/3: macro structure + paragraph shuffle");
  const prompt = buildCriterionCEssayHolistic2ParagraphSwappingMessage(src, fullEssay, meta);
  let rawJson;
  try {
    rawJson = await callGemini(key, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_C_ESSAY_HOLISTIC2_PARAGRAPH_SWAPPING_SCHEMA,
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
    throw new Error("Criterion C essay holistic 2 did not return valid JSON. Try again.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Criterion C essay holistic 2 returned an invalid structure.");
  }
  const p1 = normalizeCriterionCEssayHolisticStar(data.macroStructurePhase1Rating);
  const p2 = normalizeCriterionCEssayHolisticStar(data.shuffleTestPhase2Rating);
  if (!p1) {
    throw new Error("Criterion C essay holistic 2: expected macroStructurePhase1Rating as *, **, or ***.");
  }
  if (!p2) {
    throw new Error("Criterion C essay holistic 2: expected shuffleTestPhase2Rating as *, **, or ***.");
  }
  data.macroStructurePhase1Rating = p1;
  data.shuffleTestPhase2Rating = p2;
  return { data, rawJson };
}

/**
 * @param {object} data
 */
function applyCriterionCEssayHolistic3IntroConclusionGuards(data) {
  if (!data || typeof data !== "object") return;
  if (data.introAbsent === true) {
    data.introRating = "*";
  }
  if (data.conclusionAbsent === true) {
    data.conclusionRating = "*";
  }
}

/**
 * @returns {Promise<{ data: object, rawJson: string }>}
 */
async function runCriterionCEssayHolistic3IntroConclusion(key, src, fullEssay, meta) {
  setStatus("Criterion C (essay): holistic 3/3 — intro & conclusion…");
  setGradingStepLine("Criterion C — essay holistic 3/3: introduction & conclusion protocol");
  const prompt = buildCriterionCEssayHolistic3IntroConclusionMessage(src, fullEssay, meta);
  let rawJson;
  try {
    rawJson = await callGemini(key, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_C_ESSAY_HOLISTIC3_INTRO_CONCLUSION_SCHEMA,
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
    throw new Error("Criterion C essay holistic 3 did not return valid JSON. Try again.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Criterion C essay holistic 3 returned an invalid structure.");
  }
  applyCriterionCEssayHolistic3IntroConclusionGuards(data);
  if (typeof data.essayIncomplete !== "boolean") {
    throw new Error("Criterion C essay holistic 3: expected essayIncomplete as true or false (essay not finished).");
  }
  if (data.essayIncompleteNote == null || String(data.essayIncompleteNote).trim() === "") {
    data.essayIncompleteNote = "—";
  }
  const penNormRaw = normalizeFinalCriterionCMark(data.essayIncompleteRecommendedPenaltyIbMarks);
  const penNorm =
    penNormRaw != null ? Math.min(2, Math.max(0, penNormRaw)) : null;
  if (data.essayIncomplete === true) {
    if (penNorm == null) {
      throw new Error(
        "Criterion C essay holistic 3: when essayIncomplete is true, expected essayIncompleteRecommendedPenaltyIbMarks as a number from 0–2 (0.5 steps; use 2 only for severe cases such as missing paragraphs or severe cutoff)."
      );
    }
    data.essayIncompleteRecommendedPenaltyIbMarks = penNorm;
    const sev = data.essayIncompleteSeverity != null ? String(data.essayIncompleteSeverity).trim() : "";
    if (!sev || /^n\/a$/i.test(sev)) {
      throw new Error(
        "Criterion C essay holistic 3: when essayIncomplete is true, expected a non-empty essayIncompleteSeverity (incompleteness severity)."
      );
    }
    data.essayIncompleteSeverity = sev;
  } else {
    data.essayIncompleteRecommendedPenaltyIbMarks = 0;
    const sevFalse = data.essayIncompleteSeverity != null ? String(data.essayIncompleteSeverity).trim() : "";
    data.essayIncompleteSeverity = sevFalse && /^n\/a$/i.test(sevFalse) ? "n/a" : sevFalse || "n/a";
  }
  const ir = normalizeCriterionCEssayHolisticStar(data.introRating);
  const cr = normalizeCriterionCEssayHolisticStar(data.conclusionRating);
  if (!ir) {
    throw new Error("Criterion C essay holistic 3: expected introRating as *, **, or ***.");
  }
  if (!cr) {
    throw new Error("Criterion C essay holistic 3: expected conclusionRating as *, **, or ***.");
  }
  data.introRating = ir;
  data.conclusionRating = cr;
  return { data, rawJson };
}

/**
 * Whole-essay final IB mark (essay mode): Gemini moderator using digest only (no student text).
 * @returns {Promise<{ data: object, rawJson: string }>}
 */
async function runCriterionCEssayFinalIbExaminerStep(key, digestText) {
  setStatus("Criterion C (essay): final IB examiner moderator…");
  setGradingStepLine("Criterion C — whole-essay final IB mark (examiner)");
  const prompt = buildCriterionCEssayFinalIbExaminerMessage(digestText);
  let rawJson;
  try {
    rawJson = await callGemini(key, prompt, {
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON,
      responseMimeType: "application/json",
      responseSchema: CRITERION_C_ESSAY_FINAL_IB_EXAMINER_SCHEMA,
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
    throw new Error("Criterion C essay final examiner did not return valid JSON. Try again.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Criterion C essay final examiner returned an invalid structure.");
  }
  const sc = normalizeFinalCriterionCMark(data.score);
  if (sc == null) {
    throw new Error("Criterion C essay final examiner: expected a numeric score 0–5 (0.5 steps).");
  }
  data.score = sc;
  const rep = data.examinerReport != null ? String(data.examinerReport).trim() : "";
  if (!rep) {
    throw new Error("Criterion C essay final examiner: expected examinerReport prose.");
  }
  data.examinerReport = rep;
  return { data, rawJson };
}

/**
 * Essay-mode parent bundle: final whole-essay IB mark + examiner report (after holistics).
 * @param {{ criterionCEssayFinalIbExaminer?: object, criterionCEssayFinalIbExaminerRawJson?: string } | null} bundle
 */
function renderCriterionCEssayFinalIbExaminerPanel(bundle) {
  const section = document.getElementById("criterionCEssayFinalExaminerSection");
  const out = document.getElementById("criterionCEssayFinalExaminerOutput");
  if (!section || !out) return;

  const fe = bundle?.criterionCEssayFinalIbExaminer;
  if (!fe || typeof fe !== "object" || fe.score == null) {
    section.hidden = true;
    out.innerHTML = "";
    if (section.dataset) delete section.dataset.rawCriterionCEssayFinalExaminerJson;
    return;
  }

  section.hidden = false;
  if (section.dataset) {
    if (bundle.criterionCEssayFinalIbExaminerRawJson) {
      section.dataset.rawCriterionCEssayFinalExaminerJson = bundle.criterionCEssayFinalIbExaminerRawJson;
    } else {
      delete section.dataset.rawCriterionCEssayFinalExaminerJson;
    }
  }

  const sc = normalizeFinalCriterionCMark(fe.score);
  const disp = sc == null ? "—" : Number.isInteger(sc) ? String(sc) : sc.toFixed(1);
  const rep = fe.examinerReport != null ? escapeHtml(String(fe.examinerReport)) : "—";

  const rubric = buildCriterionCFocusOrganizationRubricTableHtml(sc);

  const html = `<p class="final-grade__mean"><strong>Final mark (IB official descriptor bands):</strong> ${escapeHtml(disp)} / 5</p>
    <p class="criterion-b-holistic__label">Examiner synthesis (5–6 sentences)</p>
    <p class="criterion-b-holistic__just">${rep}</p>
    <div class="criterion-c-final-examiner__descriptor-ref">${rubric}</div>`;

  out.innerHTML = window.DOMPurify.sanitize(html, {
    ADD_ATTR: ["class", "scope", "colspan", "aria-label"],
  });
}

/**
 * Large red star-band display for Criterion C holistic panels.
 * @param {string} bandText
 */
function criterionCHolisticScoreSpan(bandText) {
  const t = bandText == null || String(bandText).trim() === "" ? "—" : String(bandText).trim();
  return `<span class="criterion-c-holistic-score">${escapeHtml(t)}</span>`;
}

/**
 * @param {string} innerHtml
 */
function wrapCriterionCHolisticCard(innerHtml) {
  return `<div class="criterion-c-holistic-card markdown-body">${innerHtml}</div>`;
}

/**
 * Essay-mode parent bundle: three whole-essay holistics after per-body grading.
 * @param {{ criterionCEssayHolisticChecks?: object, criterionCEssayHolisticChecksRawJson?: string } | null} bundle
 * @param {1 | 2 | 3 | null | undefined} whichHolistic — show only this holistic (picker); omit to prompt selection.
 */
function renderCriterionCEssayHolisticChecksPanel(bundle, whichHolistic) {
  const section = document.getElementById("criterionCEssayHolisticSection");
  const out = document.getElementById("criterionCEssayHolisticOutput");
  if (!section || !out) return;

  if (!bundle || bundle.version !== 4 || !bundle.essayMode) {
    section.hidden = true;
    out.innerHTML = "";
    if (section.dataset) delete section.dataset.rawCriterionCEssayHolisticJson;
    return;
  }

  section.hidden = false;
  const chk = bundle.criterionCEssayHolisticChecks;
  const rawBundle = bundle.criterionCEssayHolisticChecksRawJson;
  if (section.dataset) {
    if (rawBundle) section.dataset.rawCriterionCEssayHolisticJson = rawBundle;
    else delete section.dataset.rawCriterionCEssayHolisticJson;
  }

  if (!chk || typeof chk !== "object") {
    out.innerHTML =
      '<p class="output-hint">No whole-essay holistics in this save. Run <strong>Criterion C</strong> again in essay mode.</p>';
    return;
  }

  const w = Number(whichHolistic);
  if (w !== 1 && w !== 2 && w !== 3) {
    out.innerHTML = window.DOMPurify.sanitize(
      '<p class="output-hint">Select a <strong>whole essay</strong> row (holistics 1–3) in the table above to view that check.</p>',
      { ADD_ATTR: ["class"] }
    );
    if (section.dataset) delete section.dataset.activeHolistic;
    return;
  }
  if (section.dataset) section.dataset.activeHolistic = String(w);

  const h1 = chk.thesisAndTopicsConsistency;
  const h2Swap = chk.paragraphSwappingMacroStructure;
  const h2Legacy = chk.interParagraphProgression;
  const h3Intro = chk.introAndConclusionCheck;
  const h3LegacyDev = chk.wholeEssayDevelopmentBalance;

  const starOrDash = (o, key) => {
    if (!o || typeof o !== "object") return "—";
    const k =
      key === "h1"
        ? o.thesisTopicsConsistencyRating
        : key === "h2"
          ? o.interParagraphProgressionRating
          : o.wholeEssayDevelopmentBalanceRating;
    const n = normalizeCriterionCEssayHolisticStar(k);
    return n != null ? n : "—";
  };

  const esc = (v) => escapeHtml(v == null ? "" : String(v));

  const table1Rows = Array.isArray(h1?.thesisVsParagraphsTable)
    ? h1.thesisVsParagraphsTable
        .map((r) => {
          const idx = r.bodyParagraphIndex1Based != null ? String(r.bodyParagraphIndex1Based) : "—";
          return `<tr>
            <td>${esc(idx)}</td>
            <td>${esc(r.thesisPromiseForThisParagraph)}</td>
            <td>${esc(r.paragraphActuallyDiscusses)}</td>
            <td>${esc(r.lineOfReasoningComparison)}</td>
          </tr>`;
        })
        .join("")
    : "";

  const bullets = Array.isArray(h1?.readerContractBullets) ? h1.readerContractBullets : [];
  const contractHtml = bullets.length
    ? `<ol class="criterion-c-essay-holistic__ol">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ol>`
    : "<p class=\"criterion-c-muted\">—</p>";

  const h1Block =
    h1 && typeof h1 === "object"
      ? `<h3 class="criterion-c-subhead">Holistic 1 — Thesis and topics consistency</h3>
        <p><strong>Thesis (verbatim):</strong> <q>${esc(h1.thesisVerbatim)}</q></p>
        <p><strong>Thesis status:</strong> ${esc(h1.thesisStatus)} — ${esc(h1.thesisStatusNote)}</p>
        <p class="criterion-c-holistic-rating-line"><strong>Rating:</strong> ${criterionCHolisticScoreSpan(starOrDash(h1, "h1"))}</p>
        <h4 class="criterion-c-subhead">Reader contract (per body paragraph)</h4>
        ${contractHtml}
        <h4 class="criterion-c-subhead">Thesis promise vs paragraphs (structure)</h4>
        ${
          table1Rows
            ? `<div class="criterion-c-lora-table-wrap" role="region" aria-label="Thesis vs paragraphs table">
          <table class="criterion-c-lora-table criterion-c-essay-holistic-table">
            <thead>
              <tr>
                <th scope="col">Body #</th>
                <th scope="col">What the thesis promises</th>
                <th scope="col">What the paragraph actually does</th>
                <th scope="col">Line of reasoning comparison</th>
              </tr>
            </thead>
            <tbody>${table1Rows}</tbody>
          </table>
        </div>`
            : "<p class=\"criterion-c-muted\">No comparison table rows.</p>"
        }
        <h4 class="criterion-c-subhead">Justification</h4>
        <p>${esc(h1.thesisTopicsConsistencyJustification)}</p>`
      : "<p class=\"criterion-c-muted\">Holistic 1 missing.</p>";

  const h2Block =
    h2Swap && typeof h2Swap === "object" && h2Swap.macroStructurePhase1Rating != null
      ? `<h3 class="criterion-c-subhead">Holistic 2 — Paragraph order, structure &amp; shuffle test</h3>
        <p class="criterion-c-holistic-rating-line criterion-c-holistic-rating-line--dual"><span class="criterion-c-holistic-rating-metric"><strong>Phase 1 (structure)</strong> ${criterionCHolisticScoreSpan(
          normalizeCriterionCEssayHolisticStar(h2Swap.macroStructurePhase1Rating) || "—"
        )}</span><span class="criterion-c-holistic-rating-sep"> · </span><span class="criterion-c-holistic-rating-metric"><strong>Phase 2 (shuffle)</strong> ${criterionCHolisticScoreSpan(
          normalizeCriterionCEssayHolisticStar(h2Swap.shuffleTestPhase2Rating) || "—"
        )}</span></p>
        <h4 class="criterion-c-subhead">Order and roles</h4>
        <p>${esc(h2Swap.bodyParagraphOrderAndRoleSummary)}</p>
        <p><strong>Argumentative structure type:</strong> ${esc(h2Swap.argumentativeStructureType)}</p>
        <h4 class="criterion-c-subhead">Structure classification — reasoning</h4>
        <p>${esc(h2Swap.argumentativeStructureReasoning)}</p>
        <h4 class="criterion-c-subhead">Phase 1 justification</h4>
        <p>${esc(h2Swap.macroStructurePhase1Justification)}</p>
        <h4 class="criterion-c-subhead">Phase 2 (shuffle) justification</h4>
        <p class="criterion-c-muted">*** is for collapse of <strong>whole-essay</strong> logic; if the only issue is which body paragraph comes first or topic-sentence order, that is not substantive enough for ***.</p>
        <p>${esc(h2Swap.shuffleTestPhase2Justification)}</p>`
      : h2Legacy && typeof h2Legacy === "object" && h2Legacy.interParagraphProgressionRating != null
        ? (() => {
            const transRows = Array.isArray(h2Legacy.paragraphTransitionNotes)
              ? h2Legacy.paragraphTransitionNotes
                  .map((t) => {
                    const a = t.afterBodyParagraphIndex1Based != null ? String(t.afterBodyParagraphIndex1Based) : "—";
                    return `<tr><td>${esc(a)}</td><td>${esc(t.note)}</td></tr>`;
                  })
                  .join("")
              : "";
            return `<h3 class="criterion-c-subhead">Holistic 2 — Legacy: inter-paragraph progression</h3>
        <p class="criterion-c-muted">This save predates the structure &amp; shuffle test. Re-run Criterion C in essay mode for the new holistic 2.</p>
        <p class="criterion-c-holistic-rating-line"><strong>Rating:</strong> ${criterionCHolisticScoreSpan(starOrDash(h2Legacy, "h2"))}</p>
        <p>${esc(h2Legacy.interParagraphProgressionJustification)}</p>
        ${
          transRows
            ? `<table class="criterion-c-lora-table"><thead><tr><th>After body #</th><th>Note</th></tr></thead><tbody>${transRows}</tbody></table>`
            : ""
        }`;
          })()
        : "<p class=\"criterion-c-muted\">Holistic 2 missing.</p>";

  const checklistTableHtml = (rows, title) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return `<p class="criterion-c-muted">${esc(title)}: no rows.</p>`;
    }
    const trs = rows
      .map((r) => {
        const met = r.met === true ? "Yes" : r.met === false ? "No" : "—";
        const ev = r.verbatimEvidence != null && String(r.verbatimEvidence).trim() ? `<q>${esc(r.verbatimEvidence)}</q>` : "—";
        return `<tr>
          <td>${esc(r.protocolKey)}</td>
          <td>${esc(r.protocolLabel)}</td>
          <td><strong>${esc(met)}</strong></td>
          <td>${ev}</td>
          <td>${esc(r.reasoning)}</td>
        </tr>`;
      })
      .join("");
    return `<div class="criterion-c-lora-table-wrap" role="region" aria-label="${esc(title)}">
      <table class="criterion-c-lora-table criterion-c-essay-holistic-table">
        <thead>
          <tr>
            <th scope="col">Protocol</th>
            <th scope="col">Label</th>
            <th scope="col">Met</th>
            <th scope="col">Verbatim evidence</th>
            <th scope="col">Reasoning</th>
          </tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>
    </div>`;
  };

  const violationsList = (arr) => {
    const a = Array.isArray(arr) ? arr.filter((x) => x != null && String(x).trim()) : [];
    if (!a.length) return "<p class=\"criterion-c-muted\">—</p>";
    return `<ul class="criterion-c-essay-holistic__ul">${a.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>`;
  };

  const h3Block =
    h3Intro && typeof h3Intro === "object" && h3Intro.introRating != null
      ? `<h3 class="criterion-c-subhead">Holistic 3 — Introduction &amp; conclusion protocol</h3>
        <p class="criterion-c-muted">Non-negotiable scope: intro is scored <strong>only</strong> from the introduction paragraph; conclusion <strong>only</strong> from the conclusion paragraph — not the rest of the essay.</p>
        <p><strong>Incomplete essay (not finished):</strong> ${
          typeof h3Intro.essayIncomplete === "boolean"
            ? `<strong>${h3Intro.essayIncomplete ? "Yes" : "No"}</strong>`
            : esc("—")
        }</p>
        ${
          (() => {
            const n = h3Intro.essayIncompleteNote != null ? String(h3Intro.essayIncompleteNote).trim() : "";
            if (!n || n === "—") return "";
            return `<p class="criterion-c-muted"><strong>Incomplete — note:</strong> ${esc(n)}</p>`;
          })()
        }
        ${
          h3Intro.essayIncomplete === true
            ? (() => {
                const sev =
                  h3Intro.essayIncompleteSeverity != null ? String(h3Intro.essayIncompleteSeverity).trim() : "";
                const penRaw = h3Intro.essayIncompleteRecommendedPenaltyIbMarks;
                const penUnclamped =
                  penRaw != null && Number.isFinite(Number(penRaw))
                    ? normalizeFinalCriterionCMark(penRaw)
                    : null;
                const pen = penUnclamped != null ? Math.min(2, Math.max(0, penUnclamped)) : null;
                const penDisp =
                  pen != null ? (Number.isInteger(pen) ? String(pen) : pen.toFixed(1)) : "—";
                return `<p class="criterion-c-muted"><strong>Incompleteness — severity:</strong> ${esc(sev || "—")}</p>
        <p class="criterion-c-muted"><strong>Recommended mark subtraction (0–2, incompleteness only):</strong> ${esc(penDisp)}</p>`;
              })()
            : ""
        }
        <p class="criterion-c-holistic-rating-line criterion-c-holistic-rating-line--dual"><span class="criterion-c-holistic-rating-metric"><strong>Intro</strong> ${criterionCHolisticScoreSpan(
          normalizeCriterionCEssayHolisticStar(h3Intro.introRating) || "—"
        )}${h3Intro.introAbsent === true ? ' <span class="criterion-c-muted">(absent)</span>' : ""}</span><span class="criterion-c-holistic-rating-sep"> · </span><span class="criterion-c-holistic-rating-metric"><strong>Conclusion</strong> ${criterionCHolisticScoreSpan(
          normalizeCriterionCEssayHolisticStar(h3Intro.conclusionRating) || "—"
        )}${h3Intro.conclusionAbsent === true ? ' <span class="criterion-c-muted">(absent)</span>' : ""}</span></p>
        <h4 class="criterion-c-subhead">Introduction — star demotions</h4>
        ${violationsList(h3Intro.introMajorViolations)}
        <h4 class="criterion-c-subhead">Introduction — checklist</h4>
        ${checklistTableHtml(h3Intro.introChecklistTable, "Introduction checklist")}
        <h4 class="criterion-c-subhead">Introduction — overall</h4>
        <p>${esc(h3Intro.introOverallJustification)}</p>
        <h4 class="criterion-c-subhead">Conclusion — star demotions</h4>
        ${violationsList(h3Intro.conclusionMajorViolations)}
        <h4 class="criterion-c-subhead">Conclusion — checklist</h4>
        ${checklistTableHtml(h3Intro.conclusionChecklistTable, "Conclusion checklist")}
        <h4 class="criterion-c-subhead">Conclusion — overall</h4>
        <p>${esc(h3Intro.conclusionOverallJustification)}</p>`
      : h3LegacyDev && typeof h3LegacyDev === "object" && h3LegacyDev.wholeEssayDevelopmentBalanceRating != null
        ? `<h3 class="criterion-c-subhead">Holistic 3 — Legacy: development vs repetition</h3>
        <p class="criterion-c-muted">This save predates the intro &amp; conclusion protocol. Re-run Criterion C in essay mode for the new holistic 3.</p>
        <p class="criterion-c-holistic-rating-line"><strong>Rating:</strong> ${criterionCHolisticScoreSpan(starOrDash(h3LegacyDev, "h3"))}</p>
        <p>${esc(h3LegacyDev.wholeEssayDevelopmentBalanceJustification)}</p>
        <p class="criterion-c-muted"><strong>Summary:</strong> ${esc(h3LegacyDev.redundancyOrGrowthSummary)}</p>`
        : "<p class=\"criterion-c-muted\">Holistic 3 missing.</p>";

  const chosenBlock = w === 1 ? h1Block : w === 2 ? h2Block : h3Block;
  const panelHint =
    w === 1
      ? `<p class="output-hint criterion-c-holistic-panel-hint">Showing <strong>holistic 1 only</strong> — thesis &amp; topics consistency. Star bands: <strong>*</strong> / <strong>**</strong> / <strong>***</strong>. Does not replace the per-paragraph IB mark.</p>`
      : w === 2
        ? `<p class="output-hint criterion-c-holistic-panel-hint">Showing <strong>holistic 2 only</strong> — structure (Phase 1) &amp; shuffle (Phase 2).</p>`
        : `<p class="output-hint criterion-c-holistic-panel-hint">Showing <strong>holistic 3 only</strong> — introduction &amp; conclusion (separate intro / con bands).</p>`;

  out.innerHTML = window.DOMPurify.sanitize(
    `${panelHint}${wrapCriterionCHolisticCard(chosenBlock)}`,
    { ADD_ATTR: ["class", "role", "aria-label"] }
  );
}

async function runCriterionC() {
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

  setCriterionCLoading(true, "Criterion C step 1/3…");

  const runGen = dashboardClearGeneration;
  try {
    if (!isEssay) {
      const { loraData, rawJson: loraRaw } = await runCriterionCLoraPipeline(key, src, fullText);
      setCriterionCLoading(true, "Criterion C step 2/3…");
      const { tangentData, rawJson: tangRaw } = await runCriterionCTangentPipeline(key, src, fullText, loraData);
      setCriterionCLoading(true, "Criterion C step 3/3…");
      const { moderatorData, rawJson: modRaw } = await runCriterionCModeratorPipeline(
        key,
        src,
        fullText,
        loraData,
        tangentData
      );
      applyCriterionCV4FormulaFinalMark(loraData, tangentData, moderatorData);
      const finalCriterionCMark = getCriterionCModeratorFinalIbMark(moderatorData);
      const bundle = {
        version: 4,
        workflow: "criterion_c_lora_tangent_moderator",
        sourceText: src,
        studentParagraph: fullText,
        criterionCLoraData: loraData,
        criterionCLoraRawJson: loraRaw,
        criterionCTangentData: tangentData,
        criterionCTangentRawJson: tangRaw,
        criterionCModeratorData: moderatorData,
        criterionCModeratorRawJson: modRaw,
        finalCriterionCMark,
      };
      if (runGen !== dashboardClearGeneration) return;
      saveCriterionCBundle(bundle);
      updateCriterionCTileFromBundle(bundle);
      refreshIbOverallPanel();
      return;
    }

    const { essayIntro, essayConclusion, essayBodyParagraphs } = getEssayMetaFromClassificationRecord();
    const per = [];
    for (let i = 0; i < bodies.length; i++) {
      const p = bodies[i];
      setCriterionCLoading(true, `Criterion C: body ${i + 1}/${bodies.length} — step 1/3…`);
      setGradingStepLine(`Criterion C — body ${i + 1}/${bodies.length} (steps 1–3)`);
      const { loraData, rawJson: loraRaw } = await runCriterionCLoraPipeline(key, src, p);
      setCriterionCLoading(true, `Criterion C: body ${i + 1}/${bodies.length} — step 2/3…`);
      const { tangentData, rawJson: tangRaw } = await runCriterionCTangentPipeline(key, src, p, loraData);
      setCriterionCLoading(true, `Criterion C: body ${i + 1}/${bodies.length} — step 3/3…`);
      const { moderatorData, rawJson: modRaw } = await runCriterionCModeratorPipeline(
        key,
        src,
        p,
        loraData,
        tangentData
      );
      applyCriterionCV4FormulaFinalMark(loraData, tangentData, moderatorData);
      const finalCriterionCMark = getCriterionCModeratorFinalIbMark(moderatorData);
      const inner = {
        version: 4,
        workflow: "criterion_c_lora_tangent_moderator",
        sourceText: src,
        studentParagraph: p,
        criterionCLoraData: loraData,
        criterionCLoraRawJson: loraRaw,
        criterionCTangentData: tangentData,
        criterionCTangentRawJson: tangRaw,
        criterionCModeratorData: moderatorData,
        criterionCModeratorRawJson: modRaw,
        finalCriterionCMark,
      };
      per.push(inner);
      if (runGen !== dashboardClearGeneration) return;
    }
    const essayHolisticMeta = {
      intro: essayIntro,
      conclusion: essayConclusion,
      bodyParagraphs: essayBodyParagraphs,
    };
    setCriterionCLoading(true, "Criterion C (essay): holistic 1/3 — thesis & topics…");
    const hol1 = await runCriterionCEssayHolistic1ThesisTopics(key, src, fullText, essayHolisticMeta);
    if (runGen !== dashboardClearGeneration) return;
    setCriterionCLoading(true, "Criterion C (essay): holistic 2/3 — structure & shuffle test…");
    const hol2 = await runCriterionCEssayHolistic2ParagraphSwapping(key, src, fullText, essayHolisticMeta);
    if (runGen !== dashboardClearGeneration) return;
    setCriterionCLoading(true, "Criterion C (essay): holistic 3/3 — intro & conclusion…");
    const hol3 = await runCriterionCEssayHolistic3IntroConclusion(key, src, fullText, essayHolisticMeta);
    if (runGen !== dashboardClearGeneration) return;
    const criterionCEssayHolisticChecks = {
      thesisAndTopicsConsistency: hol1.data,
      paragraphSwappingMacroStructure: hol2.data,
      introAndConclusionCheck: hol3.data,
    };
    const criterionCEssayHolisticChecksRawJson = JSON.stringify(
      {
        thesisAndTopicsConsistency: hol1.data,
        thesisAndTopicsConsistencyRawJson: hol1.rawJson,
        paragraphSwappingMacroStructure: hol2.data,
        paragraphSwappingMacroStructureRawJson: hol2.rawJson,
        introAndConclusionCheck: hol3.data,
        introAndConclusionCheckRawJson: hol3.rawJson,
      },
      null,
      2
    );
    const partialParent = {
      version: 4,
      essayMode: true,
      criterionCEssayParagraphBundles: per,
      criterionCEssayHolisticChecks,
    };
    const digestFinal = buildCriterionCEssayFinalIbExaminerDigest(partialParent);
    setCriterionCLoading(true, "Criterion C (essay): final IB examiner moderator…");
    const finalEx = await runCriterionCEssayFinalIbExaminerStep(key, digestFinal);
    if (runGen !== dashboardClearGeneration) return;
    const moderatedMark = normalizeFinalCriterionCMark(finalEx.data.score);
    const bundle = {
      version: 4,
      essayMode: true,
      workflow: "criterion_c_lora_tangent_moderator",
      sourceText: src,
      studentParagraph: fullText,
      essayIntro,
      essayConclusion,
      essayBodyParagraphs,
      criterionCEssayParagraphBundles: per,
      criterionCEssayHolisticChecks,
      criterionCEssayHolisticChecksRawJson,
      criterionCEssayFinalIbExaminer: finalEx.data,
      criterionCEssayFinalIbExaminerRawJson: finalEx.rawJson,
      finalCriterionCMark: moderatedMark,
    };
    saveCriterionCBundle(bundle);
    updateCriterionCTileFromBundle(bundle);
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
    setCriterionCLoading(false, "");
    setStatus("");
  }
}
