// ─── Examiner training background ────────────────────────────────────────────
// Prepended to every system prompt so every call is calibrated from the start.

const EXAMINER_TRAINING_BACKGROUND = `\
═══════════════════════════════════════════════════════════════════════════════
IB ENGLISH A — PAPER 1 (LITERATURE HL): EXAMINER TRAINING BACKGROUND
═══════════════════════════════════════════════════════════════════════════════

All responses to IB Paper 1 (Literature HL) are marked against four criteria,
each scored on a 0–5 scale, for a maximum total of 20 marks (four criteria × up to 5 each).

This is a 75-minute unseen essay, not a polished assignment. Occasional errors
in an otherwise controlled response should not automatically lower the band —
it is the PATTERN across the response that determines the score; holistic impression is the primary anchor for final marks, with notes and annotations used to adjust when patterns clearly disagree.

───────────────────────────────────────────────────────────────────────────────
CRITERION A — KNOWLEDGE AND UNDERSTANDING
───────────────────────────────────────────────────────────────────────────────

Criterion A rewards depth and quality of interpretation. The key distinction
across bands is not WHAT the student understands (all bands typically grasp the
literal content) but HOW FAR they extend that understanding into inference,
implication, and authorial purpose. High-band students demonstrate that every
detail is a deliberate choice with specific meaning; mid-band students grasp
implications but do not pursue them fully; low-band students remain tethered to
surface paraphrase or make interpretive leaps that are not grounded in the text.

GOOD EXAMPLES:

Exemplar B — "The Negro Speaks of Rivers" — Hughes (5/5/5/5)
"Hughes' inclusion of washing in water resembles baptism, which Christians must
undergo after birth, countering older views that Africans are heathens, in other
words, not part of Christian faith. At the same time, dawn symbolizes hope and
new start, as well as cyclic patterns of nature, bringing to light the
alternating triumphs and horrors Hughes' people experience, just like a life
cycle."
→ Sophisticated contextual interpretation: the student recognises the baptism
  allusion and immediately evaluates its ideological stakes — it is not merely a
  water image but a counter-argument against the historical dehumanisation of
  African people. The further reading of 'dawn' as both hope AND cyclical time
  shows interpretive layering — the student holds multiple implications
  simultaneously. Textbook score-5 interpretation.

Exemplar C — "Moon Tiger" — Lively (4/4/5/5)
"His emotions at her fall are described as a mix of 'horror and satisfaction.'
This illustrates how Gordon views Claudia's presence as an invasion... The
emotional contradiction of 'horror and satisfaction' deepens his character,
suggesting guilt mixed with vindication."
→ The student does not resolve the contradiction into a simple reading but holds
  both emotions simultaneously and evaluates what this reveals about Gordon's
  psychology. 'Guilt mixed with vindication' is a strong and nuanced interpretive
  move — it captures the moral complexity of a character who is both implicated
  in the accident and relieved by it.

BAD EXAMPLES:

"The author then bring it all together with the sentence 'white house, white
rock, friends and a narrow style of loving.' This incompases each paragraph into
one atmosphere describing 'Greece' as a whole."
→ The reading is too broad. 'Greece as a whole' vastly overstates what this
  particular lyrical image claims. The final line is an intimate, personal
  declaration — not a grand summary of an entire country's character. Low-band
  responses frequently over-generalise, substituting sweeping claims for specific
  interpretation.

"the male 'counterpart' is like something 'sticky' or 'creamy deposited' in a
'locker', illustrating Denby's point that popular boys are naughty and hard to
completely eliminate."
→ Denby's deliberately grotesque, hyperbolic imagery is meant to satirise the
  jock archetype through comedic exaggeration. The student reads this almost
  literally, completely missing the satirical register. This failure to read tone
  and mode is a Low-band characteristic.

"Denby argues that youth culture fails to provide successful transition to
adulthood, since it does not prepare teenagers for the job market."
→ This misreads Denby's argument. His critique is that teen movies fail to
  challenge consumerist ideology. The student substitutes 'job market' for this
  more complex argument about ideology. Low-band responses characteristically
  'reframe' the text in simpler or more familiar terms, losing specificity.

───────────────────────────────────────────────────────────────────────────────
CRITERION B — ANALYSIS AND EVALUATION OF STYLISTIC FEATURES
───────────────────────────────────────────────────────────────────────────────

Criterion B is the most technically demanding criterion. It rewards the student's
ability to identify specific literary and authorial choices and to evaluate,
precisely and convincingly, HOW those choices construct meaning. The key examiner
question is: does the student simply name a device, or do they evaluate the
mechanism by which the device creates its effect?

High-band: 'insightful and convincing analysis' — moves beyond labelling to
sustained evaluation.
Mid-band: 'generally appropriate analysis' — devices correctly identified but
evaluative layer is thin or inconsistent.
Low-band: 'reliant on description' — notes what is in the text without
meaningfully analysing how it works.

GOOD EXAMPLE:

"In line 19, the Ionian sea is called a 'troubled blue.' Blue carries
connotations of clarity and purity, but the insertion of the word troubled
corrupts these connotations. The word choice here insinuates that what appears
to be clear hides secrets, that the pure, beautiful blue is mottled by something
darker."
→ Exemplary technique: the student isolates 'troubled' and traces the precise
  mechanism of its effect — it does not simply modify 'blue' but actively
  undermines ('corrupts') an established connotation system. The verb 'insinuates'
  is itself analytically precise. This is insightful analysis of HOW a single
  modifier reshapes the reader's interpretive experience.

BAD EXAMPLES:

"The simile of butterfly adds a lively, elegant character to the blossoms, which
awestrucks the reader. The image of pink dot blossoms 'amassing' on branches
create a dappled, impressionistic image."
→ The simile is identified and qualities assigned ('lively, elegant',
  'impressionistic') but these are descriptive of the image's effect rather than
  analytical of WHY the butterfly is the chosen vehicle. Butterflies carry
  specific connotations of transience (short lifespan), transformation
  (metamorphosis), and delicate beauty — none of these connotative dimensions are
  evaluated.

"popular girls often have a 'slatternly' tongue that 'devastates' other kids
with insults such as they are 'vapor', which refers to a transparent though
ubiquitous gas in the air."
→ The explanation of 'vapor' is scientific, not literary — it describes what
  vapour is rather than what it means in this context (invisible, pervasive,
  insubstantial — a devastating metaphor for social non-existence). 'Slatternly'
  is quoted but entirely ignored analytically.

───────────────────────────────────────────────────────────────────────────────
CRITERION C — FOCUS, ORGANISATION, AND DEVELOPMENT
───────────────────────────────────────────────────────────────────────────────

Criterion C assesses the architecture of the response: whether the student has
a clear, coherent argument consistently sustained across the essay. Distinguish
between mechanical organisation (paragraphs with topic sentences and connectors)
and genuine analytical focus (structure serves the argument). A response can be
well-organized chronologically but lack analytical focus; it can have topic
sentences but still wander within paragraphs.

GOOD EXAMPLE:

"Through the use of symbolism, Hughes stresses that rivers has been the
birthplace of Africans... Aside from origins and the struggle for independence,
Hughes utilizes repetition to display the evolution of African identity."
→ Topic sentences consistently use argumentative framing — each one makes a
  claim that requires demonstration. 'Aside from origins and the struggle for
  independence' is a sophisticated transition that summarises the preceding
  argument before introducing the next element, creating genuine argumentative
  continuity rather than simple addition.

BAD EXAMPLES:

Topic Sentence: The author uses oppressive sensory imagery to establish the protagonist’s sense of entrapment within the urban landscape. For example, the "heavy smell of diesel and damp concrete" suggests a suffocating environment that weighs on the character. This diesel smell is common in industrial settings, which often represent the transition from the 19th-century pastoral life to modern decay. The author might be referencing the Industrial Revolution here, showing how machines replaced people. By the end of the passage, the character is walking toward a bus station, which further emphasizes how public transport dictates the movement of the poor in modern cities.

Why it fails Criterion C

The Breakdown: It begins with a strong focus on sensory imagery and entrapment. However, it quickly "drifts" into a history lesson about the Industrial Revolution and a literal observation about bus stations.

The Result: The argument about how the imagery creates a sense of entrapment is abandoned in favor of external context and plot summary. The paragraph "wanders" away from its own topic sentence.

The Paragraph

Topic Sentence: The protagonist’s internal monologue reveals a state of total confidence. However, her hesitation before opening the door suggests a deep-seated fear of the unknown. On the other hand, she chooses to enter anyway, which could be interpreted as a sign of bravery. Nonetheless, the trembling of her hands contradicts this courage, proving she is actually weak. Ultimately, the author presents a character who is both strong and weak at the same time, though the strength is perhaps just a facade for her underlying terror.

Why it fails Criterion C

The Breakdown: The student is using "analytical pivots" (However, On the other hand, Nonetheless) as a crutch. Instead of synthesizing these observations into a complex point (e.g., "The protagonist performs a mask of confidence that is betrayed by her physical frailty"), the student simply bounces back and forth.

The Result: There is no sustained argument. By the end of the paragraph, the reader has no idea what the student actually thinks about the character because the paragraph has argued three different things.

Topic Sentence: The author employs various literary devices in the second stanza to create meaning. First, there is alliteration in the phrase "dark and dismal," which creates a gloomy mood. Then, a metaphor is used when the wind is compared to a "howling wolf," adding to the tension. The author also uses a short sentence—"He waited."—to create suspense through syntax. Finally, the color white is mentioned, which symbolizes purity, and there is an oxymoron in the final line which shows the character’s confusion. All these devices work together to show the author’s style.

Why it fails Criterion C

The Breakdown: This is a "kitchen sink" approach. The student is "doing analysis" by labeling devices, but there is no thematic spine. They treat a comma, a color, and a metaphor with the same level of importance.

The Result: This lacks genuine analytical focus. The structure is dictated by the order of the lines in the text, not by an argument. It’s a list of observations disguised as a paragraph.
───────────────────────────────────────────────────────────────────────────────
CRITERION D — LANGUAGE
───────────────────────────────────────────────────────────────────────────────

Criterion D rewards the quality, precision, and consistency of the student's own
language — separate from the quality of their ideas. Attend to: accuracy of
grammar and spelling, sentence variety and control, appropriateness of register
(formal, analytical, essay-appropriate), and precision of vocabulary choices.

IMPORTANT: This is a 75-minute unseen essay, not a polished assignment. Occasional
errors in an otherwise controlled response should not automatically lower the band
— it is the PATTERN across the response that determines the score.

A student with sophisticated ideas expressed imprecisely will lose marks on D.


═══════════════════════════════════════════════════════════════════════════════
END OF EXAMINER TRAINING BACKGROUND
═══════════════════════════════════════════════════════════════════════════════

`;

// ─── Storage keys ────────────────────────────────────────────────────────────

const KEY_API_KEY    = 'ib-grader-api-key';
const KEY_MODEL      = 'ib-grader-model';

/** Default when nothing saved or when a legacy provider id is still in localStorage. */
const DEFAULT_OPENROUTER_MODEL = 'google/gemma-4-31b-it:free';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const KEY_SOURCE     = 'ib-grader-source-text';
const KEY_STUDENT    = 'ib-grader-student-paragraph';
const KEY_CLASSIFY   = 'ib-grader-classification';
const KEY_SCORE_A    = 'ib-grader-score-a';
const KEY_SCORE_B    = 'ib-grader-score-b';
const KEY_SCORE_C    = 'ib-grader-score-c';
const KEY_SCORE_D    = 'ib-grader-score-d';
const KEY_OVERALL    = 'ib-grader-overall';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey()            { return localStorage.getItem(KEY_API_KEY) ?? ''; }
function setApiKey(v)           { localStorage.setItem(KEY_API_KEY, v); }
function getModel()             { return localStorage.getItem(KEY_MODEL) ?? DEFAULT_OPENROUTER_MODEL; }
function setModel(v)            { localStorage.setItem(KEY_MODEL, v); }

// ─── API client ───────────────────────────────────────────────────────────────

/**
 * All models route through OpenRouter (OpenAI-compatible chat completions).
 *
 * @param {string}      systemPrompt
 * @param {string}      userContent
 * @param {object|null} schema — Unused; JSON shape is enforced via prompts + `response_format`.
 * @param {boolean}     forceJson — Request JSON object output (default true).
 * @returns {Promise<string>}
 */
async function callApi(systemPrompt, userContent, schema = null, forceJson = true) {
  void schema;
  const apiKey = getApiKey().trim();
  const model  = getModel();

  if (!apiKey) throw new Error('No API key saved. Paste your key in the "Model API" panel.');

  const fullSystem = EXAMINER_TRAINING_BACKGROUND + systemPrompt;

  return callOpenRouter(apiKey, model, fullSystem, userContent, forceJson);
}

function openRouterMessageContent(message) {
  const c = message?.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c.map((part) => {
    if (typeof part === 'string') return part;
    if (part && typeof part.text === 'string') return part.text;
    return '';
  }).join('');
}

async function callOpenRouter(apiKey, model, systemPrompt, userContent, forceJson = true) {
  const body = {
    model,
    temperature: 0.4,
    max_tokens: 16384,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    ...(forceJson ? { response_format: { type: 'json_object' } } : {}),
  };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (typeof location !== 'undefined' && location?.origin && location.origin !== 'null') {
    headers['HTTP-Referer'] = location.origin;
    headers['X-Title'] = 'L.A.E.R.T.E.S IB Paper 1 Analyzer';
  }

  const controller = new AbortController();
  const timeoutMs = 120_000;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const msg = e?.name === 'AbortError'
      ? `OpenRouter request timed out after ${timeoutMs / 1000}s`
      : (e?.message ?? String(e));
    throw new Error(`OpenRouter network error: ${msg}`);
  } finally {
    clearTimeout(t);
  }

  const rawErr = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = rawErr?.error?.message ?? rawErr?.message ?? res.statusText;
    throw new Error(`OpenRouter API error ${res.status}: ${detail}`);
  }

  const data = rawErr;
  const text = openRouterMessageContent(data?.choices?.[0]?.message);
  if (!text) throw new Error('OpenRouter returned an empty response.');
  return text;
}

/**
 * Parse JSON from a model response — strips markdown code fences if present.
 * @param {string} raw
 * @returns {any}
 */
function parseJson(raw) {
  // 1. Strip markdown code fences
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  // 2. If there's still non-JSON text before/after the object, extract the outermost {...} or [...]
  const firstBrace   = s.indexOf('{');
  const firstBracket = s.indexOf('[');
  let start = -1;
  let closer = '';
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace; closer = '}';
  } else if (firstBracket !== -1) {
    start = firstBracket; closer = ']';
  }

  if (start > 0 || (start !== -1 && s[s.length - 1] !== closer)) {
    // Walk from the end to find the matching closing delimiter
    const end = s.lastIndexOf(closer);
    if (start !== -1 && end > start) s = s.slice(start, end + 1);
  }

  return JSON.parse(s);
}
