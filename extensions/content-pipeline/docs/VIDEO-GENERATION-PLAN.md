# Video Generation Integration Plan

## Goal

Add AI video generation (Google Veo, Runway, etc.) as an alternative to the current Remotion slide-based video pipeline. Users can choose between `"ai"` (AI-generated clips) and `"remotion"` (HTML slide renders) via `config.yaml`.

## Current Architecture

```
Scrape → Script → Remotion Slides (PNG) → TTS Audio → ffmpeg Compose → Upload
```

## New Architecture

```
Scrape → Script → [AI Video Gen OR Remotion Slides] → TTS Audio → ffmpeg Compose → Upload
                        │                                    │
                  Google Veo 3.1                    HTML → PNG (existing)
                  Runway gen4.5
                  fal, etc.
```

## References

- OpenClaw video_generation docs: https://docs.openclaw.ai/tools/video-generation
- YouTube demo: https://www.youtube.com/watch?v=Yt6imPC1FhA ("OpenClaw Just Replaced 1,000 Hours of Video Editing Tutorials")
- Superskills registry: https://superskills.vibecode.run/

---

## Phase 1: Configure OpenClaw video_generation tool

**What:** Register video generation provider in the gateway config.

**File:** `~/.openclaw/openclaw.json`

```json5
{
  agents: {
    defaults: {
      videoGenerationModel: {
        primary: "google/veo-3.1-fast-generate-preview",
        fallbacks: [
          "google/veo-3.1-generate-preview",
          // Add more as needed: "runway/gen4.5", "fal/minimax-video"
        ]
      }
    }
  }
}
```

**Auth:** Uses existing `GEMINI_API_KEY` from `~/.openclaw/.env`. No extra setup needed.

**Verify:**
- Gateway logs should show video generation model available
- Agent can call `video_generation({ prompt: "test" })` tool

---

## Phase 2: Add AI video generation module

**What:** Create `src/video/ai-video.ts` that generates video clips using OpenClaw's async video_generation tool.

**File:** `extensions/content-pipeline/src/video/ai-video.ts`

**Design:**

```typescript
export async function generateAiVideoClips(
  slides: SlideContent[],
  outputDir: string,
  config: PipelineConfig,
): Promise<string[]> {
  // For each slide/story:
  // 1. Build prompt from slide title + body + speaker notes
  // 2. Submit video_generation task via OpenClaw gateway API
  // 3. Poll for completion (30s - 5min per clip)
  // 4. Download generated video to outputDir
  // 5. Return array of video clip paths
}
```

**Key details:**
- OpenClaw video_generation is async: submit → get taskId → poll status → download
- Task states: `queued` → `running` → `succeeded` / `failed`
- Generate one clip per story (5-15 seconds each)
- Aspect ratio: 16:9 for YouTube, 9:16 for TikTok
- Fallback: if AI generation fails for a slide, fall back to Remotion for that slide

**API interaction:**
- Gateway endpoint: `http://127.0.0.1:18789` (local gateway)
- Auth: gateway token from `~/.openclaw/openclaw.json`
- Tool call via gateway RPC or direct OpenClaw CLI

**Alternative approach:** Instead of calling the gateway API, use the OpenClaw CLI:
```bash
openclaw agent --local -m "Generate a 10-second video: [prompt]"
```
This is simpler but less controllable.

---

## Phase 3: Update config.yaml

**What:** Add `videoEngine` toggle to choose between AI and Remotion.

**File:** `extensions/content-pipeline/config.yaml`

```yaml
# ── Video ──
video:
  engine: "remotion"          # "remotion" (slides) | "ai" (AI-generated clips)
  aiProvider: "google"        # Provider for AI video: google, runway, fal
  aiModel: "veo-3.1-fast-generate-preview"
  aiClipDuration: 10          # Seconds per clip
  aiAspectRatio: "16:9"       # "16:9" | "9:16" | "1:1"
  durationPerSlide: 8
  ttsEngine: "kokoro"
  ttsVoice: "af_heart"
  ttsSpeed: 1.0
  width: 1920
  height: 1080
  fps: 30
```

**File:** `extensions/content-pipeline/src/pipeline.ts`

- Read `config.video.engine`
- If `"ai"`: call `generateAiVideoClips()` → compose with TTS audio via ffmpeg
- If `"remotion"`: use existing Remotion slide render flow (unchanged)

---

## Phase 4: Update agent skills

### kai (video-producer) — `skills/video-producer/SKILL.md`

Add section for AI video generation:

```markdown
## AI Video Generation (Alternative)

When config.yaml has `video.engine: "ai"`, the pipeline generates AI video clips
instead of Remotion slides.

Each story gets a 10-second AI-generated clip using Google Veo 3.1.
Clips are composed with TTS narration and concatenated into final video.

To use AI video for a single run:
npx tsx src/cli.ts run news --engine ai --skip-upload
```

### nhu.tuyet (pipeline-manager) — `skills/pipeline-manager/SKILL.md`

Add video engine option to workflow:

```markdown
When the user says "start news with AI video" or "use AI for video":
- Set video engine to "ai" before spawning kai
- Report: "Using AI video generation (Google Veo)"
```

---

## Phase 5: Test end-to-end

1. Set `video.engine: "ai"` in config.yaml
2. Run: `npx tsx src/cli.ts run news --skip-upload`
3. Verify:
   - Script generated with ollama/gemma4
   - AI video clips generated via Google Veo
   - TTS audio generated
   - Final video composed with ffmpeg
   - Output in `output/<run-id>/`
4. Commit and push

---

## Provider Comparison

| Provider | Model | Cost | Speed | Quality | Auth |
|----------|-------|------|-------|---------|------|
| **Google** | veo-3.1-fast | Free tier | ~30s | Good | GEMINI_API_KEY |
| **Google** | veo-3.1 | Free tier | ~2min | Best | GEMINI_API_KEY |
| Runway | gen4.5 | Paid | ~1min | Excellent | RUNWAY_API_KEY |
| fal | minimax-video | Paid | ~1min | Good | FAL_KEY |
| Together | wan2.1-t2v | Low cost | ~2min | Good | TOGETHER_API_KEY |

**Recommendation:** Start with Google Veo 3.1 Fast — free tier, uses existing GEMINI_API_KEY.

---

## Risk & Fallback

- **Rate limits:** Google Veo has rate limits on free tier. If hit, fall back to Remotion slides for that run.
- **Generation failure:** If any clip fails, substitute with a Remotion-rendered slide for that story.
- **Long generation times:** Veo 3.1 Fast ~30s, regular ~2-5min. Total for 5 clips: 2.5-25min. Acceptable for daily pipeline.
- **Quality:** AI clips may not always match the prompt perfectly. The narration + subtitles overlay provides continuity regardless.

---

## Timeline

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| Phase 1 | 5 min | GEMINI_API_KEY already configured |
| Phase 2 | 30 min | Phase 1 |
| Phase 3 | 10 min | Phase 2 |
| Phase 4 | 10 min | Phase 3 |
| Phase 5 | 15 min | All above |
