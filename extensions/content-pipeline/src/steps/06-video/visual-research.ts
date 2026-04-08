/**
 * Visual research orchestrator (P0.0 + P0.A) — turns slides into rich
 * topic-aware visual sequences with A-roll anchors and B-roll cutaways.
 *
 * For each slide:
 *   1. Extract entities via the LLM (people / companies / products / places / events / concepts)
 *   2. Decide the A-roll kind based on slide role:
 *        - intro / outro          → title-card  (typewritten title)
 *        - "What Happened"        → article-scroll  (source article screenshot)
 *        - "Background"           → timeline-card
 *        - "Key Details"          → stat-card  (from script's keyStats[])
 *        - "Analysis"             → quote-card  (from script's keyQuotes[])
 *        - "Why It Matters"       → stat-card or quote-card
 *   3. Fetch B-roll cutaways from external sources, in priority order:
 *        - Wikipedia photos for people / places / products / events
 *        - Clearbit logos for companies
 *        - Pexels photos for concepts / fallback
 *   4. Build a per-slide VisualPlan: A-roll item + 1-3 B-roll items, with
 *      durations summing to the slide's TTS audio length.
 *
 * Returns null for slides where no visuals could be assembled (caller
 * should fall back to the existing single-Pexels-clip path for that slide).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AudioSegment,
  FullArticle,
  PipelineConfig,
  SlideContent,
  VisualItem,
  VisualPlan,
} from "../../types.js";
import { extractSlideEntities, type SlideEntities } from "./entity-extract.js";
import {
  articleScreenshot,
  clearbitLogo,
  pexelsPhotoSearch,
  wikipediaImage,
} from "./visual-fetchers.js";

interface ResearchInputs {
  slides: SlideContent[];
  audioSegments: AudioSegment[];
  relatedSources?: FullArticle[];
  outputDir: string;
  config: PipelineConfig;
}

/** Decide which A-roll component each slide should anchor on. */
function pickAroleKind(
  slide: SlideContent,
): "title-card" | "stat-card" | "quote-card" | "article-scroll" | "timeline-card" {
  if (slide.slideType === "intro" || slide.slideType === "outro") return "title-card";
  const role = (slide.slideRole || slide.title || "").toLowerCase();
  if (role.includes("happened") || role.includes("what")) return "article-scroll";
  if (role.includes("background")) return "timeline-card";
  if (role.includes("detail")) return "stat-card";
  if (role.includes("analysis")) return "quote-card";
  if (role.includes("matter") || role.includes("why")) return "stat-card";
  // Story slide with no recognized role: prefer stat-card if we have stats, else quote-card
  if (slide.keyStats && slide.keyStats.length > 0) return "stat-card";
  if (slide.keyQuotes && slide.keyQuotes.length > 0) return "quote-card";
  return "title-card";
}

/** Heuristic source-name guess for screenshot/quote attribution. */
function hostnameOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * Build the A-roll item for one slide. Some kinds need a downloaded asset
 * (article-scroll → screenshot file); others are pure text and the path is
 * empty (Remotion renders them from the `text`/`subtext` fields).
 */
async function buildAroll(
  slide: SlideContent,
  i: number,
  inputs: ResearchInputs,
  visualsDir: string,
): Promise<VisualItem> {
  const kind = pickAroleKind(slide);
  const idx = String(i + 1).padStart(2, "0");

  // Title cards (intro/outro): pure text typewriter, no asset
  if (kind === "title-card") {
    return {
      role: "a-roll",
      kind: "title-card",
      text: slide.title || "",
      subtext: slide.body
        ? (Array.isArray(slide.body) ? slide.body.join("\n") : String(slide.body)).slice(0, 120)
        : undefined,
      durationSec: 0, // filled in by caller
    };
  }

  // Stat card: uses the first keyStat (largest/punchiest)
  if (kind === "stat-card") {
    const stat = slide.keyStats?.[0];
    if (stat) {
      // Try to split "1.200 router bị xâm nhập" → number / label
      const m = stat.match(/^([\d.,%+\-$€£]+\s*[KMB]?\+?)\s+(.+)$/);
      return {
        role: "a-roll",
        kind: "stat-card",
        text: m ? m[1] : stat,
        subtext: m ? m[2] : slide.title,
        durationSec: 0,
      };
    }
    // No stat available → degrade to title card
    return { role: "a-roll", kind: "title-card", text: slide.title || "", durationSec: 0 };
  }

  // Quote card: uses the first keyQuote
  if (kind === "quote-card") {
    const q = slide.keyQuotes?.[0];
    if (q) {
      return {
        role: "a-roll",
        kind: "quote-card",
        text: q.text,
        subtext: q.attribution || hostnameOf(slide.sourceUrl),
        durationSec: 0,
      };
    }
    // No quote → degrade to title card
    return { role: "a-roll", kind: "title-card", text: slide.title || "", durationSec: 0 };
  }

  // Timeline card: pure text + bullets (Remotion renders the timeline)
  if (kind === "timeline-card") {
    const items = slide.body
      ? (Array.isArray(slide.body) ? slide.body : String(slide.body).split("\n"))
          .map((x) => x.replace(/^[-•*]\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];
    return {
      role: "a-roll",
      kind: "timeline-card",
      text: slide.title,
      subtext: items.join("|"),
      durationSec: 0,
    };
  }

  // Article scroll: needs an actual screenshot from one of the related sources
  if (kind === "article-scroll") {
    // Prefer the slide's own sourceUrl, else fall back to the seed/related sources
    const candidates: string[] = [];
    if (slide.sourceUrl) candidates.push(slide.sourceUrl);
    for (const r of inputs.relatedSources ?? []) {
      if (r.url && !candidates.includes(r.url)) candidates.push(r.url);
    }
    for (const url of candidates.slice(0, 3)) {
      const path = await articleScreenshot(url, visualsDir, `screenshot_${idx}`);
      if (path) {
        return {
          role: "a-roll",
          kind: "article-scroll",
          path,
          text: slide.title,
          subtext: hostnameOf(url),
          durationSec: 0,
        };
      }
    }
    // Screenshot failed → degrade to title card
    return { role: "a-roll", kind: "title-card", text: slide.title || "", durationSec: 0 };
  }

  return { role: "a-roll", kind: "title-card", text: slide.title || "", durationSec: 0 };
}

/**
 * Build B-roll cutaway items from extracted entities.
 * Walks the entities in priority order and fetches the first 2-3 that succeed.
 */
async function buildBroll(
  entities: SlideEntities,
  i: number,
  inputs: ResearchInputs,
  visualsDir: string,
  maxItems = 3,
): Promise<VisualItem[]> {
  const out: VisualItem[] = [];
  const idx = String(i + 1).padStart(2, "0");
  const pexelsKey = process.env[inputs.config.video.pexels?.apiKeyEnv ?? "PEXELS_API_KEY"];

  // Priority 1: Wikipedia photos for people / places / products / events
  const wikiTargets: Array<{ name: string; tag: string }> = [
    ...entities.people.slice(0, 2).map((n) => ({ name: n, tag: "person" })),
    ...entities.places.slice(0, 1).map((n) => ({ name: n, tag: "place" })),
    ...entities.products.slice(0, 1).map((n) => ({ name: n, tag: "product" })),
    ...entities.events.slice(0, 1).map((n) => ({ name: n, tag: "event" })),
  ];
  for (const t of wikiTargets) {
    if (out.length >= maxItems) break;
    const path = await wikipediaImage(t.name, visualsDir, `wiki_${idx}_${out.length + 1}`);
    if (path) {
      out.push({
        role: "b-roll",
        kind: "wikipedia",
        path,
        durationSec: 0,
        caption: t.name,
      });
    }
  }

  // Priority 2: Clearbit logos for companies
  for (const co of entities.companies.slice(0, 2)) {
    if (out.length >= maxItems) break;
    const path = await clearbitLogo(co, visualsDir, `logo_${idx}_${out.length + 1}`);
    if (path) {
      out.push({
        role: "b-roll",
        kind: "logo",
        path,
        durationSec: 0,
        caption: co,
      });
    }
  }

  // Priority 3: Pexels photo for concepts (fallback atmospheric)
  if (out.length < maxItems && pexelsKey) {
    const conceptTerm = entities.concepts[0] || entities.products[0] || entities.events[0];
    if (conceptTerm) {
      const path = await pexelsPhotoSearch(
        conceptTerm,
        visualsDir,
        `pexels_photo_${idx}`,
        pexelsKey,
      );
      if (path) {
        out.push({
          role: "b-roll",
          kind: "pexels-photo",
          path,
          durationSec: 0,
          caption: conceptTerm,
        });
      }
    }
  }

  return out;
}

/**
 * Distribute the slide's audio duration across its visual items.
 * A-roll gets the lion's share (60%), B-roll items split the remaining 40%.
 * If there are no B-roll items, A-roll takes 100%.
 */
function distributeDurations(items: VisualItem[], totalSec: number): void {
  if (items.length === 0 || totalSec <= 0) return;
  if (items.length === 1) {
    items[0].durationSec = totalSec;
    return;
  }
  const aRoll = items.find((it) => it.role === "a-roll");
  const bRoll = items.filter((it) => it.role === "b-roll");
  const aShare = bRoll.length > 0 ? totalSec * 0.6 : totalSec;
  const bShare = bRoll.length > 0 ? (totalSec - aShare) / bRoll.length : 0;
  if (aRoll) aRoll.durationSec = aShare;
  for (const b of bRoll) b.durationSec = bShare;
}

/**
 * Main entry point. For each slide, extract entities, build A-roll + B-roll
 * items, distribute durations to match the audio, and return the per-slide
 * VisualPlan array.
 *
 * Slides whose audio duration is missing or zero are skipped (returns a
 * placeholder VisualPlan with no items — caller should fall back).
 */
export async function researchVisuals(inputs: ResearchInputs): Promise<VisualPlan[]> {
  const visualsDir = join(inputs.outputDir, "visuals");
  await mkdir(visualsDir, { recursive: true });

  const plans: VisualPlan[] = [];

  console.log(`🔬 Visual research: extracting entities + fetching topic-specific visuals for ${inputs.slides.length} slide(s)...`);

  for (let i = 0; i < inputs.slides.length; i++) {
    const slide = inputs.slides[i];
    const audioDur = inputs.audioSegments[i]?.durationSeconds ?? 0;
    if (audioDur <= 0.5) {
      console.warn(`  ⚠ Slide ${i + 1}: no audio (${audioDur.toFixed(1)}s) — skipping visual research`);
      plans.push({ slideIndex: i, items: [] });
      continue;
    }

    console.log(`  🔬 Slide ${i + 1}/${inputs.slides.length}: "${slide.title.slice(0, 50)}"`);

    // 1. Extract entities (LLM)
    const entities = await extractSlideEntities(slide, inputs.config.content);
    const entCount =
      entities.people.length +
      entities.companies.length +
      entities.products.length +
      entities.places.length +
      entities.events.length;
    console.log(
      `      entities: ${entCount} (${entities.people.length}p ${entities.companies.length}c ${entities.products.length}pr ${entities.places.length}pl)`,
    );

    // 2. A-roll (anchor visual)
    const aroll = await buildAroll(slide, i, inputs, visualsDir);

    // 3. B-roll cutaways
    const broll = await buildBroll(entities, i, inputs, visualsDir);

    const items: VisualItem[] = [aroll, ...broll];
    distributeDurations(items, audioDur);

    console.log(
      `      visuals: ${aroll.kind}${aroll.path ? "*" : ""} + ${broll.length} cutaway(s) → ${items.length} total, ${audioDur.toFixed(1)}s`,
    );

    plans.push({ slideIndex: i, items });
  }

  // Persist for debug + reuse on retry
  try {
    await writeFile(join(inputs.outputDir, "visual-plans.json"), JSON.stringify(plans, null, 2));
  } catch {}

  // Sanity report
  const total = plans.reduce((s, p) => s + p.items.length, 0);
  const withScreenshots = plans.filter((p) => p.items.some((it) => it.kind === "article-scroll" && it.path)).length;
  console.log(`  ✓ Visual plans built: ${total} item(s) across ${plans.length} slides, ${withScreenshots} article screenshots`);

  return plans;
}

// Re-export VisualPlan for back-compat with consumers that import from this module
export type { VisualPlan } from "../../types.js";
