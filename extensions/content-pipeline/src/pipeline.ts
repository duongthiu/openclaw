import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { requestApproval } from "./approval.js";
import { generateNewsScript } from "./content/news-writer.js";
import { generateTutorialScript } from "./content/tutorial-writer.js";
import { discord } from "./discord-notify.js";
import { scrapeAll } from "./scraper/index.js";
import { renderSlides } from "./slides/renderer.js";
import { uploadRunToR2 } from "./storage.js";
import type { PipelineConfig, VideoContent, UploadResult, Article } from "./types.js";
import { uploadToFacebook } from "./upload/facebook.js";
import { uploadToTiktok } from "./upload/tiktok.js";
import { uploadToYoutube } from "./upload/youtube.js";
import { composeVideo } from "./video/composer.js";
import { generateTts } from "./video/tts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type Stage = "scrape" | "content" | "slides" | "video" | "upload";

export interface RunOptions {
  pipelineType: "news" | "tutorial";
  topic?: string;
  stopAtStage?: Stage;
  skipUpload?: boolean;
  configPath?: string;
}

export function loadConfig(configPath?: string): PipelineConfig {
  const path = configPath ?? join(__dirname, "..", "config.yaml");
  const raw = readFileSync(path, "utf-8");
  return YAML.parse(raw) as PipelineConfig;
}

function createOutputDir(pipelineType: string): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[T:]/g, "-").slice(0, 16);
  return join(__dirname, "..", "output", `${pipelineType}-${stamp}`);
}

const STAGE_ORDER: Stage[] = ["scrape", "content", "slides", "video", "upload"];

function shouldStop(current: Stage, stopAt?: Stage): boolean {
  if (!stopAt) return false;
  return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(stopAt);
}

export type EventCallback = (event: { stage: Stage; status: string; message: string }) => void;

export async function runPipeline(opts: RunOptions, onEvent?: EventCallback) {
  const config = loadConfig(opts.configPath);
  const outputDir = createOutputDir(opts.pipelineType);
  await mkdir(outputDir, { recursive: true });

  const emit = (stage: Stage, status: string, message: string) => {
    onEvent?.({ stage, status, message });
  };

  // Notify Discord: pipeline started
  await discord.status(
    `🎯 **Pipeline started** — ${opts.pipelineType === "news" ? "Daily News Video" : `Tutorial: ${opts.topic}`}`,
  );

  // ── Stage 1: Scrape ──
  let articles: Article[] = [];
  if (opts.pipelineType === "news") {
    emit("scrape", "started", "Scraping tech news...");
    await discord.status("📰 **Stage 1/4**: hana is scraping tech news sources...");

    articles = await scrapeAll(config.sources);
    await writeFile(join(outputDir, "articles.json"), JSON.stringify(articles, null, 2));
    emit("scrape", "completed", `${articles.length} articles scraped`);

    // Post article digest to #scraped-articles
    const top10 = articles
      .slice(0, 10)
      .map((a, i) => `**${i + 1}.** ${a.title} *(${a.source})*`)
      .join("\n");
    await discord.articles(
      `📰 **Tech News Digest — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}**\n\n${top10}\n\n📊 Total: ${articles.length} articles from ${new Set(articles.map((a) => a.source)).size} sources`,
    );
    await discord.status(`✅ **Stage 1/4 complete**: ${articles.length} articles scraped`);

    if (shouldStop("scrape", opts.stopAtStage)) {
      console.log(`\nStopped after scrape. Output: ${outputDir}`);
      return { outputDir, articles };
    }
  }

  // ── Stage 2: Content ──
  emit("content", "started", "Generating content...");
  await discord.status("✍️ **Stage 2/4**: minh is writing the video script...");

  let content: VideoContent;
  if (opts.pipelineType === "news") {
    content = await generateNewsScript(articles, config.content);
  } else {
    if (!opts.topic) throw new Error("Tutorial pipeline requires a topic");
    content = await generateTutorialScript(opts.topic, config.content);
  }
  await writeFile(join(outputDir, "script.json"), JSON.stringify(content, null, 2));
  emit("content", "completed", `Script: "${content.videoTitle}"`);

  // Post script to #scripts
  await discord.script(
    `✍️ **Script Ready:** "${content.videoTitle}"\n\n📝 Slides: ${content.slides.length}\n🏷️ Tags: ${content.tags?.join(", ") ?? "none"}`,
  );
  await discord.status(
    `✅ **Stage 2/4 complete**: Script "${content.videoTitle}" (${content.slides.length} slides)`,
  );

  if (shouldStop("content", opts.stopAtStage)) {
    console.log(`\nStopped after content. Output: ${outputDir}`);
    return { outputDir, content };
  }

  // ── Stage 3: Slides ──
  emit("slides", "started", "Rendering slides...");
  await discord.status("🎨 **Stage 3/4**: kai is rendering slides...");

  const slidePaths = await renderSlides(content, outputDir, config.slides);
  emit("slides", "completed", `${slidePaths.length} slides rendered`);

  // Post slide images to #slide-preview
  for (let i = 0; i < slidePaths.length; i++) {
    await discord.slideImage(
      slidePaths[i],
      `🎨 Slide ${i + 1}/${slidePaths.length}: ${content.slides[i]?.title ?? ""}`,
    );
  }
  await discord.status(`✅ **Stage 3/4 complete**: ${slidePaths.length} slides rendered`);

  if (shouldStop("slides", opts.stopAtStage)) {
    console.log(`\nStopped after slides. Output: ${outputDir}`);
    return { outputDir, content, slidePaths };
  }

  // ── Stage 4: Video ──
  emit("video", "started", "Producing video...");
  await discord.status("🎬 **Stage 4/4**: kai is producing the video (TTS + ffmpeg)...");

  const audioSegments = await generateTts(content.slides, outputDir, config.video);
  const totalDur = audioSegments.reduce((s, a) => s + a.durationSeconds, 0);
  await discord.videoProgress(
    `🎙️ TTS complete: ${audioSegments.length} audio segments (${Math.floor(totalDur / 60)}m ${Math.floor(totalDur % 60)}s)`,
  );

  const videoResult = await composeVideo(slidePaths, audioSegments, outputDir, config.video);
  emit("video", "completed", `Video: ${Math.floor(videoResult.durationSeconds / 60)}m`);

  await discord.videoProgress(
    `🎬 **Video composed!**\n📐 Landscape: 1920x1080\n📱 Portrait: 1080x1920\n⏱️ Duration: ${Math.floor(videoResult.durationSeconds / 60)}m ${Math.floor(videoResult.durationSeconds % 60)}s`,
  );
  await discord.status(
    `✅ **Stage 4/4 complete**: Video ready (${Math.floor(videoResult.durationSeconds / 60)}m ${Math.floor(videoResult.durationSeconds % 60)}s)`,
  );

  // Upload to R2 cloud storage
  const runId = outputDir.split("/").pop() ?? "unknown";
  console.log("\n☁️ Uploading to R2 cloud storage...");
  await discord.status("☁️ Uploading to cloud storage...");
  const r2Urls = await uploadRunToR2(outputDir, runId);

  // Request approval via Discord buttons before publishing
  const dur = `${Math.floor(videoResult.durationSeconds / 60)}m ${Math.floor(videoResult.durationSeconds % 60)}s`;
  await discord.status(`✅ **Video ready!** Requesting your approval before publishing...`);
  const approvalMsgId = await requestApproval({
    runId,
    outputDir,
    videoTitle: content.videoTitle,
    duration: dur,
    slideCount: content.slides.length,
    r2Urls,
    pipelineType: opts.pipelineType,
  });

  console.log(`\n🔔 Video ready. Approval requested in Discord. Output: ${outputDir}`);
  console.log(`   Click Approve in Discord to publish to YouTube/Facebook/TikTok.`);
  return { outputDir, content, videoResult, r2Urls, approvalMsgId };

  // ── Stage 5: Upload ──
  emit("upload", "started", "Uploading to platforms...");
  await discord.status("📤 **Stage 5/5**: Uploading to platforms...");
  const uploads: UploadResult[] = [];

  if (config.upload.youtube.enabled) {
    try {
      const url = await uploadToYoutube(
        videoResult,
        content,
        config.upload.youtube,
        "client_secrets.json",
      );
      uploads.push({ platform: "youtube", url, status: "success" });
    } catch (err) {
      uploads.push({ platform: "youtube", status: "error", error: (err as Error).message });
    }
  }

  if (config.upload.tiktok.enabled) {
    try {
      await uploadToTiktok(videoResult, content, config.upload.tiktok.cookiesPath);
      uploads.push({ platform: "tiktok", status: "success" });
    } catch (err) {
      uploads.push({ platform: "tiktok", status: "error", error: (err as Error).message });
    }
  }

  if (config.upload.facebook.enabled) {
    const fbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    if (fbToken && config.upload.facebook.pageId) {
      try {
        const url = await uploadToFacebook(
          videoResult,
          content,
          config.upload.facebook.pageId,
          fbToken,
        );
        uploads.push({ platform: "facebook", url, status: "success" });
      } catch (err) {
        uploads.push({ platform: "facebook", status: "error", error: (err as Error).message });
      }
    }
  }

  await writeFile(join(outputDir, "upload_results.json"), JSON.stringify(uploads, null, 2));
  emit("upload", "completed", uploads.map((u) => `${u.platform}: ${u.status}`).join(", "));

  const uploadLines = uploads
    .map((u) =>
      u.url
        ? `✅ ${u.platform}: ${u.url}`
        : `${u.status === "success" ? "✅" : "❌"} ${u.platform}: ${u.status}`,
    )
    .join("\n");

  const publishChannel =
    opts.pipelineType === "news" ? discord.publishedNews : discord.publishedTutorials;
  await publishChannel(
    `📹 **${content.videoTitle}**\n\n⏱️ Duration: ${Math.floor(videoResult.durationSeconds / 60)}m ${Math.floor(videoResult.durationSeconds % 60)}s\n📊 ${content.slides.length} slides\n\n${uploadLines}`,
  );
  await discord.status(`🎉 **Pipeline complete!** "${content.videoTitle}"\n${uploadLines}`);

  console.log(`\n✅ Pipeline complete! Output: ${outputDir}`);
  return { outputDir, content, videoResult, uploads };
}
