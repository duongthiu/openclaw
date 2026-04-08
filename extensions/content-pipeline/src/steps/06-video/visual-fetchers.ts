/**
 * Visual fetchers (P0.0) — pull topic-specific imagery from external sources.
 *
 * All functions are network-only, no API keys required (except Pexels which
 * we already have). Each returns a local file path on success or null on
 * failure. Failures are non-fatal — the orchestrator falls through to the
 * next source.
 *
 * Sources:
 *   - wikipediaImage(): MediaWiki PageImages API → CC-licensed hero photo
 *   - clearbitLogo():    Clearbit Logo API     → company logo PNG
 *   - articleScreenshot(): Playwright          → source-article header capture
 *   - pexelsPhotoSearch(): Pexels v1/search    → topic photo (different from videos)
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sniff the actual image format from the response Content-Type and the
 * first few bytes (magic numbers). Returns the canonical extension.
 * Returns null if the buffer is not a recognized image type.
 *
 * Why this matters: Wikipedia returns SVG logos for many tech companies,
 * but PageImages prop will hand back the URL as if it were a thumbnail.
 * Saving an SVG with .jpg extension breaks Chromium's image decoder
 * inside Remotion's render. Always save with the true extension.
 */
function detectImageExt(contentType: string | null, buf: Buffer): string | null {
  // Magic-byte sniffing first (most reliable)
  if (buf.length >= 8) {
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
    if (
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    )
      return "webp";
  }
  // SVG detection (text-based)
  const head = buf.slice(0, Math.min(buf.length, 256)).toString("utf8").trimStart();
  if (head.startsWith("<?xml") && head.toLowerCase().includes("<svg")) return "svg";
  if (head.startsWith("<svg")) return "svg";

  // Fall back to Content-Type
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
    if (ct.includes("png")) return "png";
    if (ct.includes("gif")) return "gif";
    if (ct.includes("webp")) return "webp";
    if (ct.includes("svg")) return "svg";
  }
  return null;
}

/**
 * Download an image, detect its real format, and save with the correct
 * extension. Returns the actual on-disk path on success or null on failure.
 *
 * `outBase` is the target path WITHOUT extension; the function appends
 * `.jpg`/`.png`/`.svg`/etc based on what was actually downloaded.
 *
 * Skips SVG files because Remotion's bundled Chromium frequently fails
 * to decode complex SVGs at render time (causes "EncodingError"). When
 * this happens callers should fall through to the next visual source.
 */
async function downloadImage(url: string, outBase: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "openclaw-content-pipeline/0.1 (research; non-commercial)",
        Accept: "image/jpeg,image/png,image/webp,image/gif,image/*",
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return null;

    const ext = detectImageExt(res.headers.get("content-type"), buf);
    if (!ext) return null;
    // Skip SVG: Remotion's Chromium image decoder chokes on many SVG variants.
    // Caller should fall through to the next source.
    if (ext === "svg") return null;

    const outPath = `${outBase}.${ext}`;
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buf);
    return existsSync(outPath) ? outPath : null;
  } catch {
    return null;
  }
}

/**
 * Fetch a Wikipedia hero image for a named entity.
 * Uses MediaWiki PageImages prop (returns the page's main thumbnail URL).
 *
 * Example: wikipediaImage("Sam Altman", outDir, "person_01")
 *   → tries en.wikipedia first, falls back to vi.wikipedia
 *   → resolves "Sam Altman" → page → thumbnail URL → downloads jpg
 */
export async function wikipediaImage(
  entity: string,
  outDir: string,
  basename: string,
): Promise<string | null> {
  if (!entity.trim()) return null;
  // Try EN first (better coverage), then VI
  for (const lang of ["en", "vi"]) {
    try {
      const apiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original|thumbnail&pithumbsize=1280&titles=${encodeURIComponent(
        entity,
      )}&redirects=1&origin=*`;
      const res = await fetchWithTimeout(apiUrl);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        query?: { pages?: Record<string, { original?: { source?: string }; thumbnail?: { source?: string } }> };
      };
      const pages = data.query?.pages ?? {};
      for (const page of Object.values(pages)) {
        // Prefer thumbnail (server-side rasterized — even SVG sources come back as PNG)
        // over original (which would give us the raw .svg). This avoids the
        // SVG-decode issue inside Remotion's Chromium.
        const imgUrl = page.thumbnail?.source || page.original?.source;
        if (imgUrl) {
          const outBase = join(outDir, basename);
          const result = await downloadImage(imgUrl, outBase);
          if (result) return result;
        }
      }
    } catch {
      // try next lang
    }
  }
  return null;
}

/**
 * Fetch a company logo via Clearbit's free Logo API.
 * Takes a company name and tries to guess its primary domain.
 *
 * Example: clearbitLogo("OpenAI", outDir, "logo_01")
 *   → openai.com → https://logo.clearbit.com/openai.com → png
 *
 * For non-obvious mappings (e.g. "GRU"), this will fail and the orchestrator
 * should fall back to Wikipedia.
 */
export async function clearbitLogo(
  company: string,
  outDir: string,
  basename: string,
): Promise<string | null> {
  if (!company.trim()) return null;
  const cleaned = company
    .toLowerCase()
    .replace(/\binc\b\.?|\bcorp\b\.?|\bllc\b\.?|\bltd\b\.?|\bgmbh\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
  if (!cleaned) return null;
  // Try domain guesses in order: word concatenated, first word
  const candidates = Array.from(
    new Set([cleaned.replace(/\s+/g, ""), cleaned.split(" ")[0]]),
  ).filter(Boolean);

  for (const slug of candidates) {
    for (const tld of ["com", "io", "ai", "org"]) {
      const url = `https://logo.clearbit.com/${slug}.${tld}`;
      const outBase = join(outDir, basename);
      const result = await downloadImage(url, outBase);
      if (result) return result;
    }
  }
  return null;
}

/**
 * Screenshot the header region of a source article using Playwright.
 *
 * For each related-source URL the script cited, this gives us the actual
 * news headline + hero image as a real visual. This is the most authoritative
 * "according to MIT Tech Review" visual we can render.
 *
 * Lazy-loads playwright via dynamic import so the cost is only paid when
 * the visual research step actually fetches a screenshot.
 */
export async function articleScreenshot(
  url: string,
  outDir: string,
  basename: string,
): Promise<string | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  const { chromium } = await import("playwright");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 1600 },
      userAgent: "Mozilla/5.0 openclaw-content-pipeline",
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    // Give scripts a moment to render headline + hero image
    await new Promise((r) => setTimeout(r, 1500));
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, `${basename}.png`);
    await page.screenshot({
      path: outPath,
      clip: { x: 0, y: 0, width: 1280, height: 900 },
    });
    await page.close();
    return existsSync(outPath) ? outPath : null;
  } catch (err) {
    console.warn(`  ⚠ screenshot failed for ${url.slice(0, 60)}: ${(err as Error).message.slice(0, 80)}`);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Pexels photo search (different from the video search in pexels.ts).
 *
 * Photos work better than videos for many entity types — a "Sam Altman"
 * photo search returns actual stage photos; the video search returns
 * generic "businessman in suit" stock.
 */
export async function pexelsPhotoSearch(
  query: string,
  outDir: string,
  basename: string,
  apiKey: string,
): Promise<string | null> {
  if (!query.trim() || !apiKey) return null;
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&size=medium`;
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      photos?: Array<{ src?: { large?: string; large2x?: string; original?: string } }>;
    };
    const photo = data.photos?.[0];
    const imgUrl = photo?.src?.large2x || photo?.src?.large || photo?.src?.original;
    if (!imgUrl) return null;
    const outBase = join(outDir, basename);
    return await downloadImage(imgUrl, outBase);
  } catch {
    return null;
  }
}
