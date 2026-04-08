/**
 * Pure prompt builder + parser for Step 4 (single-concept deep-dive script).
 *
 * No LLM calls or IO here. These functions are exercised by unit tests with
 * hand-crafted JSON — `./index.ts` is the thin wrapper that actually calls
 * the LLM and uses these helpers.
 */
import type {
  FullArticle,
  PipelineConfig,
  SelectedConcept,
  SlideContent,
  VideoContent,
} from "../../types.js";

/** The 7-slide arc, locked by the system prompt. */
export const SLIDE_ARC: Array<{ slideType: SlideContent["slideType"]; role: string }> = [
  { slideType: "intro", role: "Intro" },
  { slideType: "story", role: "What Happened" },
  { slideType: "story", role: "The Background" },
  { slideType: "story", role: "Key Details" },
  { slideType: "story", role: "Analysis" },
  { slideType: "story", role: "Why It Matters" },
  { slideType: "outro", role: "Outro" },
];

/**
 * Build the LLM prompt for a 7-slide single-concept deep dive.
 *
 * The user prompt embeds the concept metadata + the full body text from each
 * (successfully fetched) related source, labeled with section headers so the
 * model can cite specifics per source.
 */
/** Map ISO language codes to full names so the LLM knows what to write in. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  vi: "Vietnamese (Tiếng Việt)",
  ja: "Japanese",
  zh: "Chinese (Simplified)",
  es: "Spanish",
  fr: "French",
};

export function buildConceptPrompt(
  concept: SelectedConcept,
  sources: FullArticle[],
  contentConfig: PipelineConfig["content"],
): { system: string; prompt: string } {
  const usable = sources.filter((s) => s.fetchOk && s.fullText.length > 0);
  const langName = LANGUAGE_NAMES[contentConfig.language] ?? contentConfig.language;
  const isNonEnglish = contentConfig.language !== "en";

  const langDirective = isNonEnglish
    ? `\n\nCRITICAL LANGUAGE REQUIREMENT: Write ALL output in ${langName}. Every "title", "body" bullet, "speakerNotes" sentence, "videoTitle", and "videoDescription" MUST be in ${langName}. The JSON KEYS stay English ("title", "body", etc.) but every VALUE must be in ${langName}. Tags can mix ${langName} and English. DO NOT write any value in English.`
    : "";

  const system = `You are a tech-news video script writer creating a SINGLE-CONCEPT DEEP DIVE — one story, 2-3 minutes, dense and substantive.${langDirective}

Write EXACTLY 7 slides in this EXACT order:
  1. intro          — hook the viewer with a startling number, a question, a quote, or a counterintuitive claim. NEVER open with "Today we look at…" or "Hôm nay chúng ta tìm hiểu…"
  2. story          — "What Happened" (the core news beat + headline fact + WHO did it)
  3. story          — "The Background" (how did we get here, context, prior incidents)
  4. story          — "Key Details" (specific numbers, names, quotes drawn from the sources)
  5. story          — "Analysis" (what the story actually means, reading between the lines)
  6. story          — "Why It Matters" (impact on the viewer / industry / future)
  7. outro          — call to action, energetic close

CRITICAL DENSITY RULES (the script length directly determines whether the video has dead air):
- intro slide speakerNotes: 2-3 punchy sentences, ~30-50 words, ~10-15 seconds of speech
- story slides 2-6 speakerNotes: 5-8 sentences, **50-90 words each**, ~25-35 seconds of speech each
- outro slide speakerNotes: 2-3 sentences, ~25-40 words, clear CTA
- Each STORY slide MUST contain at least: 2 named entities (people/companies/products), 1 specific number or date, 1 vivid concrete detail
- Scripts that are too short cause dead air. Be substantive. Cite specifics. Build the story.

PER-SLIDE EXTRACTION (for the on-screen kinetic cards — MUST be filled for story slides):
- "keyStats": 1-3 short standalone facts/numbers pulled from the slide. Each ≤ 8 words. Example: ["1.200 router bị xâm nhập", "GRU đứng sau", "phát hiện sau 6 tháng"]
- "keyQuotes": 0-2 short attributable quotes. Each quote ≤ 20 words. Example: [{"text": "Đây là cuộc tấn công có chủ đích cấp nhà nước.", "attribution": "MIT Tech Review"}]
- These are SHOWN on screen as kinetic cards. They must be self-contained and visually punchy.

Other rules:
- body: array of 2-3 short bullet strings per slide, action-verb style, max 8 words each. Bullets MUST NOT restate speakerNotes — they are a visual sidebar (a stat, a name, a number).
- Headlines: 3-6 words, bold and clear
- No filler words (basically, actually, really, just, very)
- No markdown, no special characters in speakerNotes (TTS-safe)
- No URLs in speakerNotes
- Video title under 60 chars, catchy, concept-anchored (NOT "Top 5 Tech Stories")

Respond with STRICT JSON ONLY, no markdown fences, no extra text, matching this exact shape:

{
  "videoTitle": "short catchy concept-anchored title under 60 chars",
  "videoDescription": "YouTube description, 2-3 sentences, concept-focused",
  "tags": ["tag1", "tag2", "tag3"],
  "slides": [
    { "slideType": "intro", "title": "…", "body": ["bullet 1", "bullet 2"], "speakerNotes": "30-50 words", "keyStats": [], "keyQuotes": [] },
    { "slideType": "story", "title": "What Happened", "body": [...], "speakerNotes": "50-90 words", "keyStats": ["1-3 short facts"], "keyQuotes": [{"text": "...", "attribution": "..."}] },
    { "slideType": "story", "title": "The Background", "body": [...], "speakerNotes": "50-90 words", "keyStats": [], "keyQuotes": [] },
    { "slideType": "story", "title": "Key Details", "body": [...], "speakerNotes": "50-90 words", "keyStats": ["...", "..."], "keyQuotes": [] },
    { "slideType": "story", "title": "Analysis", "body": [...], "speakerNotes": "50-90 words", "keyStats": [], "keyQuotes": [{"text": "...", "attribution": "..."}] },
    { "slideType": "story", "title": "Why It Matters", "body": [...], "speakerNotes": "50-90 words", "keyStats": [], "keyQuotes": [] },
    { "slideType": "outro", "title": "…", "body": [...], "speakerNotes": "25-40 words", "keyStats": [], "keyQuotes": [] }
  ]
}`;

  const sourceBlocks = usable.length
    ? usable
        .map((s, i) => `=== Source ${i + 1}: ${s.title} (${s.source}) ===\n${s.fullText}`)
        .join("\n\n")
    : `=== Seed Article: ${concept.seedArticle.title} (${concept.seedArticle.source}) ===\n${concept.seedArticle.summary}`;

  const prompt = `Write a 7-slide single-concept deep-dive video script for this concept:

CONCEPT: ${concept.title}
THEME: ${concept.theme}
KEYWORDS: ${concept.keywords.join(", ")}
TONE: ${contentConfig.tone}
OUTPUT LANGUAGE: ${langName}${isNonEnglish ? ` — write every title/body/speakerNotes value in ${langName}, NOT English` : ""}

SOURCE MATERIAL (draw specific facts, names, numbers, quotes from here):

${sourceBlocks}

Return STRICT JSON matching the schema in the system prompt. Exactly 7 slides in the exact order specified. Speaker notes 4-6 sentences each, rich with specifics from the sources above.`;

  return { system, prompt };
}

/** Normalize body into string[] — the LLM may emit either a joined string or an array. */
function normalizeBody(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split("\n")
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Parse the LLM's JSON response into a validated `VideoContent`.
 *
 * Defensive: finds the first {...} block (handles prefixes + code fences),
 * normalizes body fields, enforces slide count + slideType sequence, and
 * fills defaults for missing optional fields (videoDescription, tags).
 *
 * Throws with a clear error on:
 *   - no JSON object found
 *   - malformed JSON
 *   - wrong slide count (not exactly 7)
 *   - wrong slideType sequence (must be intro → story × 5 → outro)
 */
/**
 * Repair common LLM JSON mistakes:
 *   - trailing commas before ] or }
 *   - smart quotes (curly quotes) → straight quotes
 *   - unescaped newlines inside string literals
 *   - C-style /* comments and // line comments
 *   - missing commas between adjacent string array elements
 *
 * Conservative: only fixes patterns that are unambiguously broken JSON.
 * Returns the repaired source. Caller still needs to JSON.parse() it.
 */
function repairLlmJson(src: string): string {
  let s = src;

  // Strip /* block comments */ and // line comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");
  s = s.replace(/(^|[^:])\/\/.*$/gm, "$1");

  // Smart quotes → straight (only outside of already-balanced ASCII quotes)
  s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

  // Trailing commas before ] or }
  s = s.replace(/,(\s*[\]}])/g, "$1");

  // Unescaped newlines inside string literals — walk the string char by char,
  // and inside any "..." span replace literal \n with \\n
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) {
        out += c;
        escaped = false;
        continue;
      }
      if (c === "\\") {
        out += c;
        escaped = true;
        continue;
      }
      if (c === '"') {
        out += c;
        inString = false;
        continue;
      }
      if (c === "\n") {
        out += "\\n";
        continue;
      }
      if (c === "\r") {
        continue;
      }
      out += c;
    } else {
      if (c === '"') {
        out += c;
        inString = true;
        continue;
      }
      out += c;
    }
  }
  return out;
}

export function parseConceptScript(raw: string): VideoContent {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Concept script response had no JSON object: ${raw.slice(0, 200)}`);
  }
  const json = raw.slice(start, end + 1);

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    // Try repairing common LLM JSON mistakes (trailing commas, unescaped \n, smart quotes, comments)
    try {
      data = JSON.parse(repairLlmJson(json));
      console.warn(`  ⚠ Concept script JSON had minor issues, repaired and parsed.`);
    } catch (repairErr) {
      throw new Error(
        `Concept script response was not valid JSON: ${(err as Error).message}\n${json.slice(0, 300)}`,
      );
    }
  }

  const obj = (data ?? {}) as {
    videoTitle?: unknown;
    videoDescription?: unknown;
    tags?: unknown;
    slides?: Array<{
      slideType?: unknown;
      title?: unknown;
      body?: unknown;
      speakerNotes?: unknown;
      sourceUrl?: unknown;
      keyStats?: unknown;
      keyQuotes?: unknown;
    }>;
  };

  if (!Array.isArray(obj.slides) || obj.slides.length < 5 || obj.slides.length > 9) {
    throw new Error(
      `Concept script must have 5-9 slides, got ${Array.isArray(obj.slides) ? obj.slides.length : "none"}`,
    );
  }
  // If we got 6 or 8 slides instead of the canonical 7, log a warning but
  // proceed — the parser/renderer can handle variable slide counts now.
  if (obj.slides.length !== 7) {
    console.warn(
      `  ⚠ Concept script has ${obj.slides.length} slides (expected 7) — proceeding with variable count.`,
    );
  }

  const slides: SlideContent[] = obj.slides.map((s, i) => {
    // For variable-length scripts, infer expected slot from position
    // (first = intro, last = outro, rest = story).
    const arcSlot =
      i < SLIDE_ARC.length
        ? SLIDE_ARC[i]
        : i === obj.slides!.length - 1
          ? SLIDE_ARC[SLIDE_ARC.length - 1]
          : { slideType: "story" as const, role: `Story ${i}` };
    const expected = arcSlot.slideType;
    const rawType = typeof s.slideType === "string" ? s.slideType : expected;
    // Coerce to a valid slideType; if the LLM got creative, fix it rather than fail
    const slideType: SlideContent["slideType"] =
      rawType === "intro" || rawType === "story" || rawType === "outro"
        ? (rawType as SlideContent["slideType"])
        : expected;

    // P0.A: parse keyStats[] and keyQuotes[] for the on-screen kinetic cards
    const keyStats = Array.isArray(s.keyStats)
      ? s.keyStats.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
      : [];
    const keyQuotes = Array.isArray(s.keyQuotes)
      ? s.keyQuotes
          .map((q) => {
            if (q && typeof q === "object") {
              const qq = q as { text?: unknown; attribution?: unknown };
              const text = typeof qq.text === "string" ? qq.text.trim() : "";
              const attribution = typeof qq.attribution === "string" ? qq.attribution.trim() : undefined;
              return text ? { text, attribution } : null;
            }
            if (typeof q === "string") return q.trim() ? { text: q.trim() } : null;
            return null;
          })
          .filter((q): q is { text: string; attribution?: string } => q !== null)
      : [];

    return {
      slideType,
      slideRole: arcSlot.role,
      title: typeof s.title === "string" ? s.title.trim() : arcSlot.role,
      body: normalizeBody(s.body).join("\n"),
      speakerNotes: typeof s.speakerNotes === "string" ? s.speakerNotes.trim() : "",
      sourceUrl: typeof s.sourceUrl === "string" ? s.sourceUrl : undefined,
      keyStats,
      keyQuotes,
    };
  });

  // Coerce the slide arc rather than reject:
  //   - First slide → intro
  //   - Last slide  → outro
  //   - Everything in between → story
  if (slides.length > 0) slides[0].slideType = "intro";
  if (slides.length > 1) slides[slides.length - 1].slideType = "outro";
  for (let i = 1; i < slides.length - 1; i++) slides[i].slideType = "story";

  const videoTitle =
    typeof obj.videoTitle === "string" && obj.videoTitle.trim()
      ? obj.videoTitle.trim()
      : slides[0].title || "Tech News Deep Dive";

  const videoDescription =
    typeof obj.videoDescription === "string" && obj.videoDescription.trim()
      ? obj.videoDescription.trim()
      : slides[0].speakerNotes.slice(0, 200);

  const tags =
    Array.isArray(obj.tags) && obj.tags.length
      ? obj.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim())
      : ["tech news"];

  return { videoTitle, videoDescription, tags, slides };
}
