# Pipeline Quality Upgrade — Apple-Style Professional Videos

## Context

Current pipeline produces basic MVP videos: white slides (CSS broken), no animations, no transitions, broken subtitles, occasional TTS errors. Need to upgrade to produce YouTube-ready, Apple keynote-style professional content.

**Current quality**: Plain white slides, static images, no effects
**Target quality**: Dark cinematic slides, animated text, smooth transitions, word-level subtitles, natural voice

---

## Architecture: Before vs After

```
BEFORE (current):
  Scrape → Gemma 4 script → HTML screenshots (broken CSS) → edge-tts → ffmpeg static concat

AFTER (upgraded):
  Scrape → Gemma 4 script → Kokoro TTS → WhisperX timestamps → Remotion render (animated) → MP4
```

Key change: **Remotion replaces Playwright screenshots + ffmpeg concat**. Video is rendered as a single React composition with animations, transitions, and embedded audio.

---

## Tool Stack Upgrade

| Step          | Before                       | After                              | Why                                                |
| ------------- | ---------------------------- | ---------------------------------- | -------------------------------------------------- |
| **Visuals**   | HTML + Playwright screenshot | **Remotion** (React video)         | Animated text, transitions, professional templates |
| **TTS**       | edge-tts (cloud, errors)     | **Kokoro TTS** (local, Apache 2.0) | Natural voice, no errors, runs locally             |
| **Subtitles** | SRT (broken)                 | **WhisperX** → word-level ASS      | Karaoke-style word highlighting                    |
| **Video**     | ffmpeg static concat         | **Remotion renderMedia**           | Built-in transitions, Ken Burns, spring animations |
| **Music**     | None                         | **Free background music**          | Adds production value                              |

---

## Phase 1: Kokoro TTS (replace edge-tts)

### Install

```bash
pip install kokoro-onnx soundfile
# Download model files (~200MB)
wget -P ~/.openclaw/models/ https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/kokoro-v1.0.onnx
wget -P ~/.openclaw/models/ https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/voices-v1.0.bin
```

### New file: `src/video/kokoro-tts.ts`

Wrapper that calls Kokoro via Python subprocess:

```typescript
// For each slide's speakerNotes:
// 1. Write text to temp file
// 2. Call: python3 scripts/kokoro-generate.py --text "..." --voice af_heart --output slide_01.wav
// 3. Return { audioPath, durationSeconds }
```

### Python script: `scripts/kokoro-generate.py`

```python
import soundfile as sf
from kokoro_onnx import Kokoro

kokoro = Kokoro("~/.openclaw/models/kokoro-v1.0.onnx", "~/.openclaw/models/voices-v1.0.bin")
samples, sr = kokoro.create(text, voice="af_heart", speed=1.0, lang="en-us")
sf.write(output_path, samples, sr)
print(f"duration:{len(samples)/sr}")
```

### Voices

- `af_heart` — warm female (recommended for news)
- `am_michael` — professional male
- `bf_emma` — British female
- `bm_george` — British male

### Config: `config.yaml`

```yaml
video:
  ttsEngine: "kokoro" # "kokoro" | "edge-tts" (fallback)
  ttsVoice: "af_heart"
  ttsSpeed: 1.0
```

---

## Phase 2: WhisperX Word-Level Timestamps

### Install

```bash
pip install whisperx
```

### New file: `scripts/whisperx-timestamps.py`

Takes audio file, returns word-level timestamps as JSON:

```python
import whisperx, json, sys

audio = whisperx.load_audio(sys.argv[1])
model = whisperx.load_model("base", "cpu", compute_type="int8")
result = model.transcribe(audio, batch_size=8)

align_model, metadata = whisperx.load_align_model(language_code="en", device="cpu")
aligned = whisperx.align(result["segments"], align_model, metadata, audio, "cpu")

# Output: [{ "word": "Hello", "start": 0.0, "end": 0.8 }, ...]
words = []
for seg in aligned["segments"]:
    for w in seg.get("words", []):
        words.append({"word": w["word"], "start": w["start"], "end": w["end"]})

json.dump(words, open(sys.argv[2], "w"), indent=2)
```

### Integration: `src/video/subtitles.ts`

1. After TTS generates audio for all slides
2. Concatenate all audio into one file
3. Run WhisperX to get word timestamps
4. Generate ASS subtitle file with word-level highlighting
5. Pass timestamps to Remotion for animated captions

---

## Phase 3: Remotion Video Engine

### Install

```bash
cd extensions/content-pipeline
npm install --save-exact remotion@4.0.446 @remotion/cli@4.0.446 @remotion/renderer@4.0.446 @remotion/transitions@4.0.446
```

### Directory structure

```
src/remotion/
├── index.ts              # Root composition registry
├── Video.tsx             # Main video composition
├── types.ts              # Props types (slides, audio, timestamps)
├── theme.ts              # Apple-style colors, fonts, spacing
├── components/
│   ├── IntroSlide.tsx    # Animated intro: date + title fly-in + preview bullets
│   ├── StorySlide.tsx    # News story: headline spring-in + card with bullets
│   ├── OutroSlide.tsx    # CTA with gradient text animation
│   ├── CodeSlide.tsx     # Typewriter code animation
│   ├── StepSlide.tsx     # Tutorial step with number badge
│   ├── Background.tsx    # Animated gradient background
│   ├── WordCaption.tsx   # Karaoke-style word highlighting
│   └── Transition.tsx    # Slide transitions (fade, slide)
└── render.ts             # Programmatic rendering entry point
```

### Theme (`theme.ts`) — Apple Keynote Style

```typescript
export const theme = {
  bg: {
    primary: "linear-gradient(135deg, #000000 0%, #1a1a3e 50%, #0a0a2e 100%)",
    card: "rgba(255,255,255,0.08)",
    code: "rgba(0,0,0,0.5)",
  },
  text: {
    primary: "#ffffff",
    secondary: "rgba(255,255,255,0.6)",
    accent: "#007AFF",
    gradient: "linear-gradient(135deg, #ffffff, #6eb6ff)",
  },
  font: {
    heading: "-apple-system, 'SF Pro Display', 'Inter', sans-serif",
    code: "'SF Mono', 'JetBrains Mono', monospace",
  },
  size: {
    title: 72,
    subtitle: 36,
    body: 32,
    caption: 28,
  },
  spacing: {
    slide: { padding: 120 },
    card: { padding: 40, borderRadius: 20 },
  },
};
```

### Main composition (`Video.tsx`)

```tsx
import { Composition, Sequence, Audio, staticFile } from "remotion";
import { TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

export const NewsVideo: React.FC<VideoProps> = ({ slides, audioPath, words }) => {
  const fps = 30;

  return (
    <AbsoluteFill style={{ background: theme.bg.primary }}>
      {/* Background audio */}
      <Audio src={staticFile(audioPath)} />

      {/* Slides with transitions */}
      <TransitionSeries>
        {slides.map((slide, i) => (
          <>
            <TransitionSeries.Sequence durationInFrames={slide.durationFrames}>
              <SlideComponent slide={slide} index={i} total={slides.length} />
            </TransitionSeries.Sequence>
            {i < slides.length - 1 && (
              <TransitionSeries.Transition presentation={fade()} durationInFrames={15} />
            )}
          </>
        ))}
      </TransitionSeries>

      {/* Word-level captions overlay */}
      <WordCaption words={words} />
    </AbsoluteFill>
  );
};
```

### Slide animations

- **Intro**: Title scales from 0→1 with spring, bullets fade in sequentially (200ms delay each)
- **Story**: Headline slides in from left, card fades up, bullets appear one by one
- **Outro**: Gradient text pulses, CTA fades in
- **Code**: Typewriter effect line by line
- **All slides**: Subtle Ken Burns (1.0→1.05 zoom over duration)

### WordCaption component (karaoke-style)

```tsx
// Highlights current word based on frame position
// Words: white by default, current word: blue (#007AFF), spoken words: white
```

### Render script (`render.ts`)

```typescript
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

export async function renderVideo(props: VideoProps, outputPath: string) {
  const bundled = await bundle(resolve(__dirname, "./index.ts"));
  const comp = await selectComposition({ serveUrl: bundled, id: "NewsVideo", inputProps: props });
  await renderMedia({
    composition: comp,
    serveUrl: bundled,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: props,
  });
}
```

---

## Phase 4: Background Music

### Free music sources

- Download 3-5 royalty-free background tracks from https://pixabay.com/music/
- Store in `assets/music/` (tech-upbeat.mp3, tech-calm.mp3, etc.)
- Randomly select or configure per video type

### Audio mixing in Remotion

```tsx
<Audio src={staticFile("narration.wav")} volume={1.0} />
<Audio src={staticFile("music/tech-upbeat.mp3")} volume={0.15} />
```

Background music at 15% volume, narration at 100%.

---

## Phase 5: Enhanced Content Prompts

### Update `news-writer.ts` system prompt:

```
Write like an Apple keynote presenter:
- Headlines: 3-6 words max, bold and clear
- Bullets: start with action verbs, max 8 words each
- Narration: short punchy sentences, confident tone
- Intro: strong hook in first sentence
- Outro: clear call to action
- NO filler words, NO hedging language
```

---

## Phase 6: Integration into Pipeline

### Updated pipeline flow:

```
1. Scrape articles                    (unchanged)
2. Generate script with Gemma 4       (enhanced prompts)
3. Generate TTS audio with Kokoro     (NEW - replaces edge-tts)
4. Get word timestamps with WhisperX  (NEW)
5. Render video with Remotion         (NEW - replaces Playwright + ffmpeg)
   - Animated slides with transitions
   - Embedded audio
   - Word-level captions
   - Background music
6. Upload to R2                       (unchanged)
7. Discord approval                   (unchanged)
8. Publish to YT/FB                   (unchanged)
```

### File changes:

```
MODIFY: src/pipeline.ts          — replace stages 3-4 with new flow
MODIFY: src/video/tts.ts         — add Kokoro option
MODIFY: src/content/news-writer.ts — enhanced prompts
NEW:    src/video/kokoro-tts.ts   — Kokoro TTS wrapper
NEW:    src/video/subtitles.ts    — WhisperX + ASS generation
NEW:    src/remotion/             — entire Remotion video engine (10+ files)
NEW:    scripts/kokoro-generate.py — Python TTS script
NEW:    scripts/whisperx-timestamps.py — Python timestamps script
NEW:    assets/music/             — background music files
```

---

## Detailed Implementation Steps with Test/QA

---

### Phase 1: Kokoro TTS

#### 1.1 Install dependencies

```bash
pip install kokoro-onnx soundfile
mkdir -p ~/.openclaw/models
wget -P ~/.openclaw/models/ https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/kokoro-v1.0.onnx
wget -P ~/.openclaw/models/ https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/voices-v1.0.bin
```

#### 1.2 Create `scripts/kokoro-generate.py`

- Accept args: `--text`, `--voice`, `--speed`, `--output`
- Load model from `~/.openclaw/models/`
- Generate WAV audio
- Print `duration:<seconds>` to stdout

#### 1.3 Create `src/video/kokoro-tts.ts`

- TypeScript wrapper that calls Python script via `exec`
- Input: `SlideContent[]` + config
- Output: `AudioSegment[]` (audioPath, durationSeconds)
- Fallback to edge-tts if Kokoro fails

#### 1.4 Update `config.yaml`

- Add `ttsEngine: "kokoro"` option
- Add `ttsVoice: "af_heart"` option

#### TEST 1.1 — Kokoro audio generation

```bash
python3 scripts/kokoro-generate.py --text "Hello, welcome to today's tech news" --voice af_heart --output /tmp/test-kokoro.wav
# ✅ Pass: WAV file created, sounds natural, prints duration
# ❌ Fail: model not found, audio empty, robotic sound
```

#### TEST 1.2 — Kokoro TypeScript wrapper

```bash
npx tsx -e "
import { generateKokoroTts } from './src/video/kokoro-tts.js';
const segments = await generateKokoroTts([{ speakerNotes: 'Hello world' }], '/tmp/kokoro-test', config);
console.log(segments);
"
# ✅ Pass: returns [{audioPath, durationSeconds}], file exists
# ❌ Fail: Python not found, model missing, empty output
```

#### TEST 1.3 — Edge-tts fallback

```bash
# Temporarily break Kokoro model path, verify edge-tts kicks in
# ✅ Pass: falls back gracefully, audio generated with edge-tts
```

---

### Phase 2: WhisperX Word Timestamps

#### 2.1 Install dependencies

```bash
pip install whisperx
```

#### 2.2 Create `scripts/whisperx-timestamps.py`

- Accept args: `<audio-path> <output-json-path>`
- Load Whisper `base` model (CPU, int8 for speed)
- Transcribe + align
- Output JSON: `[{ "word": "Hello", "start": 0.0, "end": 0.8 }]`

#### 2.3 Create `src/video/subtitles.ts`

- TypeScript wrapper for WhisperX
- Concatenate slide audio into single file (ffmpeg)
- Call WhisperX Python script
- Parse output JSON
- Generate ASS subtitle file with styling

#### 2.4 ASS subtitle styling

```
[V4+ Styles]
Style: Default,Inter,28,&H00FFFFFF,&H000078FF,&H40000000,&H00000000,1,0,0,0,100,100,0,0,1,2,0,2,20,20,40,1
```

- Primary color: white
- Secondary (karaoke highlight): blue (#007AFF)
- Outline: 2px dark
- Background: semi-transparent box
- Position: bottom center

#### TEST 2.1 — WhisperX timestamp extraction

```bash
python3 scripts/whisperx-timestamps.py /tmp/test-kokoro.wav /tmp/test-words.json
cat /tmp/test-words.json
# ✅ Pass: JSON with word-level timestamps, reasonable timing
# ❌ Fail: model download fails, no words detected, wrong timing
```

#### TEST 2.2 — ASS subtitle generation

```bash
npx tsx -e "
import { generateSubtitles } from './src/video/subtitles.js';
const assPath = await generateSubtitles('/tmp/test-kokoro.wav', '/tmp/test-subs.ass');
console.log('ASS file:', assPath);
"
cat /tmp/test-subs.ass
# ✅ Pass: valid ASS file with [V4+ Styles], Dialogue entries with timing
# ❌ Fail: empty file, no timing, wrong format
```

#### TEST 2.3 — Subtitle burn test

```bash
ffmpeg -y -f lavfi -i color=c=black:s=1920x1080:d=5 -vf "ass=/tmp/test-subs.ass" /tmp/test-subs-video.mp4
open /tmp/test-subs-video.mp4
# ✅ Pass: subtitles visible, styled, positioned correctly
# ❌ Fail: no text visible, wrong position, encoding error
```

---

### Phase 3: Remotion Video Engine

#### 3.1 Install Remotion

```bash
cd extensions/content-pipeline
npm install --save-exact remotion @remotion/cli @remotion/renderer @remotion/transitions @remotion/bundler
```

#### 3.2 Create project structure

```
src/remotion/
├── index.ts              # registerRoot
├── Root.tsx              # Composition registry
├── Video.tsx             # Main news video composition
├── TutorialVideo.tsx     # Tutorial video composition
├── types.ts              # VideoProps, SlideData, WordTimestamp
├── theme.ts              # Apple design tokens
├── render.ts             # renderMedia wrapper for CLI
├── components/
│   ├── Background.tsx    # Animated gradient background
│   ├── IntroSlide.tsx    # Date + title + preview bullets
│   ├── StorySlide.tsx    # News headline + card + bullets
│   ├── OutroSlide.tsx    # CTA + subscribe
│   ├── CodeSlide.tsx     # Syntax highlighted code
│   ├── StepSlide.tsx     # Tutorial step
│   ├── WordCaption.tsx   # Karaoke-style word captions
│   ├── SlideNumber.tsx   # Slide counter (bottom right)
│   └── SourceBadge.tsx   # Source label (frosted glass)
```

#### 3.3 Build `theme.ts`

- Apple-style design tokens
- Colors, fonts, sizes, spacing
- Gradient definitions
- Card styles (frosted glass)

#### 3.4 Build `Background.tsx`

- Animated gradient (subtle color shift over time)
- Optional particle/grain effect
- Ken Burns: slight zoom from 1.0 → 1.05 over slide duration

#### 3.5 Build `IntroSlide.tsx`

- Date badge (top, fade in at frame 0)
- Title: spring animation from scale 0.8 → 1.0 (frame 10-30)
- Gradient text effect on title
- Preview bullets: sequential fade-in (200ms delay each)
- Slide number: bottom right, 50% opacity

#### 3.6 Build `StorySlide.tsx`

- Headline: slide in from left with spring
- Card: frosted glass, fade up from y+20
- Bullets inside card: sequential appear
- Source badge: bottom left, frosted glass, fade in last
- Slide number: bottom right

#### 3.7 Build `OutroSlide.tsx`

- "That's a Wrap" with gradient text, spring scale
- CTA bullets: sequential fade-in
- Subscribe/like icons (optional)

#### 3.8 Build `CodeSlide.tsx` (for tutorials)

- Language badge: top right
- Code block: typewriter effect (line by line)
- Dark code background with rounded corners

#### 3.9 Build `StepSlide.tsx` (for tutorials)

- Step number in accent circle
- Step title with spring
- Explanation text fade in

#### 3.10 Build `WordCaption.tsx`

- Receives: `words[]` with start/end timestamps
- Current word: highlighted in blue (#007AFF)
- Past words: white
- Future words: hidden or dimmed
- Position: bottom center, 80px from bottom
- Font: Inter Bold 28px with shadow

#### 3.11 Build `Video.tsx` (main composition)

- Receives: `VideoProps` (slides, audioPath, words, musicPath)
- Uses `TransitionSeries` for slide transitions (fade, 0.5s)
- Embeds narration audio
- Embeds background music at 15% volume
- Overlays WordCaption

#### 3.12 Build `render.ts`

- Programmatic rendering: bundle → selectComposition → renderMedia
- Input: VideoProps + outputPath
- Output: MP4 (h264, 1920x1080, 30fps)
- Progress callback for Discord notifications

#### TEST 3.1 — Remotion installs correctly

```bash
npx remotion --version
# ✅ Pass: prints version number
```

#### TEST 3.2 — Single slide renders

```bash
npx tsx src/remotion/render.ts --test-slide intro
open /tmp/test-intro.mp4
# ✅ Pass: dark gradient bg, animated title, bullets fade in
# ❌ Fail: white background, no animation, crash
```

#### TEST 3.3 — Story slide renders

```bash
npx tsx src/remotion/render.ts --test-slide story
open /tmp/test-story.mp4
# ✅ Pass: headline springs in, card with glass effect, source badge
```

#### TEST 3.4 — Transitions between slides

```bash
npx tsx src/remotion/render.ts --test-transition
open /tmp/test-transition.mp4
# ✅ Pass: smooth 0.5s fade between two slides
# ❌ Fail: hard cut, no transition, flicker
```

#### TEST 3.5 — Word captions

```bash
npx tsx src/remotion/render.ts --test-captions /tmp/test-words.json
open /tmp/test-captions.mp4
# ✅ Pass: words highlight in blue as "spoken"
# ❌ Fail: no captions, wrong timing, all highlighted at once
```

#### TEST 3.6 — Full composition with audio

```bash
npx tsx src/remotion/render.ts --test-full
open /tmp/test-full-video.mp4
# ✅ Pass: all slides animated, audio synced, captions working, music playing softly
# ❌ Fail: audio out of sync, slides wrong duration, no music
```

---

### Phase 4: Background Music

#### 4.1 Download free tracks

```bash
mkdir -p assets/music
# Download 3 tracks from Pixabay (tech/upbeat/calm)
# Save as: tech-upbeat.mp3, tech-calm.mp3, tech-ambient.mp3
```

#### 4.2 Configure in config.yaml

```yaml
video:
  backgroundMusic: "tech-upbeat.mp3"
  musicVolume: 0.15
```

#### 4.3 Integrate in Video.tsx

- `<Audio src={musicPath} volume={0.15} />`

#### TEST 4.1 — Music plays in video

```bash
# Render video with background music
# ✅ Pass: music audible but quiet (15%), narration clear and dominant
# ❌ Fail: no music, music too loud, audio clipping
```

---

### Phase 5: Enhanced Content Prompts

#### 5.1 Update `news-writer.ts` system prompt

- Apple keynote style guidelines
- Short headlines (3-6 words)
- Action-verb bullets (max 8 words)
- Strong hooks, clear CTAs
- No filler words

#### 5.2 Update `tutorial-writer.ts` system prompt

- Same Apple style
- Progressive step structure
- Working code examples

#### TEST 5.1 — Script quality check

```bash
npx tsx src/cli.ts run news --stage content
cat output/*/script.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d['slides']:
    title_len = len(s['title'].split())
    print(f'{s[\"slideType\"]}: \"{s[\"title\"]}\" ({title_len} words)')
    if title_len > 6: print('  ⚠️ Title too long!')
"
# ✅ Pass: titles 3-6 words, bullets start with verbs, no filler
# ❌ Fail: long titles, verbose bullets, weak hooks
```

---

### Phase 6: Pipeline Integration

#### 6.1 Update `src/pipeline.ts`

- Replace Playwright + ffmpeg stages with:
  1. Kokoro TTS → audio segments
  2. Concatenate audio
  3. WhisperX → word timestamps
  4. Remotion render → final MP4
- Keep all existing: scraper, content gen, R2 upload, Discord notify, approval

#### 6.2 Update `src/cli.ts`

- `run news` uses new Remotion pipeline
- `--legacy` flag to use old Playwright+ffmpeg pipeline
- Progress reporting to Discord at each new sub-step

#### TEST 6.1 — Full pipeline end-to-end

```bash
npx tsx src/cli.ts run news --skip-upload
# ✅ Pass: video_landscape.mp4 created with:
#   - Dark gradient background
#   - Animated text (spring, fade)
#   - Smooth transitions between slides
#   - Natural voice (Kokoro)
#   - Word-level captions
#   - Background music
#   - Duration: 2-4 minutes
# ❌ Fail: crash at any stage, white slides, no audio, broken captions
```

#### TEST 6.2 — Discord notifications during pipeline

```bash
# Check #team-status for stage updates
# ✅ Pass: notifications at each stage (TTS, timestamps, rendering)
```

#### TEST 6.3 — Approval + upload flow

```bash
npx tsx src/cli.ts run news
# Wait for Discord approval message
npx tsx src/cli.ts approve
# ✅ Pass: uploads to YouTube + Facebook with new quality video
```

#### TEST 6.4 — R2 upload with new video

```bash
# Check R2 bucket for uploaded files
# ✅ Pass: video + slides uploaded, public URLs work
```

---

## Quality Checklist (Final QA)

Before declaring the upgrade complete, verify ALL of these:

- [ ] **Background**: Dark gradient, not white
- [ ] **Title animation**: Springs in, not static
- [ ] **Bullet animation**: Sequential fade-in, not all at once
- [ ] **Transitions**: Smooth fade between slides (0.5s)
- [ ] **Ken Burns**: Subtle zoom on each slide
- [ ] **Voice**: Natural (Kokoro), not robotic
- [ ] **Captions**: Word-by-word highlighting, styled with outline
- [ ] **Music**: Background music audible but quiet
- [ ] **Card effects**: Frosted glass look
- [ ] **Source badges**: Positioned correctly, glass style
- [ ] **Slide numbers**: Bottom right, subtle
- [ ] **Duration**: Matches audio length
- [ ] **Audio sync**: Voice matches slide content
- [ ] **Resolution**: 1920x1080 landscape
- [ ] **File size**: < 50MB for 3-min video
- [ ] **Discord**: All notifications sent to correct channels
- [ ] **Approval**: Buttons/reply working
- [ ] **YouTube**: Uploads successfully
- [ ] **Facebook**: Uploads successfully

---

## Rollback Plan

If Remotion or Kokoro causes issues:

- Set `ttsEngine: "edge-tts"` in config.yaml to revert TTS
- Set `videoEngine: "legacy"` to use old Playwright + ffmpeg pipeline
- Both old and new engines coexist — no destructive changes
