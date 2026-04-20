
/**
 * Normalize text for PDF standard fonts (Helvetica).
 * @param {unknown} s
 */
function toPdfText(s) {
  if (s == null) return "";
  return String(s)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\u2013|\u2014|\u2212/g, "-")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

/**
 * @param {unknown} v
 */
function pdfYesNoMark(v) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {{ margin: number, pageWidth: number, pageHeight: number }} layout
 * @param {number} fontSize
 * @param {boolean} bold
 * @returns {number} next baseline y
 */
function pdfWriteWrappedAt(doc, text, x, y, layout, fontSize, bold) {
  const { margin, pageWidth, pageHeight } = layout;
  const maxW = Math.max(40, pageWidth - margin - x);
  const lineHeight = fontSize * 1.35;
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(toPdfText(text), maxW);
  for (const line of lines) {
    if (y + lineHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {string} text
 * @param {number} y
 * @param {{ margin: number, pageWidth: number, pageHeight: number }} layout
 * @param {number} fontSize
 * @param {boolean} bold
 */
function pdfWriteWrapped(doc, text, y, layout, fontSize, bold) {
  return pdfWriteWrappedAt(doc, text, layout.margin, y, layout, fontSize, bold);
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {string} heading
 * @param {number} y
 * @param {{ margin: number, pageWidth: number, pageHeight: number }} layout
 * @param {number} fontSize
 */
function pdfSectionHeading(doc, heading, y, layout, fontSize) {
  y = pdfWriteWrapped(doc, heading, y, layout, fontSize, true);
  return y + 6;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {string} title
 * @param {number} y
 */
function pdfSubsection(doc, title, y, layout) {
  y = pdfWriteWrapped(doc, title, y, layout, 10, true);
  return y + 4;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {string} label
 * @param {string} body
 * @param {number} y
 */
function pdfLabeledBlock(doc, label, body, y, layout) {
  y = pdfWriteWrappedAt(doc, `${label}`, layout.margin, y, layout, 9, true);
  y = pdfWriteWrappedAt(doc, body || "—", layout.margin + 10, y, layout, 9, false);
  return y + 4;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {object | null | undefined} bundleA
 * @param {number} y
 */
function pdfAppendCriterionA(doc, bundleA, y, layout) {
  if (bundleA && bundleA.version === 2 && bundleA.essayMode && Array.isArray(bundleA.criterionAEssayParagraphBundles)) {
    const subs = bundleA.criterionAEssayParagraphBundles;
    const fa = bundleA.criterionAFinalEssayAssigner;
    const dashLine =
      fa && !fa.error && fa.score != null && Number.isFinite(Number(fa.score))
        ? `Essay mode: Criterion A — dashboard final mark ${formatMarkForDashboard(Number(fa.score))} / 5 (examiner synthesis of paragraph audits + whole-essay holistics). Per-body detail follows (${subs.length} body paragraphs).`
        : `Essay mode: Criterion A — one audit below per graded body paragraph (${subs.length}). Dashboard score uses paragraph means if final synthesis is unavailable.`;
    y = pdfWriteWrapped(doc, dashLine, y, layout, 9, false);
    y += 6;
    subs.forEach((sub, i) => {
      y = pdfSubsection(doc, `Criterion A — body paragraph ${i + 1}`, y, layout);
      y = pdfAppendCriterionA(doc, sub, y, layout);
      y += 8;
    });
    return y;
  }

  const audit = bundleA && bundleA.auditData;
  const topic = bundleA && bundleA.topicData;
  if (audit) enrichCriterionAAuditDataWithHolisticScores(audit, { normalizeStep2: false });
  if (!audit && !topic) {
    return pdfWriteWrapped(doc, "(No Criterion A data in bundle.)", y, layout, 9, false);
  }

  y = pdfSubsection(doc, "Step 2 — Paragraph audit (knowledge of the text)", y, layout);
  const g2 = audit && audit.criterionA_grade_step2;
  const step2Scale =
    audit && audit.criterionAHolisticFormulaVersion === 1 ? "0–5, 4.5 allowed (holistic formula)" : "0–5";
  if (g2 && g2.score != null) {
    y = pdfLabeledBlock(doc, `Criterion A grade (step 2, ${step2Scale})`, `${g2.score} / 5`, y, layout);
    y = pdfLabeledBlock(doc, "Justification", g2.justification != null ? String(g2.justification) : "—", y, layout);
  } else {
    y = pdfWriteWrapped(doc, "Step 2 grade not present.", y, layout, 9, false);
  }

  if (audit && audit.excludedTopicSentence) {
    y = pdfLabeledBlock(
      doc,
      "Topic sentence (excluded from analytical-set scoring)",
      `"${String(audit.excludedTopicSentence)}"`,
      y,
      layout
    );
  }

  const sets = audit && Array.isArray(audit.sets) ? audit.sets : [];
  if (sets.length === 0) {
    y = pdfWriteWrapped(doc, "No analytical sets listed.", y, layout, 9, false);
  } else {
    sets.forEach((set, i) => {
      y = pdfSubsection(doc, `Analytical set ${i + 1}`, y, layout);
      y = pdfLabeledBlock(doc, "Verbatim span", set.verbatim != null ? `"${String(set.verbatim)}"` : "—", y, layout);
      const hol = computeCriterionASetHolisticScore(set);
      const band = hol != null ? criterionAHolisticBandFromScore(hol) : null;
      const holCoef = normalizeCriterionAHolisticCoefficient(set.criterionAHolisticCoefficient);
      const holisticNote = holCoef != null
        ? `insight×${holCoef} (max 3)`
        : "insight×(precision+evidenceQuality+reasoning)/7.5 legacy";
      const rows = [
        ["Insight (0–3)", set.insight, set.justificationInsight],
        ["Precision (0–3)", set.precision, set.justificationPrecision],
        [`Evidence (${set.evidenceType || "?"}) (0–2)`, set.evidenceQuality, set.justificationEvidence],
        ...(set.reasoningDeducibleConclusion != null &&
        set.reasoningPreciseConceptWording != null &&
        set.reasoningLinearCoherence != null
          ? [
              ["(a) Deducible conclusion (0–2)", set.reasoningDeducibleConclusion, "—"],
              ["(b) Precise concept & wording (0–1)", set.reasoningPreciseConceptWording, "—"],
              ["(c) Linear / not circular (0–1)", set.reasoningLinearCoherence, "—"],
            ]
          : []),
        ["Reasoning total (0–4)", set.reasoning, set.justificationReasoning],
        ...(holCoef != null
          ? [
              [
                "Holistic coefficient (×)",
                String(holCoef),
                set.justificationHolisticCoefficient != null ? String(set.justificationHolisticCoefficient) : "—",
              ],
            ]
          : []),
        [
          "Holistic (app, max 3)",
          hol != null ? String(hol) : "—",
          band ? `band: ${band}` : holisticNote,
        ],
      ];
      for (const [label, score, just] of rows) {
        const sc = score != null ? String(score) : "—";
        const j = just != null ? String(just) : "—";
        y = pdfWriteWrappedAt(doc, `${label}: ${sc}`, layout.margin + 8, y, layout, 9, false);
        y = pdfWriteWrappedAt(doc, j, layout.margin + 16, y, layout, 8, false);
      }
      y += 4;
    });
  }

  y += 6;
  y = pdfSubsection(doc, "Step 3 — Topic sentence & argument alignment", y, layout);
  const g3 = topic && topic.criterionA_grade_step3;
  if (g3 && g3.score != null) {
    y = pdfLabeledBlock(doc, "Criterion A grade (step 3)", `${g3.score} / 5`, y, layout);
    y = pdfLabeledBlock(doc, "Justification", g3.justification != null ? String(g3.justification) : "—", y, layout);
  }

  const c1 = topic && topic.check1_topicSentenceSophistication;
  if (c1 && typeof c1 === "object") {
    y = pdfLabeledBlock(
      doc,
      "Check 1 — Topic sentence sophistication",
      `Score: ${c1.score != null ? String(c1.score) : "—"} / 4\n${c1.justification != null ? String(c1.justification) : "—"}`,
      y,
      layout
    );
  }

  const drift = topic && Array.isArray(topic.check2_thematicDrift) ? topic.check2_thematicDrift : [];
  if (drift.length > 0) {
    y = pdfWriteWrapped(doc, "Check 2 — Thematic drift (each set vs topic sentence)", y, layout, 9, true);
    const sorted = [...drift].sort((a, b) => (a.analyticalSetIndex ?? 0) - (b.analyticalSetIndex ?? 0));
    for (const row of sorted) {
      const idx = row.analyticalSetIndex != null ? String(row.analyticalSetIndex) : "—";
      const rel = Number(row.relevance) === 1 ? "Relevant" : "Drift / not aligned";
      const j = row.justification != null ? String(row.justification) : "—";
      y = pdfWriteWrappedAt(doc, `Set ${idx}: ${rel}`, layout.margin + 8, y, layout, 9, false);
      y = pdfWriteWrappedAt(doc, j, layout.margin + 16, y, layout, 8, false);
    }
  }

  return y;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {object | null | undefined} bundleB
 * @param {number} y
 */
function pdfAppendCriterionBEssayHolisticWholeEssayChecks(doc, bundleB, y, layout) {
  const chk = bundleB?.criterionBEssayHolisticChecks;
  if (!chk || typeof chk !== "object") {
    y = pdfSubsection(doc, "Essay mode — whole-response holistic checks", y, layout);
    y = pdfWriteWrappedAt(
      doc,
      "(Not in bundle — run Criterion B again in essay mode to generate.)",
      layout.margin,
      y,
      layout,
      8,
      false
    );
    return y;
  }
  y = pdfSubsection(doc, "Essay mode — whole-response holistic checks", y, layout);
  y = pdfWriteWrappedAt(
    doc,
    `Source genre (model): ${chk.sourceGenreLabel != null ? String(chk.sourceGenreLabel) : "—"}`,
    layout.margin,
    y,
    layout,
    9,
    true
  );
  y = pdfWriteWrappedAt(
    doc,
    `1) Shifts vs benchmark — ${chk.shiftsHolisticRating != null ? String(chk.shiftsHolisticRating) : "—"}`,
    layout.margin,
    y,
    layout,
    9,
    true
  );
  y = pdfWriteWrappedAt(
    doc,
    chk.shiftsHolisticJustification != null ? String(chk.shiftsHolisticJustification) : "—",
    layout.margin + 8,
    y,
    layout,
    8,
    false
  );
  const srows = Array.isArray(chk.shiftsPerBenchmarkRow) ? chk.shiftsPerBenchmarkRow : [];
  if (srows.length) {
    for (const r of srows) {
      const ord = r.orderInPassage != null ? String(r.orderInPassage) : "?";
      const ok = r.explicitlyClearlyStatedStudentVerbatim === true ? "Yes" : "No";
      const line = `Shift ${ord} (${ok}): ${r.shiftDescriptionFromBenchmark != null ? String(r.shiftDescriptionFromBenchmark) : "—"}`;
      y = pdfWriteWrappedAt(doc, line, layout.margin + 8, y, layout, 8, false);
      if (r.studentVerbatimEvidence != null && String(r.studentVerbatimEvidence).trim()) {
        y = pdfWriteWrappedAt(
          doc,
          `Verbatim: "${String(r.studentVerbatimEvidence)}"`,
          layout.margin + 16,
          y,
          layout,
          7,
          false
        );
      }
      if (r.examinerShiftRowNote != null && String(r.examinerShiftRowNote).trim()) {
        y = pdfWriteWrappedAt(
          doc,
          `Note: ${String(r.examinerShiftRowNote)}`,
          layout.margin + 16,
          y,
          layout,
          7,
          false
        );
      }
    }
  }
  y = pdfWriteWrappedAt(
    doc,
    `2) Genre-specific techniques — ${chk.genreHolisticRating != null ? String(chk.genreHolisticRating) : "—"}`,
    layout.margin,
    y,
    layout,
    9,
    true
  );
  y = pdfWriteWrappedAt(
    doc,
    chk.genreHolisticJustification != null ? String(chk.genreHolisticJustification) : "—",
    layout.margin + 8,
    y,
    layout,
    8,
    false
  );
  const gsp = Array.isArray(chk.genreSpecificTechniquesFoundInEssay) ? chk.genreSpecificTechniquesFoundInEssay : [];
  const gen = Array.isArray(chk.nonGenreSpecificTechniquesFoundInEssay) ? chk.nonGenreSpecificTechniquesFoundInEssay : [];
  y = pdfWriteWrappedAt(doc, `Genre-specific discussed: ${gsp.length ? gsp.join("; ") : "—"}`, layout.margin + 8, y, layout, 8, false);
  y = pdfWriteWrappedAt(doc, `Generic / non-specific: ${gen.length ? gen.join("; ") : "—"}`, layout.margin + 8, y, layout, 8, false);
  return y;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {object | null | undefined} bundleB
 * @param {number} y
 */
function pdfAppendCriterionBFinalExaminerBlock(doc, bundleB, y, layout) {
  const fe = bundleB?.criterionBFinalExaminer;
  if (!fe || typeof fe !== "object" || fe.score == null) {
    return y;
  }
  y = pdfSubsection(doc, "Final — Criterion B (IB official descriptor bands)", y, layout);
  const sc = normalizeCriterionBHolisticScore(fe.score);
  const disp = sc != null ? (Number.isInteger(sc) ? String(sc) : sc.toFixed(1)) : "—";
  y = pdfLabeledBlock(doc, "Final mark (0–5, 0.5 steps)", `${disp} / 5`, y, layout);
  const rep = fe.examinerReport != null ? String(fe.examinerReport) : "—";
  y = pdfLabeledBlock(doc, "Examiner synthesis", rep, y, layout);
  return y;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {object | null | undefined} bundleB
 * @param {number} y
 */
function pdfAppendCriterionB(doc, bundleB, y, layout) {
  if (bundleB && bundleB.version === 2 && bundleB.essayMode && Array.isArray(bundleB.criterionBEssayParagraphBundles)) {
    const subs = bundleB.criterionBEssayParagraphBundles;
    y = pdfWriteWrapped(
      doc,
      `Essay mode: Criterion B — Step 2–3 pipeline per body paragraph (${subs.length}); dashboard final mark follows the official-descriptor examiner pass when present.`,
      y,
      layout,
      9,
      false
    );
    y += 6;
    y = pdfAppendCriterionBEssayHolisticWholeEssayChecks(doc, bundleB, y, layout);
    y += 6;
    subs.forEach((sub, i) => {
      y = pdfSubsection(doc, `Criterion B — body paragraph ${i + 1}`, y, layout);
      y = pdfAppendCriterionB(doc, sub, y, layout);
      y += 8;
    });
    y = pdfAppendCriterionBFinalExaminerBlock(doc, bundleB, y, layout);
    return y;
  }

  if (!bundleB || !bundleB.criterionBData) {
    return pdfWriteWrapped(doc, "(No Criterion B data in bundle.)", y, layout, 9, false);
  }

  const bench = bundleB.criterionBBenchmarkData;
  if (bench && typeof bench === "object") {
    y = pdfSubsection(doc, "Step 1 — Authorial-choices benchmark (reference)", y, layout);
    const choices = Array.isArray(bench.authorialChoicesBenchmark) ? bench.authorialChoicesBenchmark : [];
    choices.forEach((ch, i) => {
      y = pdfWriteWrappedAt(
        doc,
        `${i + 1}. ${ch.choiceLabel != null ? String(ch.choiceLabel) : "Choice"}`,
        layout.margin,
        y,
        layout,
        9,
        true
      );
      if (ch.significanceBrief) {
        y = pdfWriteWrappedAt(doc, String(ch.significanceBrief), layout.margin + 8, y, layout, 8, false);
      }
      if (ch.textualAnchor) {
        y = pdfWriteWrappedAt(doc, `Anchor: ${String(ch.textualAnchor)}`, layout.margin + 8, y, layout, 8, false);
      }
      y += 2;
    });
    const shifts = bench.shiftsInAuthorialChoices;
    if (shifts && typeof shifts === "object") {
      y = pdfWriteWrapped(doc, "Shifts in authorial choices", y, layout, 9, true);
      if (shifts.significantShiftsPresent && Array.isArray(shifts.chronologicalShifts)) {
        const list = [...shifts.chronologicalShifts].sort(
          (a, b) => (a.orderInPassage ?? 0) - (b.orderInPassage ?? 0)
        );
        for (const s of list) {
          const ord = s.orderInPassage != null ? String(s.orderInPassage) : "?";
          const d = s.shiftDescription != null ? String(s.shiftDescription) : "—";
          y = pdfWriteWrappedAt(doc, `${ord}. ${d}`, layout.margin + 8, y, layout, 8, false);
        }
      } else {
        y = pdfWriteWrappedAt(
          doc,
          shifts.notApplicableLabel || "No significant shifts.",
          layout.margin + 8,
          y,
          layout,
          8,
          false
        );
      }
    }
    y += 6;
  }

  y = pdfSubsection(doc, "Step 2 — Phase 1: topic sentences by paragraph", y, layout);
  const data = bundleB.criterionBData;
  const paras = Array.isArray(data.bodyParagraphs) ? data.bodyParagraphs : [];
  for (const p of paras) {
    const pIdx = p.paragraphIndex != null ? String(p.paragraphIndex) : "—";
    y = pdfWriteWrappedAt(doc, `Paragraph ${pIdx}`, layout.margin, y, layout, 9, true);
    const ts = p.topicSentenceVerbatim != null ? String(p.topicSentenceVerbatim) : "—";
    y = pdfWriteWrappedAt(doc, `Topic sentence: "${ts}"`, layout.margin + 8, y, layout, 8, false);
    const sc = clampInt(p.topicSentenceScore, 0, 2);
    y = pdfWriteWrappedAt(doc, `Score: ${sc} / 2`, layout.margin + 8, y, layout, 8, false);
    if (p.topicSentenceTechniquesListed) {
      y = pdfWriteWrappedAt(
        doc,
        `Technique(s) named: ${String(p.topicSentenceTechniquesListed)}`,
        layout.margin + 8,
        y,
        layout,
        8,
        false
      );
    }
    if (p.topicSentenceJustification) {
      y = pdfWriteWrappedAt(doc, String(p.topicSentenceJustification), layout.margin + 8, y, layout, 8, false);
    }
    y += 4;
  }

  y = pdfSubsection(doc, "Step 2 — Analysis sets (technique & reasoning)", y, layout);
  let globalIdx = 0;
  for (const p of paras) {
    const pIdx = p.paragraphIndex != null ? p.paragraphIndex : 0;
    const sets = Array.isArray(p.analysisSets) ? p.analysisSets : [];
    for (let j = 0; j < sets.length; j++) {
      const set = sets[j];
      globalIdx += 1;
      const v2 = isCriterionBSetScoringV2(set);
      const x = v2 ? clampInt(set.techniqueQualityScore, 0, 2) : clampInt(set.techniqueQualityScore, 0, 3);
      const r = v2 ? getCriterionBReasoningACSum(set) : getCriterionBReasoningScoreComputed(set);
      const w = computeCriterionBWeighted(set);
      y = pdfWriteWrappedAt(
        doc,
        `Paragraph ${pIdx} · Set ${j + 1} (global ${globalIdx})`,
        layout.margin,
        y,
        layout,
        9,
        true
      );
      y = pdfLabeledBlock(
        doc,
        "Technique named",
        set.techniqueNamed != null ? String(set.techniqueNamed) : "—",
        y,
        layout
      );
      y = pdfLabeledBlock(
        doc,
        "Evidence / analysis span (verbatim)",
        set.verbatim != null ? `"${String(set.verbatim)}"` : "—",
        y,
        layout
      );
      y = pdfWriteWrappedAt(
        doc,
        `Technique quality: ${x} / ${v2 ? 2 : 3} — ${set.techniqueQualityJustification != null ? String(set.techniqueQualityJustification) : "—"}`,
        layout.margin + 8,
        y,
        layout,
        8,
        false
      );
      const checks = [
        ["Specific role / function", set.specificRole_met, set.specificRole_notes],
        ["Link to message", set.linkToMessage_met, set.linkToMessage_notes],
        ["Subtle implications", set.subtleImplications_met, set.subtleImplications_notes],
        ["Audience impact", set.audienceImpact_met, set.audienceImpact_notes],
      ];
      if (!v2) {
        checks.push(["Logical consistency", set.logicalConsistency_ok, set.logicalConsistency_notes]);
      }
      for (const [name, met, note] of checks) {
        const disp = pdfYesNoMark(met === true);
        const n = note != null ? String(note) : "—";
        y = pdfWriteWrappedAt(doc, `${name}: ${disp} — ${n}`, layout.margin + 8, y, layout, 8, false);
      }
      if (v2) {
        const a = clampInt(set.reasoningDeducibleConclusion, 0, 2);
        const c = clampInt(set.reasoningLinearCoherence, 0, 1);
        const adj = getCriterionBReasoningAdjustment(set);
        const ck = getCriterionBCheckpointTrueCount(set);
        const ckPts = getCriterionBCheckpointBandPoints(ck);
        y = pdfWriteWrappedAt(doc, `(a) Deducible conclusion: ${a} / 2`, layout.margin + 8, y, layout, 8, false);
        y = pdfWriteWrappedAt(doc, `(c) Linear coherence: ${c} / 1`, layout.margin + 8, y, layout, 8, false);
        const jac =
          set.criterionBReasoningJustificationAC != null ? String(set.criterionBReasoningJustificationAC) : "—";
        y = pdfWriteWrappedAt(doc, `(a)+(c) justification: ${jac}`, layout.margin + 8, y, layout, 8, false);
        y = pdfWriteWrappedAt(
          doc,
          `Checkpoint band (computed): ${ckPts} pts (${ck} true of 4)`,
          layout.margin + 8,
          y,
          layout,
          8,
          true
        );
        y = pdfWriteWrappedAt(
          doc,
          `Reasoning adjustment (computed): ${adj > 0 ? "+" : ""}${adj} ((a)+(c) sum ${r})`,
          layout.margin + 8,
          y,
          layout,
          8,
          true
        );
        y = pdfWriteWrappedAt(doc, `Total set score (computed): ${w.toFixed(1)} / 9`, layout.margin + 8, y, layout, 8, true);
      } else {
        y = pdfWriteWrappedAt(doc, `Reasoning total (computed, legacy): ${r} / 4`, layout.margin + 8, y, layout, 8, true);
        y = pdfWriteWrappedAt(doc, `Weighted total (computed, legacy): ${w.toFixed(1)} / 9`, layout.margin + 8, y, layout, 8, true);
      }
      y += 6;
    }
  }

  const step3 = bundleB.criterionBStep3Data;
  if (step3 && typeof step3 === "object") {
    y = pdfSubsection(doc, "Step 3 — Digest holistic (per paragraph)", y, layout);
    const hs = normalizeCriterionBHolisticScore(step3.score);
    const disp = hs != null ? (Number.isInteger(hs) ? String(hs) : hs.toFixed(1)) : "—";
    y = pdfLabeledBlock(doc, "Step 3 holistic", `${disp} / 5`, y, layout);
    const summary =
      step3.justification != null
        ? String(step3.justification)
        : step3.examinerSummary != null
          ? String(step3.examinerSummary)
          : "—";
    y = pdfLabeledBlock(doc, "Examiner summary", summary, y, layout);
  }

  y = pdfAppendCriterionBFinalExaminerBlock(doc, bundleB, y, layout);

  return y;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {object | null | undefined} bundleC
 * @param {number} y
 */
function pdfAppendCriterionC(doc, bundleC, y, layout) {
  if (!bundleC) {
    return pdfWriteWrapped(doc, "(No Criterion C bundle.)", y, layout, 9, false);
  }

  if (bundleC.essayMode && Array.isArray(bundleC.criterionCEssayParagraphBundles)) {
    const subs = bundleC.criterionCEssayParagraphBundles;
    const v4 = bundleC.version === 4;
    const v3 = bundleC.version === 3;
    y = pdfWriteWrapped(
      doc,
      v4
        ? bundleC.criterionCEssayFinalIbExaminer && bundleC.criterionCEssayFinalIbExaminer.score != null
          ? `Essay mode: Criterion C — steps 1–3 per body paragraph (${subs.length}); whole-essay holistics; then a final IB examiner moderator assigns the dashboard mark from a no–student-text digest (0–5, half steps).`
          : `Essay mode: Criterion C — steps 1–3 per body paragraph (${subs.length}). Step 3 is the Strategic Evaluator; dashboard mark is the mean of per-paragraph finalIbMark (nearest half mark).`
        : v3
          ? `Essay mode: Criterion C — Line of Reasoning Auditor per body paragraph (${subs.length}). Dashboard mark is the mean of per-paragraph finalIbMark values (nearest half mark).`
          : `Essay mode: Criterion C — legacy multi-step pipeline per body paragraph (${subs.length}).`,
      y,
      layout,
      9,
      false
    );
    y += 6;
    subs.forEach((sub, i) => {
      y = pdfSubsection(doc, `Criterion C — body paragraph ${i + 1}`, y, layout);
      y = pdfAppendCriterionC(doc, sub, y, layout);
      y += 8;
    });
    if (
      bundleC.criterionCEssayFinalIbExaminer &&
      typeof bundleC.criterionCEssayFinalIbExaminer === "object" &&
      bundleC.criterionCEssayFinalIbExaminer.score != null
    ) {
      const fe = bundleC.criterionCEssayFinalIbExaminer;
      const sc = normalizeFinalCriterionCMark(fe.score);
      const disp = sc != null ? (Number.isInteger(sc) ? String(sc) : sc.toFixed(1)) : "—";
      y = pdfSubsection(doc, "Whole essay — final IB examiner (Criterion C)", y, layout);
      y = pdfLabeledBlock(doc, "Final mark (whole essay)", `${disp} / 5`, y, layout);
      y = pdfLabeledBlock(
        doc,
        "Examiner report",
        fe.examinerReport != null ? String(fe.examinerReport) : "—",
        y,
        layout
      );
    }
    return y;
  }

  const lora = bundleC.criterionCLoraData;
  if ((bundleC.version === 3 || bundleC.version === 4) && lora && typeof lora === "object") {
    y = pdfSubsection(doc, "Step 1 — Line of Reasoning Auditor", y, layout);
    if (bundleC.version === 3) {
      const fm = getCriterionCLoraFinalIbMarkFromData(lora);
      const markText =
        fm != null ? (Number.isInteger(fm) ? String(fm) : fm.toFixed(1)) : "—";
      y = pdfLabeledBlock(doc, "Final IB mark (holistic, legacy in step 1)", `${markText} / 5`, y, layout);
      y = pdfLabeledBlock(
        doc,
        "IB mark justification",
        lora.finalIbMarkJustification != null ? String(lora.finalIbMarkJustification) : "—",
        y,
        layout
      );
    }
    const cm = computeCriterionCLoraClarityMean(lora);
    const tm = computeCriterionCLoraThematicMean(lora);
    const cmD = cm != null ? (Number.isInteger(cm) ? String(cm) : cm.toFixed(1)) : "—";
    const tmD = tm != null ? (Number.isInteger(tm) ? String(tm) : tm.toFixed(1)) : "—";
    y = pdfLabeledBlock(doc, "Mean scores (informational)", `Clarity ${cmD} / 3 · Thematic ${tmD} / 3`, y, layout);
    const paras = Array.isArray(lora.bodyParagraphs) ? lora.bodyParagraphs : [];
    for (const p of paras) {
      const pIdx = p.paragraphIndex != null ? p.paragraphIndex : 0;
      y = pdfWriteWrappedAt(doc, `Paragraph block ${pIdx}`, layout.margin, y, layout, 9, true);
      const chunkRows = Array.isArray(p.phase1ChunkRows) ? p.phase1ChunkRows : [];
      if (chunkRows.length > 0) {
        y = pdfWriteWrapped(doc, "Phase 1 — chunk table", y, layout, 9, true);
        for (const r of chunkRows) {
          const cn = r.chunkNumber != null ? String(r.chunkNumber) : "—";
          const vt = r.studentTextVerbatim != null ? String(r.studentTextVerbatim) : "—";
          const core = r.corePremiseOrArgumentOneSentence != null ? String(r.corePremiseOrArgumentOneSentence) : "—";
          const snd = r.soundOrNonSequitur != null ? String(r.soundOrNonSequitur) : "—";
          const piv = r.pivotOrProgressionFromPrevious != null ? String(r.pivotOrProgressionFromPrevious) : "—";
          y = pdfWriteWrappedAt(
            doc,
            `Chunk ${cn}: ${vt}`,
            layout.margin + 8,
            y,
            layout,
            8,
            false
          );
          y = pdfWriteWrappedAt(doc, `Premise: ${core}`, layout.margin + 12, y, layout, 8, false);
          y = pdfWriteWrappedAt(doc, `Sound / NS: ${snd} · Pivot/progression: ${piv}`, layout.margin + 12, y, layout, 8, false);
        }
        y = pdfLabeledBlock(
          doc,
          "Phase 1 — clarity of shifts",
          p.phase1ClarityOfShifts != null ? String(p.phase1ClarityOfShifts) : "—",
          y,
          layout
        );
        y = pdfLabeledBlock(
          doc,
          "Phase 1 — pivot note",
          p.phase1PivotNote != null ? String(p.phase1PivotNote) : "—",
          y,
          layout
        );
      } else {
        const steps = Array.isArray(p.reasoningSteps) ? p.reasoningSteps : [];
        steps.forEach((row, si) => {
          const lab = row.stepLabel != null ? String(row.stepLabel) : `Step ${si + 1}`;
          const logic = row.stepToLogicLine != null ? String(row.stepToLogicLine) : "—";
          const fault = row.faultOrNonSequiturNote != null ? String(row.faultOrNonSequiturNote) : "—";
          y = pdfWriteWrappedAt(doc, `${lab}: ${logic}`, layout.margin + 8, y, layout, 8, false);
          y = pdfWriteWrappedAt(doc, `Fault note: ${fault}`, layout.margin + 12, y, layout, 8, false);
        });
        y = pdfLabeledBlock(
          doc,
          "Shift clarity (legacy)",
          p.shiftClarityNotes != null ? String(p.shiftClarityNotes) : "—",
          y,
          layout
        );
      }
      const cl = normalizeCriterionCLoraTier123(p.lineOfReasoningClarityScore);
      const th = normalizeCriterionCLoraTier123(p.thematicConsistencyScore);
      const p1s = p.phase1ScoreStars != null ? String(p.phase1ScoreStars).trim() : cl != null ? (cl === 3 ? "***" : cl === 2 ? "**" : "*") : "—";
      const p2s = p.phase2ScoreStars != null ? String(p.phase2ScoreStars).trim() : th != null ? (th === 3 ? "***" : th === 2 ? "**" : "*") : "—";
      y = pdfLabeledBlock(
        doc,
        "Phase 1 / Phase 2 bands (stars)",
        `${p1s} · ${p2s} (tiers ${cl != null ? cl : "—"} / ${th != null ? th : "—"} for app)`,
        y,
        layout
      );
      y = pdfLabeledBlock(
        doc,
        "Phase 1 reasoning",
        p.phase1ScoreReasoning != null ? String(p.phase1ScoreReasoning) : "—",
        y,
        layout
      );
      y = pdfLabeledBlock(
        doc,
        "Phase 2 reasoning",
        p.phase2ScoreReasoning != null ? String(p.phase2ScoreReasoning) : "—",
        y,
        layout
      );
      y = pdfWriteWrapped(doc, "Phase 2 — topic & conclusion", y, layout, 9, true);
      y = pdfLabeledBlock(
        doc,
        "Topic sentence",
        p.topicSentenceVerbatim != null ? `"${String(p.topicSentenceVerbatim)}"` : "—",
        y,
        layout
      );
      y = pdfLabeledBlock(
        doc,
        "Concluding sentence(s)",
        p.concludingSentenceVerbatim != null ? `"${String(p.concludingSentenceVerbatim)}"` : "—",
        y,
        layout
      );
      const bridges = Array.isArray(p.phase2BridgeChunks) ? p.phase2BridgeChunks : [];
      if (bridges.length > 0) {
        y = pdfWriteWrapped(doc, "Bridge chunks", y, layout, 9, true);
        for (const b of bridges) {
          const bv = b.studentTextVerbatim != null ? String(b.studentTextVerbatim) : "—";
          const hc = b.howItConnects != null ? String(b.howItConnects) : "—";
          y = pdfWriteWrappedAt(doc, `"${bv}"`, layout.margin + 8, y, layout, 8, false);
          y = pdfWriteWrappedAt(doc, hc, layout.margin + 12, y, layout, 8, false);
        }
      }
      y = pdfLabeledBlock(
        doc,
        "Thematic shift class",
        p.thematicShiftClassification != null ? String(p.thematicShiftClassification) : "—",
        y,
        layout
      );
      y += 4;
    }

    if (bundleC.version === 4 && bundleC.criterionCTangentData && typeof bundleC.criterionCTangentData === "object") {
      const tang = bundleC.criterionCTangentData;
      y = pdfSubsection(doc, "Step 2 — Tangent and Repetition Detector", y, layout);
      const tm = computeCriterionCTangentMean(tang);
      const tmD = tm != null ? (Number.isInteger(tm) ? String(tm) : tm.toFixed(1)) : "—";
      y = pdfLabeledBlock(doc, "Mean tangent/repetition score", `${tmD} / 3`, y, layout);
      const tp = Array.isArray(tang.bodyParagraphs) ? tang.bodyParagraphs : [];
      for (const p of tp) {
        const pIdx = p.paragraphIndex != null ? p.paragraphIndex : 0;
        y = pdfWriteWrappedAt(doc, `Paragraph ${pIdx}`, layout.margin, y, layout, 9, true);
        y = pdfLabeledBlock(
          doc,
          "Audit summary",
          p.auditSummary != null ? String(p.auditSummary) : "—",
          y,
          layout
        );
        const auditRows = Array.isArray(p.chunkAuditRows) ? p.chunkAuditRows : [];
        const waste = Array.isArray(p.wasteLog) ? p.wasteLog : [];
        if (auditRows.length > 0) {
          y = pdfWriteWrapped(doc, "Chunk audit (all body chunks; topic sentence excluded)", y, layout, 9, true);
          for (const row of auditRows) {
            const cn = row.chunkNumber != null ? String(row.chunkNumber) : "—";
            const verb = row.studentTextVerbatim != null ? String(row.studentTextVerbatim) : "—";
            const about = row.studentTalkingAbout != null ? String(row.studentTalkingAbout) : "—";
            const conn = row.connectsToArgumentOrBroaderTS != null ? String(row.connectsToArgumentOrBroaderTS) : "—";
            const ev = row.connectionEvidenceOwnWords != null ? String(row.connectionEvidenceOwnWords) : "—";
            const purp = row.purposeItServes != null ? String(row.purposeItServes) : "—";
            const driftRaw =
              row.driftOrIrrelevantStudentVerbatim != null ? String(row.driftOrIrrelevantStudentVerbatim).trim() : "";
            const drift = driftRaw || "—";
            const assess = formatCriterionCTangentChunkAssessmentForDisplay(row);
            y = pdfWriteWrappedAt(doc, `Chunk ${cn}`, layout.margin + 8, y, layout, 8, true);
            y = pdfWriteWrappedAt(doc, `Verbatim: ${verb}`, layout.margin + 12, y, layout, 8, false);
            y = pdfWriteWrappedAt(doc, `About: ${about}`, layout.margin + 12, y, layout, 8, false);
            y = pdfWriteWrappedAt(doc, `Connects to TS/argument: ${conn}`, layout.margin + 12, y, layout, 8, false);
            y = pdfWriteWrappedAt(doc, `Evidence (own words): ${ev}`, layout.margin + 12, y, layout, 8, false);
            y = pdfWriteWrappedAt(doc, `Purpose: ${purp}`, layout.margin + 12, y, layout, 8, false);
            y = pdfWriteWrappedAt(doc, `Evidence that doesn’t connect to purpose (verbatim): ${drift}`, layout.margin + 12, y, layout, 8, false);
            y = pdfWriteWrappedAt(
              doc,
              `Assessment (PASS / REPETITION / TANGENT / MILD_TANGENT): ${assess}`,
              layout.margin + 12,
              y,
              layout,
              8,
              false
            );
          }
        } else if (waste.length > 0) {
          y = pdfWriteWrapped(doc, "Waste log (legacy)", y, layout, 9, true);
          for (const w of waste) {
            const lab = w.stepLabel != null ? String(w.stepLabel) : "—";
            const vt = w.violationType != null ? String(w.violationType) : "—";
            const rs = w.reasoning != null ? String(w.reasoning) : "—";
            y = pdfWriteWrappedAt(doc, `${lab} [${vt}]: ${rs}`, layout.margin + 8, y, layout, 8, false);
          }
        }
        const trs = normalizeCriterionCLoraTier123(p.tangentRepetitionScore);
        const trStarsRaw =
          p.tangentRepetitionScoreStars != null
            ? String(p.tangentRepetitionScoreStars).trim()
            : trs === 3
              ? "***"
              : trs === 2
                ? "**"
                : trs === 1
                  ? "*"
                  : "—";
        const trLine = trs != null ? `${trStarsRaw} (${trs} / 3)` : trStarsRaw !== "—" ? trStarsRaw : "—";
        y = pdfLabeledBlock(doc, "Tangent/repetition band", trLine, y, layout);
        const trReasonPdf =
          p.tangentRepetitionScoreReasoning != null
            ? String(p.tangentRepetitionScoreReasoning)
            : p.tangentRepetitionJustification != null
              ? String(p.tangentRepetitionJustification)
              : "—";
        y = pdfLabeledBlock(doc, "Tangent/repetition reasoning", trReasonPdf, y, layout);
        y += 4;
      }
    }

    if (bundleC.version === 4 && bundleC.criterionCModeratorData && typeof bundleC.criterionCModeratorData === "object") {
      const mod = bundleC.criterionCModeratorData;
      y = pdfSubsection(doc, "Step 3 — Strategic Evaluator (Criterion C)", y, layout);
      y = pdfLabeledBlock(
        doc,
        "Gloss check (contextual / menial material)",
        mod.glossCheckNotes != null ? String(mod.glossCheckNotes) : "—",
        y,
        layout
      );
      y = pdfLabeledBlock(
        doc,
        "Depth check (core argument / analytical pivot)",
        mod.depthCheckNotes != null ? String(mod.depthCheckNotes) : "—",
        y,
        layout
      );
      y = pdfLabeledBlock(
        doc,
        "Uniformity penalty notes",
        mod.uniformityPenaltyNotes != null ? String(mod.uniformityPenaltyNotes) : "—",
        y,
        layout
      );
      const sf = normalizeCriterionCLoraTier123(mod.strategicFocusScore);
      const sfStars = sf === 3 ? "***" : sf === 2 ? "**" : sf === 1 ? "*" : "—";
      const sfLine = sf != null ? `${sfStars} (${sf} / 3)` : "—";
      y = pdfLabeledBlock(doc, "Low focus flag", pdfYesNoMark(mod.lowFocusFlag), y, layout);
      y = pdfLabeledBlock(doc, "Strategic focus score", sfLine, y, layout);
      y = pdfLabeledBlock(
        doc,
        "Strategic focus justification",
        mod.strategicFocusJustification != null ? String(mod.strategicFocusJustification) : "—",
        y,
        layout
      );
      const fm = getCriterionCModeratorFinalIbMark(mod);
      const markText =
        fm != null ? (Number.isInteger(fm) ? String(fm) : fm.toFixed(1)) : "—";
      y = pdfLabeledBlock(doc, "Final IB mark (from four-tier formula)", `${markText} / 5`, y, layout);
    }

    return y;
  }

  const step1 = bundleC.criterionCStep1Data;
  if (step1 && typeof step1 === "object") {
    y = pdfSubsection(doc, "Agent 1 — Transitions & structural integrity", y, layout);
    const mean1 = computeCriterionCStep1DisplayScore(step1);
    const m1d = mean1 != null ? (Number.isInteger(mean1) ? String(mean1) : mean1.toFixed(1)) : "—";
    y = pdfLabeledBlock(doc, "Mean score (all paragraphs)", `${m1d} / 4`, y, layout);
    const paras = Array.isArray(step1.bodyParagraphs) ? step1.bodyParagraphs : [];
    for (const p of paras) {
      const pIdx = p.paragraphIndex != null ? p.paragraphIndex : 0;
      y = pdfWriteWrappedAt(doc, `Paragraph ${pIdx}`, layout.margin, y, layout, 9, true);
      y = pdfLabeledBlock(
        doc,
        "Topic sentence",
        p.topicSentenceVerbatim != null ? `"${String(p.topicSentenceVerbatim)}"` : "—",
        y,
        layout
      );
      const trans = Array.isArray(p.transitionMap) ? p.transitionMap : [];
      y = pdfWriteWrapped(doc, "Transition map", y, layout, 9, true);
      trans.forEach((row, ti) => {
        const fromL = row.fromLabel != null ? String(row.fromLabel) : "—";
        const toL = row.toLabel != null ? String(row.toLabel) : "—";
        const cl = String(row.classification || "").trim().toUpperCase() || "—";
        const j = row.justification != null ? String(row.justification) : "—";
        y = pdfWriteWrappedAt(
          doc,
          `${ti + 1}. [${fromL} -> ${toL}] ${cl}`,
          layout.margin + 8,
          y,
          layout,
          8,
          false
        );
        y = pdfWriteWrappedAt(doc, j, layout.margin + 16, y, layout, 8, false);
      });
      const g = p.criterionC_agent1_score || {};
      const sc = normalizeCriterionCAgent1Score(g.score);
      y = pdfLabeledBlock(doc, "Agent 1 score", sc != null ? `${sc} / 4` : "—", y, layout);
      y = pdfLabeledBlock(doc, "Justification", g.justification != null ? String(g.justification) : "—", y, layout);
      y = pdfLabeledBlock(
        doc,
        "Structural integrity summary",
        p.structuralIntegritySummary != null ? String(p.structuralIntegritySummary) : "—",
        y,
        layout
      );
      y = pdfLabeledBlock(
        doc,
        "Feature shopping notes",
        p.featureShoppingNotes != null ? String(p.featureShoppingNotes) : "—",
        y,
        layout
      );
      y = pdfLabeledBlock(
        doc,
        "Content shopping notes",
        p.contentShoppingNotes != null ? String(p.contentShoppingNotes) : "—",
        y,
        layout
      );
      y += 4;
    }
  }

  const step2 = bundleC.criterionCStep2Data;
  if (step2 && typeof step2 === "object") {
    y = pdfSubsection(doc, "Agent 2 — Argument progression", y, layout);
    const mean2 = computeCriterionCStep2DisplayScore(step2);
    const m2d = mean2 != null ? (Number.isInteger(mean2) ? String(mean2) : mean2.toFixed(1)) : "—";
    y = pdfLabeledBlock(doc, "Mean score (all paragraphs)", `${m2d} / 4`, y, layout);
    const paras2 = Array.isArray(step2.bodyParagraphs) ? step2.bodyParagraphs : [];
    for (const p of paras2) {
      const pIdx = p.paragraphIndex != null ? p.paragraphIndex : 0;
      y = pdfWriteWrappedAt(doc, `Paragraph ${pIdx}`, layout.margin, y, layout, 9, true);
      y = pdfLabeledBlock(
        doc,
        "Thesis for reference",
        p.thesisForReference != null ? `"${String(p.thesisForReference)}"` : "—",
        y,
        layout
      );
      const rows = [...(Array.isArray(p.progressionRows) ? p.progressionRows : [])].sort(
        (a, b) => (a.setIndexInParagraph ?? 0) - (b.setIndexInParagraph ?? 0)
      );
      y = pdfWriteWrapped(doc, "Progression map", y, layout, 9, true);
      for (const row of rows) {
        const si = row.setIndexInParagraph != null ? String(row.setIndexInParagraph) : "—";
        const lab = String(row.label || "").trim().toUpperCase() || "—";
        const tv = row.thematicValue != null ? String(row.thematicValue) : "—";
        const ac = row.anchorCheck != null ? String(row.anchorCheck) : "—";
        y = pdfWriteWrappedAt(doc, `Set ${si}: ${lab}`, layout.margin + 8, y, layout, 8, false);
        y = pdfWriteWrappedAt(doc, `Argument / value: ${tv}`, layout.margin + 16, y, layout, 8, false);
        y = pdfWriteWrappedAt(doc, `Anchor to thesis: ${ac}`, layout.margin + 16, y, layout, 8, false);
      }
      y = pdfLabeledBlock(
        doc,
        "Analytical depth notes",
        p.analyticalDepthNotes != null ? String(p.analyticalDepthNotes) : "—",
        y,
        layout
      );
      const g = p.criterionC_agent2_score || {};
      const sc = normalizeCriterionCAgent2Score(g.score);
      y = pdfLabeledBlock(doc, "Agent 2 score", sc != null ? `${sc} / 4` : "—", y, layout);
      y = pdfLabeledBlock(doc, "Justification", g.justification != null ? String(g.justification) : "—", y, layout);
      const stallList = Array.isArray(p.stallAndDerailSentenceNumbers) ? p.stallAndDerailSentenceNumbers : [];
      if (stallList.length > 0) {
        y = pdfWriteWrapped(doc, "Stall / derail flags", y, layout, 9, true);
        for (const x of stallList) {
          const n = x.sentenceNumber != null ? String(x.sentenceNumber) : "—";
          const t =
            normalizeStallIssueType(x.issueType) || String(x.issueType || "—").trim().toUpperCase();
          const note = x.briefNote != null ? String(x.briefNote) : "—";
          y = pdfWriteWrappedAt(doc, `Sentence ${n}: ${t} — ${note}`, layout.margin + 8, y, layout, 8, false);
        }
      }
      y += 4;
    }
  }

  const step3 = bundleC.criterionCStep3Data;
  if (step3 && typeof step3 === "object") {
    y = pdfSubsection(doc, "Agent 3 — Closure & structure", y, layout);
    const mean3 = computeCriterionCStep3DisplayScore(step3);
    const m3d = mean3 != null ? (Number.isInteger(mean3) ? String(mean3) : mean3.toFixed(1)) : "—";
    y = pdfLabeledBlock(doc, "Mean score (all paragraphs)", `${m3d} / 4`, y, layout);
    const paras3 = Array.isArray(step3.bodyParagraphs) ? step3.bodyParagraphs : [];
    for (const p of paras3) {
      const pIdx = p.paragraphIndex != null ? p.paragraphIndex : 0;
      y = pdfWriteWrappedAt(doc, `Paragraph ${pIdx}`, layout.margin, y, layout, 9, true);
      y = pdfLabeledBlock(
        doc,
        "Topic sentence",
        p.topicSentenceVerbatim != null ? `"${String(p.topicSentenceVerbatim)}"` : "—",
        y,
        layout
      );
      y = pdfLabeledBlock(
        doc,
        "Closing sentence(s)",
        p.closingSentenceVerbatim != null ? `"${String(p.closingSentenceVerbatim)}"` : "—",
        y,
        layout
      );
      const cl = String(p.closureClassification || "").trim().toUpperCase() || "—";
      y = pdfLabeledBlock(doc, "Closure classification", cl, y, layout);
      y = pdfLabeledBlock(
        doc,
        "Evolution quality",
        p.evolutionQualityDescription != null ? String(p.evolutionQualityDescription) : "—",
        y,
        layout
      );
      const st = String(p.structureClassification || "").trim().toUpperCase() || "—";
      y = pdfLabeledBlock(doc, "Structure classification", st, y, layout);
      y = pdfLabeledBlock(
        doc,
        "Line of reasoning summary",
        p.lineOfReasoningSummary != null ? String(p.lineOfReasoningSummary) : "—",
        y,
        layout
      );
      y = pdfLabeledBlock(
        doc,
        "Logic thread map",
        p.logicThreadMap != null ? String(p.logicThreadMap) : "—",
        y,
        layout
      );
      const oc = Number(p.overturnCount);
      const ocDisp = Number.isFinite(oc) && oc >= 0 ? String(Math.round(oc)) : p.overturnCount != null ? String(p.overturnCount) : "—";
      y = pdfLabeledBlock(
        doc,
        "Overturn count & notes",
        `${ocDisp} — ${p.overturnNotes != null ? String(p.overturnNotes) : "—"}`,
        y,
        layout
      );
      const g = p.criterionC_agent3_score || {};
      const sc = normalizeCriterionCAgent3Score(g.score);
      y = pdfLabeledBlock(doc, "Agent 3 score", sc != null ? `${sc} / 4` : "—", y, layout);
      y = pdfLabeledBlock(doc, "Justification", g.justification != null ? String(g.justification) : "—", y, layout);
      y = pdfLabeledBlock(doc, "Examiner note", p.examinerNote != null ? String(p.examinerNote) : "—", y, layout);
      y += 4;
    }
  }

  const step4 = bundleC.criterionCStep4Data;
  if (step4 && typeof step4 === "object") {
    y = pdfSubsection(doc, "Agent 4 — Hierarchy & strategic balance", y, layout);
    const mean4 = computeCriterionCStep4DisplayScore(step4);
    const m4d = mean4 != null ? (Number.isInteger(mean4) ? String(mean4) : mean4.toFixed(1)) : "—";
    y = pdfLabeledBlock(doc, "Mean score (all paragraphs)", `${m4d} / 4`, y, layout);
    const paras4 = Array.isArray(step4.bodyParagraphs) ? step4.bodyParagraphs : [];
    for (const p of paras4) {
      const pIdx = p.paragraphIndex != null ? p.paragraphIndex : 0;
      y = pdfWriteWrappedAt(doc, `Paragraph ${pIdx}`, layout.margin, y, layout, 9, true);
      const rows = Array.isArray(p.hierarchyMap) ? p.hierarchyMap : [];
      y = pdfWriteWrapped(doc, "Hierarchy map", y, layout, 9, true);
      for (const row of rows) {
        const name = row.featureName != null ? String(row.featureName) : "—";
        const ht = String(row.hierarchyType || "").trim().toUpperCase() || "—";
        const dp = String(row.analysisDepth || "").trim().toUpperCase() || "—";
        const pv = String(row.proportionalVerdict || "").trim().toUpperCase() || "—";
        const note = row.notesBrief != null ? String(row.notesBrief) : "—";
        y = pdfWriteWrappedAt(doc, `Feature: ${name}`, layout.margin + 8, y, layout, 8, true);
        y = pdfWriteWrappedAt(doc, `Type: ${ht} · Depth: ${dp} · Verdict: ${pv}`, layout.margin + 12, y, layout, 8, false);
        y = pdfWriteWrappedAt(doc, note, layout.margin + 12, y, layout, 8, false);
      }
      y = pdfLabeledBlock(
        doc,
        "Strategic — major misses",
        p.strategicMajorMisses != null ? String(p.strategicMajorMisses) : "—",
        y,
        layout
      );
      y = pdfLabeledBlock(
        doc,
        "Strategic — over-analysis",
        p.strategicOverAnalysis != null ? String(p.strategicOverAnalysis) : "—",
        y,
        layout
      );
      const g = p.criterionC_agent4_score || {};
      const sc = normalizeCriterionCAgent4Score(g.score);
      y = pdfLabeledBlock(doc, "Agent 4 score", sc != null ? `${sc} / 4` : "—", y, layout);
      y = pdfLabeledBlock(doc, "Justification", g.justification != null ? String(g.justification) : "—", y, layout);
      y += 4;
    }
  }

  const step5 = bundleC.criterionCStep5Data;
  if (step5 && typeof step5 === "object" && !Array.isArray(step5)) {
    y = pdfSubsection(doc, "Agent 5 — Final moderator (Criterion C)", y, layout);
    const mNorm = normalizeFinalCriterionCMark(step5.finalIbMark);
    const markText =
      mNorm != null ? (Number.isInteger(mNorm) ? String(mNorm) : mNorm.toFixed(1)) : "—";
    y = pdfLabeledBlock(doc, "Final IB mark", `${markText} / 5`, y, layout);
    y = pdfLabeledBlock(
      doc,
      "Performance profile",
      step5.performanceProfile != null ? String(step5.performanceProfile) : "—",
      y,
      layout
    );
    y = pdfLabeledBlock(
      doc,
      "Deal-breakers applied",
      step5.dealBreakersApplied != null ? String(step5.dealBreakersApplied) : "—",
      y,
      layout
    );
    y = pdfLabeledBlock(
      doc,
      "Holistic justification",
      step5.holisticJustification != null ? String(step5.holisticJustification) : "—",
      y,
      layout
    );
    y = pdfLabeledBlock(
      doc,
      "Next steps for the student",
      step5.nextStepsForStudent != null ? String(step5.nextStepsForStudent) : "—",
      y,
      layout
    );
  }

  return y;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {object | null | undefined} bundleD
 * @param {number} y
 */
function pdfAppendCriterionD(doc, bundleD, y, layout) {
  if (!bundleD) {
    return pdfWriteWrapped(doc, "(No Criterion D bundle.)", y, layout, 9, false);
  }

  if (bundleD.version === 3 && bundleD.essayMode && Array.isArray(bundleD.criterionDEssayParagraphBundles)) {
    const subs = bundleD.criterionDEssayParagraphBundles;
    y = pdfWriteWrapped(
      doc,
      `Essay mode: Criterion D — steps 1–3 per body paragraph (${subs.length}); **one** final moderator (step 4) after all bodies, from aggregated score digests.`,
      y,
      layout,
      9,
      false
    );
    y += 6;
    subs.forEach((sub, i) => {
      y = pdfSubsection(doc, `Criterion D — body paragraph ${i + 1} (steps 1–3)`, y, layout);
      y = pdfAppendCriterionD(doc, { ...sub, criterionDStep4Data: null }, y, layout);
      y += 8;
    });
    const s4top = bundleD.criterionDStep4Data;
    if (s4top && typeof s4top === "object") {
      y = pdfSubsection(doc, "Step 4 — Final moderator (whole essay)", y, layout);
      const grade = s4top.criterionD_moderator_score || {};
      const sc = normalizeCriterionDFinalModeratorScore(grade.score);
      const disp = formatCriterionDFinalModeratorDisplay(sc);
      y = pdfLabeledBlock(doc, "Final Criterion D mark", `${disp} / 5`, y, layout);
      y = pdfLabeledBlock(
        doc,
        "Moderator justification",
        grade.justification != null ? String(grade.justification) : "—",
        y,
        layout
      );
    }
    return y;
  }

  const s1 = bundleD.criterionDStep1Data;
  if (s1 && typeof s1 === "object") {
    y = pdfSubsection(doc, "Step 1 — Language mechanics", y, layout);
    const rows = Array.isArray(s1.errors) ? s1.errors : [];
    if (rows.length === 0) {
      y = pdfWriteWrapped(doc, "No errors listed under the allowed categories.", y, layout, 9, false);
    } else {
      rows.forEach((row, i) => {
        const v = row.verbatimFromText != null ? String(row.verbatimFromText) : "—";
        const t = row.typeOfError != null ? String(row.typeOfError) : "—";
        const e = row.onePhraseExplanation != null ? String(row.onePhraseExplanation) : "—";
        const imp = formatCriterionDStep1UnderstandingImpact(row.understandingImpact);
        y = pdfWriteWrappedAt(doc, `${i + 1}. "${v}"`, layout.margin, y, layout, 8, true);
        y = pdfWriteWrappedAt(doc, `Type: ${t}`, layout.margin + 8, y, layout, 8, false);
        y = pdfWriteWrappedAt(doc, `Impact: ${imp}`, layout.margin + 8, y, layout, 8, false);
        y = pdfWriteWrappedAt(doc, e, layout.margin + 8, y, layout, 8, false);
      });
    }
    const p1g = s1.criterionD_phase1_only_score || {};
    const p1sc = normalizeCriterionDPhase1OnlyScore(p1g.score);
    const p1just = p1g.justification != null ? String(p1g.justification) : "—";
    y = pdfWriteWrapped(doc, "Step 1 — Examiner summary (mechanics & sentence structure)", y, layout, 9, true);
    y = pdfWriteWrappedAt(doc, "Phase 1 — Mechanics", layout.margin, y, layout, 8, true);
    y = pdfWriteWrappedAt(
      doc,
      `Score / 5: ${p1sc != null ? `${p1sc} / 5` : "—"}`,
      layout.margin + 8,
      y,
      layout,
      8,
      false
    );
    y = pdfLabeledBlock(
      doc,
      "Examiner rationale",
      p1just,
      y,
      layout
    );
    const ph2 = s1.sentenceRhythmPhase2;
    if (ph2 && typeof ph2 === "object") {
      const p2sc = normalizeCriterionDPhase2OnlyScore(ph2.score);
      const p2just = ph2.justification != null ? String(ph2.justification) : "—";
      if (p2sc != null) {
        y = pdfWriteWrappedAt(doc, "Phase 2 — Sentence structure", layout.margin, y, layout, 8, true);
        y = pdfWriteWrappedAt(doc, `Score / 5: ${p2sc} / 5`, layout.margin + 8, y, layout, 8, false);
        y = pdfLabeledBlock(
          doc,
          "Examiner rationale",
          p2just,
          y,
          layout
        );
        if (ph2.explanation != null && String(ph2.explanation).trim()) {
          y = pdfLabeledBlock(doc, "Structural notes", String(ph2.explanation), y, layout);
        }
      } else {
        y = pdfWriteWrapped(doc, "Phase 2 — Sentence rhythm", y, layout, 9, true);
        const vKey = ph2.rhythmVerdict != null ? String(ph2.rhythmVerdict).trim() : "";
        const vLabel = CRITERION_D_PHASE2_VERDICT_LABELS[vKey] || vKey || "—";
        y = pdfLabeledBlock(doc, "Verdict", vLabel, y, layout);
        y = pdfLabeledBlock(doc, "Notes", p2just || (ph2.explanation != null ? String(ph2.explanation) : "—"), y, layout);
      }
    }
    y += 4;
  }

  const s2 = bundleD.criterionDStep2Data;
  if (s2 && typeof s2 === "object") {
    y = pdfSubsection(doc, "Step 2 — Lexical sophistication", y, layout);
    const rows = Array.isArray(s2.lexicalRows) ? s2.lexicalRows : [];
    if (rows.length === 0) {
      y = pdfWriteWrapped(doc, "No lexical rows returned.", y, layout, 9, false);
    } else {
      rows.forEach((row, i) => {
        const v = row.verbatimWordOrPhrase != null ? String(row.verbatimWordOrPhrase) : "—";
        const code = normalizeCriterionDLexicalCode(row.indexCode);
        const e = row.onePhraseExplanation != null ? String(row.onePhraseExplanation) : "—";
        y = pdfWriteWrappedAt(doc, `${i + 1}. "${v}" [${code}]`, layout.margin, y, layout, 8, true);
        y = pdfWriteWrappedAt(doc, e, layout.margin + 8, y, layout, 8, false);
      });
    }
    const grade = s2.criterionD_agent2_score || {};
    const sc = normalizeCriterionDAgent2Score(grade.score);
    const gjust = grade.justification != null ? String(grade.justification) : "—";
    y = pdfWriteWrapped(doc, "Step 2 — Examiner summary", y, layout, 9, true);
    y = pdfWriteWrappedAt(doc, "Lexical control (Agent 2)", layout.margin, y, layout, 8, true);
    y = pdfWriteWrappedAt(
      doc,
      `Score / 5: ${sc != null ? `${sc} / 5` : "—"}`,
      layout.margin + 8,
      y,
      layout,
      8,
      false
    );
    y = pdfLabeledBlock(
      doc,
      "Examiner rationale",
      gjust,
      y,
      layout
    );
    y += 4;
  }

  const s3 = bundleD.criterionDStep3Data;
  if (s3 && typeof s3 === "object") {
    y = pdfSubsection(doc, "Step 3 — Register & protocol", y, layout);
    const plus = Array.isArray(s3.plusRows) ? s3.plusRows : [];
    const minus = Array.isArray(s3.minusRows) ? s3.minusRows : [];
    y = pdfWriteWrapped(doc, "PLUS (strengths)", y, layout, 9, true);
    if (plus.length === 0) {
      y = pdfWriteWrappedAt(doc, "None listed.", layout.margin + 8, y, layout, 8, false);
    } else {
      plus.forEach((row, i) => {
        const v = row.verbatimWordOrPhrase != null ? String(row.verbatimWordOrPhrase) : "—";
        const t = formatCriterionDStep3PlusType(row.plusType);
        const e = row.onePhraseExplanation != null ? String(row.onePhraseExplanation) : "—";
        y = pdfWriteWrappedAt(doc, `${i + 1}. "${v}" — ${t}`, layout.margin + 8, y, layout, 8, false);
        y = pdfWriteWrappedAt(doc, e, layout.margin + 16, y, layout, 8, false);
      });
    }
    y = pdfWriteWrapped(doc, "MINUS (violations)", y, layout, 9, true);
    if (minus.length === 0) {
      y = pdfWriteWrappedAt(doc, "None listed.", layout.margin + 8, y, layout, 8, false);
    } else {
      minus.forEach((row, i) => {
        const v = row.verbatimWordOrPhrase != null ? String(row.verbatimWordOrPhrase) : "—";
        const t = formatCriterionDStep3MinusType(row.minusType);
        const sev = formatCriterionDRegisterMinusSeverity(getCriterionDRegisterMinusSeverityForRow(row));
        const e = row.onePhraseExplanation != null ? String(row.onePhraseExplanation) : "—";
        y = pdfWriteWrappedAt(doc, `${i + 1}. "${v}" — ${t} (${sev})`, layout.margin + 8, y, layout, 8, false);
        y = pdfWriteWrappedAt(doc, e, layout.margin + 16, y, layout, 8, false);
      });
    }
    y = pdfWriteWrapped(doc, "Band descriptors — voice & tone; error extent & protocol (0–5)", y, layout, 9, true);
    CRITERION_D_AGENT3_REGISTER_MARK_ROWS.forEach((row) => {
      const mark = row.mark;
      const line = `${mark} — Voice: ${row.voice} | Protocol: ${row.protocol}`;
      y = pdfWriteWrappedAt(doc, line, layout.margin + 8, y, layout, 7.5, false);
    });
    const grade = s3.criterionD_agent3_score || {};
    const sc = normalizeCriterionDAgent3Score(grade.score);
    const gjust = grade.justification != null ? String(grade.justification) : "—";
    y = pdfWriteWrapped(doc, "Step 3 — Examiner summary", y, layout, 9, true);
    y = pdfWriteWrappedAt(
      doc,
      `Register & protocol (Agent 3) — score / 5: ${sc != null ? `${sc} / 5` : "—"}`,
      layout.margin + 8,
      y,
      layout,
      8,
      false
    );
    y = pdfLabeledBlock(
      doc,
      "Examiner rationale",
      gjust,
      y,
      layout
    );
    y += 4;
  }

  const s4 = bundleD.criterionDStep4Data;
  if (s4 && typeof s4 === "object") {
    y = pdfSubsection(doc, "Step 4 — Final moderator (Criterion D)", y, layout);
    const grade = s4.criterionD_moderator_score || {};
    const sc = normalizeCriterionDFinalModeratorScore(grade.score);
    const disp = formatCriterionDFinalModeratorDisplay(sc);
    y = pdfLabeledBlock(doc, "Final Criterion D mark", `${disp} / 5`, y, layout);
    y = pdfLabeledBlock(
      doc,
      "Moderator justification",
      grade.justification != null ? String(grade.justification) : "—",
      y,
      layout
    );
  }

  return y;
}

/**
 * Builds the full IB Paper 1 PDF report from saved criterion bundles.
 */
function downloadIbFullReportPdf() {
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
    setError("Cannot generate the PDF until Criteria A, B, C, and D are all scored.");
    return;
  }
  if (!ibOverallScoreRevealed) {
    setError('Reveal the final score first, then download the full PDF report.');
    return;
  }

  const modDisp = resolveIbOverallModerationForDisplay(sA, sB, sC, sD);
  const fA = modDisp.finalA;
  const fB = modDisp.finalB;
  const fC = modDisp.finalC;
  const fD = modDisp.finalD;
  const total = compositePaper1TotalMarks(fA, fB, fC, fD);
  const band = totalMarksToIbBand(total);
  const dispT = formatMarkForDashboard(total);

  const pdfMarkPair = (o, f) => {
    if (Math.abs(Number(o) - Number(f)) < 1e-6) return `${formatMarkForDashboard(f)}`;
    return `${formatMarkForDashboard(o)} → ${formatMarkForDashboard(f)}`;
  };
  const breakdownLine = `Breakdown (final moderation) — A: ${pdfMarkPair(modDisp.prelimA, fA)} / 5 · B: ${pdfMarkPair(modDisp.prelimB, fB)} / 5 · C: ${pdfMarkPair(modDisp.prelimC, fC)} / 5 · D: ${pdfMarkPair(modDisp.prelimD, fD)} / 5`;

  const src =
    (bundleA && bundleA.sourceText) ||
    (bundleB && bundleB.sourceText) ||
    (bundleC && bundleC.sourceText) ||
    (bundleD && bundleD.sourceText) ||
    "";
  const para =
    (bundleA && bundleA.studentParagraph) ||
    (bundleB && bundleB.studentParagraph) ||
    (bundleC && bundleC.studentParagraph) ||
    (bundleD && bundleD.studentParagraph) ||
    "";

  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const layout = {
    margin: 48,
    pageWidth: doc.internal.pageSize.getWidth(),
    pageHeight: doc.internal.pageSize.getHeight(),
  };

  let y = layout.margin;
  const bodyFs = 9;

  y = pdfSectionHeading(doc, "IB English A: Language and Literature — Paper 1 analysis report", y, layout, 16);
  y = pdfWriteWrapped(doc, `Generated: ${dateStr} · ${timeStr}`, y, layout, 10, false);
  y += 8;

  y = pdfSectionHeading(doc, "Overall composition", y, layout, 12);
  y = pdfWriteWrapped(
    doc,
    `Total: ${dispT} / 20\n` + `IB band (1–7): ${band != null ? String(band) : "—"}\n` + `${breakdownLine}`,
    y,
    layout,
    bodyFs,
    false
  );
  y += 10;

  if (modDisp.record) {
    const dA = modDisp.record.decisionCriterionA != null ? String(modDisp.record.decisionCriterionA).trim() : "";
    const dB = modDisp.record.decisionCriterionB != null ? String(modDisp.record.decisionCriterionB).trim() : "";
    const dC = modDisp.record.decisionCriterionC != null ? String(modDisp.record.decisionCriterionC).trim() : "";
    const dD = modDisp.record.decisionCriterionD != null ? String(modDisp.record.decisionCriterionD).trim() : "";
    const dBand = modDisp.record.decisionFinalBand != null ? String(modDisp.record.decisionFinalBand).trim() : "";
    if (dA || dB || dC || dD || dBand) {
      y = pdfSectionHeading(doc, "Final moderation — mark decisions", y, layout, 12);
      if (dA) y = pdfWriteWrapped(doc, `Criterion A — ${dA}`, y, layout, bodyFs, false);
      if (dA && (dB || dC || dD || dBand)) y += 6;
      if (dB) y = pdfWriteWrapped(doc, `Criterion B — ${dB}`, y, layout, bodyFs, false);
      if (dB && (dC || dD || dBand)) y += 6;
      if (dC) y = pdfWriteWrapped(doc, `Criterion C — ${dC}`, y, layout, bodyFs, false);
      if (dC && (dD || dBand)) y += 6;
      if (dD) y = pdfWriteWrapped(doc, `Criterion D — ${dD}`, y, layout, bodyFs, false);
      if (dD && dBand) y += 6;
      if (dBand) y = pdfWriteWrapped(doc, `Total and IB band — ${dBand}`, y, layout, bodyFs, false);
      y += 10;
    }
    const p1 =
      modDisp.record.paragraphWhatWorkedWell != null ? String(modDisp.record.paragraphWhatWorkedWell).trim() : "";
    const p2 =
      modDisp.record.paragraphPrioritiesNextBand != null ? String(modDisp.record.paragraphPrioritiesNextBand).trim() : "";
    if (p1 || p2) {
      y = pdfSectionHeading(doc, "Final moderation — examiner comments", y, layout, 12);
      if (p1) y = pdfWriteWrapped(doc, p1, y, layout, bodyFs, false);
      if (p1 && p2) y += 6;
      if (p2) y = pdfWriteWrapped(doc, p2, y, layout, bodyFs, false);
      y += 10;
    }
  }

  y = pdfSectionHeading(doc, "Source text (stimulus)", y, layout, 12);
  y = pdfWriteWrapped(doc, src.trim() || "(empty)", y, layout, bodyFs, false);
  y += 10;

  y = pdfSectionHeading(doc, "Student analysis (paragraph or essay)", y, layout, 12);
  y = pdfWriteWrapped(doc, para.trim() || "(empty)", y, layout, bodyFs, false);
  y += 14;

  y = pdfSectionHeading(
    doc,
    `Criterion A — Knowledge and Understanding (final ${formatMarkForDashboard(fA)} / 5)`,
    y,
    layout,
    12
  );
  y = bundleA ? pdfAppendCriterionA(doc, bundleA, y, layout) : pdfWriteWrapped(doc, "(no bundle)", y, layout, bodyFs, false);
  y += 10;

  y = pdfSectionHeading(
    doc,
    `Criterion B — Analysis and Evaluation (final ${formatMarkForDashboard(fB)} / 5)`,
    y,
    layout,
    12
  );
  y = bundleB ? pdfAppendCriterionB(doc, bundleB, y, layout) : pdfWriteWrapped(doc, "(no bundle)", y, layout, bodyFs, false);
  y += 10;

  y = pdfSectionHeading(
    doc,
    `Criterion C — Focus, Organization & Development (final ${formatMarkForDashboard(fC)} / 5)`,
    y,
    layout,
    12
  );
  y = bundleC ? pdfAppendCriterionC(doc, bundleC, y, layout) : pdfWriteWrapped(doc, "(no bundle)", y, layout, bodyFs, false);
  y += 10;

  y = pdfSectionHeading(
    doc,
    `Criterion D — Language (final ${formatMarkForDashboard(fD)} / 5)`,
    y,
    layout,
    12
  );
  y = bundleD ? pdfAppendCriterionD(doc, bundleD, y, layout) : pdfWriteWrapped(doc, "(no bundle)", y, layout, bodyFs, false);

  const safeDate = now.toISOString().slice(0, 10);
  doc.save(`ib-paper1-full-report-${safeDate}.pdf`);
}
