/**
 * Re-render an existing pipeline run from disk.
 *
 * Skips scrape → score → script → TTS → visual research and only runs the
 * Remotion render step using the data already saved in `output/<run-id>/`.
 * Lets you iterate fast on Remotion component bugs without paying the
 * 10-minute upstream cost every time.
 *
 * Usage:
 *   npx tsx src/rerender.ts <run-id>
 *   npx tsx src/rerender.ts                          # picks the most recent run
 *
 * Requires the run dir to contain:
 *   script.json           — VideoContent
 *   combined-audio.wav    — concatenated TTS
 *   audio/slide_NN.wav    — per-slide audio (for durations)
 *   visual-plans.json     — VisualPlan[] from researchVisuals (optional)
 *   visuals/*             — image files referenced by visual-plans.json (optional)
 *   broll/clip_NN.mp4     — Pexels clips (optional fallback)
 */

import { existsSync, openSync, readFileSync, readSync, closeSync } from "node:fs";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { exec } from "node:child_process";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { config as loadEnv } from "dotenv";
import type { VideoContent, VisualPlan } from "./types.js";

/**
 * Detect a file's actual image format by sniffing the first bytes.
 * Returns "jpg" / "png" / "gif" / "webp" / "svg" or null for unknown.
 *
 * Used to filter out SVG files that get saved with .jpg extension by
 * Wikipedia (their PageImages thumbnail proxy returns SVGs for many tech
 * logos). Remotion's bundled Chromium can't decode these reliably.
 */
function sniffImageExt(path: string): string | null {
  try {
    const fd = openSync(path, "r");
    const buf = Buffer.alloc(256);
    const n = readSync(fd, buf, 0, 256, 0);
    closeSync(fd);
    if (n >= 8) {
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
    const head = buf.slice(0, n).toString("utf8").trimStart();
    if (head.startsWith("<?xml") && head.toLowerCase().includes("<svg")) return "svg";
    if (head.startsWith("<svg")) return "svg";
  } catch {}
  return null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, "..", ".env") });
const execAsync = promisify(exec);

async function ffprobeDuration(path: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${path}"`,
    );
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

async function pickLatestRun(outputBase: string): Promise<string | null> {
  try {
    const dirs = await readdir(outputBase);
    const runs = dirs.filter((d) => /^(news|tutorial)-\d/.test(d)).sort().reverse();
    return runs[0] ? join(outputBase, runs[0]) : null;
  } catch {
    return null;
  }
}

async function main() {
  const arg = process.argv[2];
  const outputBase = join(__dirname, "..", "output");

  let runDir: string;
  if (arg) {
    runDir = arg.includes("/") || arg.includes("\\") ? arg : join(outputBase, arg);
  } else {
    const latest = await pickLatestRun(outputBase);
    if (!latest) {
      console.error("❌ No run dirs found in output/. Run the full pipeline first or pass a run-id.");
      process.exit(1);
    }
    runDir = latest;
  }

  if (!existsSync(runDir)) {
    console.error(`❌ Run directory not found: ${runDir}`);
    process.exit(1);
  }
  console.log(`🎬 Re-rendering: ${basename(runDir)}`);

  // Load script.json (VideoContent)
  const scriptPath = join(runDir, "script.json");
  if (!existsSync(scriptPath)) {
    console.error(`❌ script.json not found in ${runDir}`);
    process.exit(1);
  }
  const content: VideoContent = JSON.parse(readFileSync(scriptPath, "utf-8"));
  console.log(`  ✓ ${content.slides.length} slides loaded`);

  // Load combined audio + per-slide durations
  const combinedAudioPath = join(runDir, "combined-audio.wav");
  if (!existsSync(combinedAudioPath)) {
    console.error(`❌ combined-audio.wav not found in ${runDir}`);
    process.exit(1);
  }
  const audioDir = join(runDir, "audio");
  const audioSegments: Array<{ audioPath: string; srtPath: string; durationSeconds: number }> = [];
  for (let i = 0; i < content.slides.length; i++) {
    const idx = String(i + 1).padStart(2, "0");
    const audioPath = join(audioDir, `slide_${idx}.wav`);
    const srtPath = join(audioDir, `slide_${idx}.srt`);
    const dur = await ffprobeDuration(audioPath);
    audioSegments.push({ audioPath, srtPath, durationSeconds: dur });
  }
  const totalDur = audioSegments.reduce((s, a) => s + a.durationSeconds, 0);
  console.log(`  ✓ Audio: ${totalDur.toFixed(1)}s total across ${audioSegments.length} segments`);

  // Load visual plans
  const plansPath = join(runDir, "visual-plans.json");
  let visualPlans: VisualPlan[] = [];
  if (existsSync(plansPath)) {
    visualPlans = JSON.parse(readFileSync(plansPath, "utf-8")) as VisualPlan[];
    const total = visualPlans.reduce((s, p) => s + p.items.length, 0);
    console.log(`  ✓ Visual plans: ${total} items across ${visualPlans.length} slides`);
  } else {
    console.warn(`  ⚠ visual-plans.json not found — Remotion will fall back to brollPaths`);
  }

  // Stage all referenced files into public/ so Remotion's staticFile() finds them
  const publicDir = join(__dirname, "..", "public");
  await mkdir(join(publicDir, "visuals"), { recursive: true });
  await mkdir(join(publicDir, "broll"), { recursive: true });

  // Copy audio
  const publicAudioName = "narration.wav";
  await copyFile(combinedAudioPath, join(publicDir, publicAudioName));

  // Copy visual files referenced by visual-plans.json + rewrite paths to public-relative.
  // Sniff each file's actual format (Wikipedia sometimes saves SVGs as .jpg) and
  // skip anything Remotion can't decode.
  let svgSkipped = 0;
  const publicVisualPlans: VisualPlan[] = visualPlans.map((plan) => ({
    slideIndex: plan.slideIndex,
    items: plan.items.map((item, j) => {
      if (!item.path) return item;
      if (!existsSync(item.path)) return { ...item, path: undefined };

      // Sniff actual format
      const realExt = sniffImageExt(item.path);
      if (!realExt) {
        // Unknown format — drop this item
        return { ...item, path: undefined };
      }
      if (realExt === "svg") {
        // Remotion's bundled Chromium chokes on many SVG variants
        svgSkipped++;
        return { ...item, path: undefined };
      }

      const publicName = `visuals/slide_${String(plan.slideIndex + 1).padStart(2, "0")}_${j + 1}_${item.kind}.${realExt}`;
      const dest = join(publicDir, publicName);
      try {
        if (!existsSync(dest)) {
          const { copyFileSync } = require("node:fs");
          copyFileSync(item.path, dest);
        }
        return { ...item, path: publicName };
      } catch {
        return { ...item, path: undefined };
      }
    }),
  }));
  if (svgSkipped > 0) {
    console.log(`  ⚠ Skipped ${svgSkipped} SVG file(s) Remotion can't decode`);
  }

  // Filter out items whose visual kind requires a path but no longer has one
  // (after SVG/missing-file pruning). For kinds that need a file (wikipedia,
  // pexels-photo, screenshot, logo, pexels-video, article-scroll) we drop the
  // item; for text-only kinds (title-card / stat-card / quote-card / timeline-card)
  // we keep it.
  const NEEDS_PATH = new Set([
    "wikipedia",
    "pexels-photo",
    "pexels-video",
    "screenshot",
    "logo",
    "article-scroll",
  ]);
  for (const plan of publicVisualPlans) {
    plan.items = plan.items.filter((it) => !NEEDS_PATH.has(it.kind) || !!it.path);
    // After dropping, ensure we still have at least one item — otherwise the
    // slide will fall back to brollPaths or the branded slide component.
  }
  const totalItems = publicVisualPlans.reduce((s, p) => s + p.items.length, 0);
  console.log(`  ✓ ${totalItems} usable visual items after validation`);

  // Copy broll videos as the legacy fallback
  const brollDir = join(runDir, "broll");
  const brollPaths: string[] = [];
  if (existsSync(brollDir)) {
    for (let i = 0; i < content.slides.length; i++) {
      const idx = String(i + 1).padStart(2, "0");
      const src = join(brollDir, `clip_${idx}.mp4`);
      if (existsSync(src)) {
        const publicName = `broll/clip_${idx}.mp4`;
        await copyFile(src, join(publicDir, publicName));
        brollPaths.push(publicName);
      } else {
        brollPaths.push("");
      }
    }
  }

  // Build slide-with-frame data
  const fps = 30;
  const slidesWithFrames = content.slides.map((slide, i) => ({
    ...slide,
    durationFrames: Math.max(60, Math.ceil((audioSegments[i]?.durationSeconds ?? 5) * fps)),
  }));

  console.log(`  🎬 Rendering with Remotion...`);
  const { renderVideo } = await import("./remotion/render.js");
  const outputPath = join(runDir, "video_landscape_rerender.mp4");
  await renderVideo(
    {
      slides: slidesWithFrames,
      audioPath: publicAudioName,
      words: [],
      fps,
      brollPaths,
      visualPlans: publicVisualPlans,
    },
    outputPath,
    (pct) => {
      if (pct % 10 === 0) console.log(`  Rendering: ${pct}%`);
    },
  );

  console.log(`\n✅ Done! ${outputPath}`);
}

main().catch((err) => {
  console.error("\n❌ Re-render failed:", err.message);
  process.exit(1);
});
