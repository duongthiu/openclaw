/**
 * Per-slide entity extraction (P0.0).
 *
 * Given a slide's title + body + speakerNotes, ask the LLM to pull out
 * named entities so the visual-research step can fetch topic-specific
 * imagery (Wikipedia photos, Clearbit logos, source-article screenshots,
 * Pexels image search) instead of generic stock footage.
 *
 * One LLM call per slide. Uses the same fallback chain as the script step.
 */

import { generateTextWithFallback, stripCodeFences } from "../../content/llm.js";
import type { PipelineConfig, SlideContent } from "../../types.js";

export interface SlideEntities {
  /** Real people named in the slide (e.g. "Sam Altman", "Vladimir Putin"). Use Wikipedia for photos. */
  people: string[];
  /** Companies / organizations / agencies (e.g. "OpenAI", "GRU", "Asus"). Use Clearbit logos. */
  companies: string[];
  /** Specific products / models / software (e.g. "RT-AC68U", "GPT-5", "iPhone 17"). Use Wikipedia or Pexels image. */
  products: string[];
  /** Geographic places (e.g. "Russia", "Silicon Valley"). Use Wikipedia. */
  places: string[];
  /** Named events / incidents (e.g. "SolarWinds breach"). Use Wikipedia or screenshot. */
  events: string[];
  /** Abstract concepts as fallback Pexels search terms (e.g. "router security", "supply chain"). */
  concepts: string[];
}

const SYSTEM_PROMPT = `You are an entity extractor for a tech-news video. Given a single slide's title, body bullets, and narration, return a JSON object listing the named entities mentioned, grouped by type.

Rules:
- Extract ONLY entities that are EXPLICITLY mentioned in the input. Do not invent.
- Use canonical English names for international entities (e.g. "Russia" not "Nga", "OpenAI" not "OpenAI Inc."). This makes Wikipedia/logo lookups work.
- Vietnamese-only names (Vietnamese companies/people) stay in Vietnamese.
- Lowercase concepts; capitalized proper nouns for everything else.
- Limit each list to the top 5 most prominent entities.
- If a category has no matches, return an empty array.
- "concepts" is a fallback search-term list — short noun phrases (1-3 words) describing the topic visually.

Respond with STRICT JSON ONLY, this exact shape:
{"people":[],"companies":[],"products":[],"places":[],"events":[],"concepts":[]}`;

export async function extractSlideEntities(
  slide: SlideContent,
  contentConfig: PipelineConfig["content"],
): Promise<SlideEntities> {
  const empty: SlideEntities = {
    people: [],
    companies: [],
    products: [],
    places: [],
    events: [],
    concepts: [],
  };

  const slideText = [
    `Title: ${slide.title}`,
    `Body: ${Array.isArray(slide.body) ? slide.body.join(" | ") : slide.body}`,
    slide.speakerNotes ? `Narration: ${slide.speakerNotes.slice(0, 600)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const models = [contentConfig.model, ...(contentConfig.fallbackModels ?? [])];

  let raw: string;
  try {
    raw = await generateTextWithFallback(models, {
      system: SYSTEM_PROMPT,
      prompt: slideText,
    });
  } catch (err) {
    console.warn(`  ⚠ entity extraction failed for "${slide.title}": ${(err as Error).message.slice(0, 100)}`);
    return empty;
  }

  const cleaned = stripCodeFences(raw);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return empty;
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const arr = (k: string): string[] =>
    Array.isArray(obj[k])
      ? (obj[k] as unknown[])
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((x) => x.trim())
          .slice(0, 5)
      : [];

  return {
    people: arr("people"),
    companies: arr("companies"),
    products: arr("products"),
    places: arr("places"),
    events: arr("events"),
    concepts: arr("concepts"),
  };
}
