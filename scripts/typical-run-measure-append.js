/* Appended after client.js + app.js (with boot() stripped) inside calibrate-typical-run.mjs. */

function approxInputTokensFromChars(charCount) {
  return Math.max(0, Math.ceil(charCount / 4));
}

function approxOutputTokensFromChars(charCount) {
  return Math.max(0, Math.ceil(charCount / 3.5));
}

function buildEqualChunksForCost(studentText, nChunks) {
  const paras = studentText.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  const allWords = [];
  const wordPara = [];
  for (let p = 0; p < paras.length; p++) {
    const ws = paras[p].split(/\s+/).filter(Boolean);
    for (const w of ws) {
      allWords.push(w);
      wordPara.push(p);
    }
  }
  const total = allWords.length;
  const chunkWordStarts = [];
  let off = 0;
  for (let i = 0; i < nChunks; i++) {
    chunkWordStarts.push(off);
    const take = Math.ceil((total - off) / (nChunks - i));
    off += take;
  }
  const chunks = chunkWordStarts.map((start, i) => {
    const take = Math.ceil((total - start) / (nChunks - i));
    return allWords.slice(start, start + take).join(" ");
  });
  const paraStartSet = new Set([0]);
  for (let i = 1; i < nChunks; i++) {
    if (wordPara[chunkWordStarts[i]] !== wordPara[chunkWordStarts[i - 1]]) {
      paraStartSet.add(i);
    }
  }
  return { chunks, paraStartSet };
}

function typicalRunSyntheticWordBlob(targetWords, seedPrefix) {
  const cycl = ['analysis', 'argument', 'author', 'image', 'reader', 'essay', 'meaning', 'effect', 'structure', 'language', 'source', 'passage', 'technique', 'claim', 'evidence'];
  const parts = [];
  for (let w = 0; w < targetWords; w++) {
    parts.push(`${cycl[w % cycl.length]}-${seedPrefix}${w}`);
  }
  return parts.join(' ');
}

function typicalRunSyntheticEssayForSplit(totalWords, paragraphs) {
  const per = Math.floor(totalWords / paragraphs);
  const paras = [];
  for (let p = 0; p < paragraphs; p++) {
    const extra = p === paragraphs - 1 ? totalWords - per * paragraphs : 0;
    paras.push(typicalRunSyntheticWordBlob(per + extra, `p${p}`));
  }
  return paras.join('\n\n');
}

function syntheticNotesForTypicalRun(chunkIndex, totalChunks) {
  const pct = Math.round(((chunkIndex + 1) / totalChunks) * 100);
  const thesis = chunkIndex >= 2
    ? 'The student argues that the author uses patterning and contrast to qualify human frustration within social order.'
    : '';
  const nodeCount = Math.max(1, Math.min(20, Math.round((chunkIndex + 1) * (20 / totalChunks))));
  const reasoning = Array.from({ length: nodeCount }, (_, i) => ({
    text: `Reasoning node ${i + 1}: links ${['motif', 'structure', 'register', 'tone'][i % 4]} to the essay’s line on meaning; execution reads ${['thin', 'mixed', 'competent', 'clear'][i % 4]} at ${pct}% read.`,
    depth: i % 3,
  }));
  const concerns = chunkIndex >= Math.floor(totalChunks * 0.3)
    ? ['Macro concern: evidence sometimes outpaces interpretive control.', 'Some paragraphs repeat moves without advancing the thesis line.']
    : [];
  return {
    thesis,
    reasoning,
    readerState: `First-read state at chunk ${chunkIndex + 1}/${totalChunks} (~${pct}%): tracking cumulative quality and argument shape.`,
    concerns,
    feeling: {
      A: chunkIndex > 0 ? 'A: local interpretation mostly anchored; occasional generalisation.' : '',
      B: chunkIndex > 0 ? 'B: technique naming uneven; some sound mechanism–effect, some shallow.' : '',
      C: chunkIndex > 0 ? 'C: organisation broadly followable; mid-essay drift in focus.' : '',
      D: chunkIndex > 0 ? 'D: academic register held; phrasing sometimes imprecise.' : '',
    },
    overallImpression: initialNotes().overallImpression,
  };
}

function syntheticOverallImpressionForTypicalRun(chunkIndexEnd, totalChunks) {
  const pct = Math.round(((chunkIndexEnd + 1) / totalChunks) * 100);
  const para = (band, pos) => {
    const base = 'Holistic read: extent and quality across the essay so far; anchor to intro and body balance. ';
    const filler = 'Wording scales with read progress. '.repeat(3) + 'x'.repeat(Math.min(320, 80 + pct * 3));
    return {
      band, position: pos, confidence: pct <= 40 ? 'low' : pct < 70 ? 'medium' : 'medium',
      shift: '0',
      note: base + filler,
    };
  };
  return {
    A: para('mid', 2),
    B: para('mid', 2),
    C: para('mid', 2),
    D: para('mid', 2),
  };
}

function syntheticAnnotationsForTypicalRunUpTo(endChunkIdx) {
  const types = ['A_CHECK', 'B_CHECK', 'B_CROSS', 'C_CHECK', 'D_CHECK', 'A_STAR'];
  const out = [];
  for (let c = 0; c <= endChunkIdx; c++) {
    const count = 4 + (c % 3);
    for (let j = 0; j < count; j++) {
      out.push({
        chunkIndex: c,
        criterion: ['A', 'B', 'C', 'D'][j % 4],
        type: types[(c + j) % types.length],
        anchor: `anchor phrase chunk ${c} mark ${j}`,
        note: 'Examiner note: ties observation to criterion expectations for calibration.',
      });
    }
  }
  return out;
}

function syntheticChunkReadResponseJson(totalChunks, chunkIndex) {
  const notes = syntheticNotesForTypicalRun(chunkIndex, totalChunks);
  const annotations = Array.from({ length: 5 }, (_, j) => ({
    target: j % 2 === 0 ? 'current' : 'prev',
    anchor: `short anchor text ${chunkIndex} ${j}`,
    criterion: ['A', 'B', 'C', 'D'][j % 4],
    type: ['A_CHECK', 'B_CHECK', 'C_SIGNPOST', 'D_AWK', 'B_STAR'][j],
    note: 'Brief rationale for this mark.',
  }));
  return JSON.stringify({ notes, annotations });
}

function syntheticHolisticResponseJson(totalChunks, chunkIndexEnd) {
  return JSON.stringify({ overallImpression: syntheticOverallImpressionForTypicalRun(chunkIndexEnd, totalChunks) });
}

function syntheticScoreAllResponseJson() {
  const mk = (s) => ({
    score: s,
    keyStrengths: ['Sustained argument discipline on key paragraphs.', 'Some precise technique–effect moves in the body.'],
    keyWeaknesses: ['Uneven depth when moving beyond literal reading.', 'Organisation drifts in later sections.'],
    bandBoundary: 'This is a representative boundary sentence for cost sizing, not a real mark.',
    justification: 'Representative four-sentence justification body for token estimate. '.repeat(2)
      + 'It mirrors the requested length in the scorer prompt without claiming a real essay result.',
  });
  return JSON.stringify({ A: mk(3), B: mk(3), C: mk(3), D: mk(3) });
}

function computeTypicalRunProfileFromPrompts() {
  const scenario = {
    sourceWords: 650,
    essayWords: 900,
    bodyParagraphs: 4,
  };
  const sourceText = typicalRunSyntheticWordBlob(scenario.sourceWords, 'src');
  const studentText = typicalRunSyntheticEssayForSplit(scenario.essayWords, scenario.bodyParagraphs);
  const nChunks = 26;
  const { chunks, paraStartSet } = buildEqualChunksForCost(studentText, nChunks);
  const holistics = countHolisticPassesForChunkCount(nChunks);
  const bg = EXAMINER_TRAINING_BACKGROUND;

  let sumInputChars = 0;
  let sumOutChars = 0;

  for (let i = 0; i < nChunks; i++) {
    const notes = syntheticNotesForTypicalRun(i, nChunks);
    const prev = i > 0 ? chunks[i - 1] : null;
    const prev2 = i > 1 ? chunks[i - 2] : null;
    const next = i < nChunks - 1 ? chunks[i + 1] : null;
    const paraLabel = getParaLabel(i, paraStartSet);
    const sys = buildReadChunkSystemPrompt(i, nChunks, paraLabel);
    const usr = buildReadChunkUserMessage(sourceText, prev2, prev, chunks[i], next, notes, i, nChunks, paraLabel);
    sumInputChars += (bg + sys + usr).length;
    sumOutChars += syntheticChunkReadResponseJson(nChunks, i).length;
  }

  for (let i = 0; i < nChunks; i++) {
    const runHolistic = (i + 1) % 2 === 0 || i === nChunks - 1;
    const chunkPct = (i + 1) / nChunks;
    if (!(runHolistic && chunkPct >= 0.2)) continue;

    const chunkIndexEnd = i;
    const annotations = syntheticAnnotationsForTypicalRunUpTo(chunkIndexEnd);
    const priorOi = chunkIndexEnd > 0
      ? syntheticOverallImpressionForTypicalRun(chunkIndexEnd - 1, nChunks)
      : initialNotes().overallImpression;
    const notesForHolistic = {
      ...syntheticNotesForTypicalRun(chunkIndexEnd, nChunks),
      overallImpression: priorOi,
    };

    const hSys = buildHolisticImpressionSystemPrompt(chunkIndexEnd, nChunks);
    const hUsr = buildHolisticPassUserMessage(sourceText, chunks, paraStartSet, chunkIndexEnd, nChunks, notesForHolistic, annotations);
    sumInputChars += (bg + hSys + hUsr).length;
    sumOutChars += syntheticHolisticResponseJson(nChunks, chunkIndexEnd).length;
  }

  const finalNotes = {
    ...syntheticNotesForTypicalRun(nChunks - 1, nChunks),
    overallImpression: syntheticOverallImpressionForTypicalRun(nChunks - 1, nChunks),
  };
  const finalAnnotations = syntheticAnnotationsForTypicalRunUpTo(nChunks - 1);
  const approxWords = nChunks * CHUNK_TARGET_WORDS;
  const sSys = buildScoreAllCriteriaSystemPrompt(approxWords);
  const sUsr = buildScoreAllCriteriaUserMessage(finalNotes, buildScoreAllCriteriaAnnBlock(finalAnnotations));
  sumInputChars += (bg + sSys + sUsr).length;
  sumOutChars += syntheticScoreAllResponseJson().length;

  const totalCalls = nChunks + holistics + 1;
  const inputTok = approxInputTokensFromChars(sumInputChars);
  const outputTok = approxOutputTokensFromChars(sumOutChars);

  return {
    nChunks,
    holistics,
    readCalls: nChunks,
    scoreCalls: 1,
    totalCalls,
    inputTok,
    outputTok,
    inputCharsTotal: sumInputChars,
    outputCharsTotal: sumOutChars,
    scenario,
    methodologyLabel:
      `Typical run (fixed): synthetic ${scenario.sourceWords}-word source + ${scenario.essayWords}-word ${scenario.bodyParagraphs}-paragraph essay → ${nChunks} equal word chunks `
      + `(paragraph boundaries preserved for labels). ${totalCalls} API calls; input = Σ(EXAMINER_TRAINING_BACKGROUND + system + user) `
      + `UTF-16 code units per call. Output = representative JSON per step; tokens ≈ input_chars÷4, output_chars÷3.5 `
      + `(real BPE ±~10–25%). Re-run scripts/calibrate-typical-run.mjs after prompt or background edits.`,
  };
}

globalThis.__CAL = computeTypicalRunProfileFromPrompts();
