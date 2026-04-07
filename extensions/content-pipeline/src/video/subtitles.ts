/**
 * WhisperX word-level timestamps + subtitle generation.
 */

import { exec } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { WordTimestamp } from "../remotion/types.js";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, "..", "..", "scripts");

/**
 * Extract word-level timestamps from audio using WhisperX.
 * Returns array of { word, start, end }.
 */
export async function getWordTimestamps(
  audioPath: string,
  outputDir: string,
): Promise<WordTimestamp[]> {
  const jsonPath = join(outputDir, "word-timestamps.json");

  if (!existsSync(audioPath)) {
    console.warn("  ⚠ Audio file not found for timestamp extraction");
    return [];
  }

  try {
    console.log("  📝 Extracting word-level timestamps with WhisperX...");
    await execAsync(
      `python3 "${join(SCRIPTS_DIR, "whisperx-timestamps.py")}" "${audioPath}" "${jsonPath}"`,
      { timeout: 120_000 },
    );

    if (!existsSync(jsonPath)) {
      console.warn("  ⚠ WhisperX produced no output");
      return [];
    }

    const words: WordTimestamp[] = JSON.parse(readFileSync(jsonPath, "utf-8"));
    console.log(`  ✓ ${words.length} word timestamps extracted`);
    return words;
  } catch (err) {
    console.warn(`  ⚠ WhisperX failed: ${(err as Error).message.slice(0, 100)}`);
    return [];
  }
}
