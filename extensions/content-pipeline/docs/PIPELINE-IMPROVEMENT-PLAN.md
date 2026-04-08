# Plan: Make the Vietnamese tech-news pipeline less boring

## Context

The pipeline at `d:/Code/Private/openclaw/extensions/content-pipeline/` produces a Vietnamese
tech-news video end-to-end (gemma4 → edge-tts vi-VN → Pexels B-roll → Remotion overlays → ffmpeg).
The first successful run (`output/news-2026-04-08-14-08/`) is technically correct but
**creatively flat**: corporate "Apple keynote" pacing, monotone narration, repetitive
B-roll, no music, identical slide template every scene. The user wants it to be engaging,
not just functional.

**User feedback after watching the first run:**
1. *"Videos you implement are too randomly not relate to topic. When have topic, you have to
   research to get images, videos which relate to topic."* → The B-roll is generic stock
   footage that doesn't visually tell the actual story (a video about "Russia hacking
   consumer routers" gets a clip of someone touching a generic router instead of Russian
   flags, military insignia, real router brands, attack maps, or screenshots of the
   compromised devices).
2. *"I have read scripts, they are too simple this cause dead time."* → The script LLM
   produces sparse narration. The TTS audio is shorter than the slide visual duration, so
   there are silent gaps where the visual sits with nothing happening.

These two pieces of feedback **change the priority order**: topic-specific visual research
(P0.0) and script density (P0.1) become the top priorities, ahead of personality/tone fixes
(formerly P0.1, now P0.2).

This plan does two things:
1. **Critical weakness analysis** for each pipeline step — root causes of "boring", with
   exact file/line citations.
2. **Targeted improvement design** that pulls existing-but-unused creative levers first
   (highest ROI), then layers in new ones.

## Confirmed scope for first implementation (Phase A only)

After the critical-weakness analysis the user confirmed scope decisions across multiple
turns. **This is the authoritative scope for the first implementation:**

| Decision | Choice |
|---|---|
| **What ships first** | **Phase A** = P0.0 (topic visuals) + P0.1 (script density) + **A-roll architecture** + **typewriter text animations** + **subtle motion effects (Ken Burns + spring transitions)**. Everything else (script personality rewrite, music wiring, scoring weights, multilingual whisper, multi-narrator) is **deferred**. |
| **Visual structure per slide** | **Sequence of 3-5 visuals per slide**, with one designated as **A-roll** (primary anchor: article scroll / kinetic stat card / quote card / timeline / animated map) and the rest as **B-roll** (cutaways: Wikipedia photo / logo / Pexels). |
| **Script length target** | **50-90 Vietnamese words per story slide** (~25-35 s of TTS). Final video ~2.5-3 min. Dead time eliminated. |
| **Text animation** | **Typewriter effect** (char-by-char reveal, ~35 chars/sec, blinking cursor) on all primary text: slide titles, body bullets, A-roll text cards (stat/quote/CTA), and the kinetic captions. |
| **Visual motion** | **Subtle Ken Burns** (slow scale 1.0→1.06 + small drift) on all photos and Pexels clips. **Spring entrance** (Remotion `spring()`) on text cards instead of linear fade. **Easing curves** on every transition. No element is allowed to be static for more than 1.5 s. |
| **A-roll types per slide role** | intro → typewriter title card · "What Happened" → article scroll-and-highlight · "Background" → animated timeline · "Key Details" → kinetic stat card · "Analysis" → quote card · "Why It Matters" → animated implication graphic · outro → CTA card |

These decisions are reflected in **Phase A** below; the rest of the plan (P0.2 onward,
Phase B/C/D) is preserved as a roadmap but **not part of this implementation turn**.

---

## Critical Weakness Analysis (per step)

### Step 1 — Scrape (`src/steps/01-scrape/`)

| Weakness | Why it's bad | Severity |
|---|---|---|
| 12 sources are all **mainstream/consensus** (TechCrunch, Verge, Wired, Engadget, Ars, MIT TR, Hacker News, dev.to, Lobsters, HuggingFace, Google AI, 404 Media) | They all cover the *same* daily stories with the *same* angles. The pool is pre-narrowed to "what corporate tech press already agreed is news". | High |
| `maxPerSource: 3` caps duplicates per source but **does nothing for cross-source duplicates** — when 5 sites all cover the same iPhone leak, all 5 enter the pool. | The scoring step then sees a high-frequency consensus story and ranks it as "must-know", because that's what *looks* important. | High |
| **No surprise feeds**: no Reddit, no niche blogs, no academic feeds, no Vietnamese tech blogs (Tinh Tế, Genk, ICTNews) | Misses both contrarian angles and culturally-relevant content for a Vietnamese audience. The script is in Vietnamese but every story is from a US English-language source — totally disconnected from viewer reality. | **Critical for VN** |
| No recency-weighting beyond RSS feed order | A 12-hour-old "must-know" beats a 1-hour-old surprising scoop. | Medium |

**Root cause:** Source list determines the ceiling on creativity. If everything you scrape
is consensus, no downstream cleverness can recover surprise.

---

### Step 2 — Concept scoring (`src/steps/02-concept/scoring.ts:57-81`)

| Weakness | Why it's bad | Severity |
|---|---|---|
| **Equal weights `1:1:1:1`** (`config.yaml:86-90`) | Necessity dominates ties because mainstream/consensus stories naturally score high on necessity. Attractiveness/novelty *can't beat* a well-reported "must-know". | **Critical** |
| Scoring axes are missing **tension, conflict, human stakes, and cultural relevance** | A boring "company X raised $50M" can outscore "engineer at company Y filed an explosive whistleblower complaint about ethics" because both score "necessity 8". | High |
| Keyword extraction explicitly forces **single-word lowercase nouns** ("hackers" not "iran-linked hackers"; line 65) | Strips the angle. The downstream related-source search now hunts the generic word, which echoes back generic articles. | High |
| Single LLM call returns *one* concept — no diversity, no second-place option, no editorial choice | If the pick is a dud, the pipeline runs anyway. There's no "show me 3 candidates, pick one" loop. | Medium |
| Scoring prompt has **no examples** of what a 9 vs a 5 looks like | The LLM defaults to a centered Gaussian (most things 6-7), making the rank arbitrary. | Medium |

**Root cause:** The scoring rubric rewards safety (necessity/depth) at the expense of surprise (attractiveness/novelty) and ignores the dimensions that actually drive watch-time (tension, human stakes, cultural relevance to the audience).

---

### Step 3 — Related sources (`src/steps/03-related/`)

| Weakness | Why it's bad | Severity |
|---|---|---|
| **Pure keyword matching, no LLM** — `pickRelated()` finds articles whose title/summary contain the concept's keywords | Builds an **echo chamber**: 5 articles all with the same angle. Script has nothing to argue with. | **Critical** |
| Doesn't categorize sources (expert opinion vs. victim testimonial vs. data point vs. opposing view) | The script-writer LLM gets 5 articles all making the same claim and writes one repetitive narrative. | High |
| `relatedSources: 5` cap with no diversity guarantee | Could be 5 reposts of the same wire story. | High |
| First successful Vietnamese run only fetched 1/2 related sources (output run shows). The script then leaned on a single source → fewer specific facts → weaker story. | Quality is fragile against fetch failures. | Medium |

**Root cause:** Related-source finding rewards similarity instead of *productive disagreement*. A great story emerges from contradiction, not consensus.

---

### Step 4 — Script generation (`src/steps/04-script/prompts.ts:34-101`) — **THE PRIMARY BORINGNESS DRIVER**

| Weakness | Why it's bad | Severity |
|---|---|---|
| **Scripts are too sparse / simple → "dead time" in the video** (user complaint #2). The prompt asks for "4-6 confident sentences per slide" but the LLM often delivers shorter Vietnamese narration because the source material is shallow (only 1/2 related sources fetched in last run). The TTS audio comes out shorter than the visual slide duration, leaving silent gaps with static visuals. | The video literally has dead air. Viewers leave during silence. | **Critical (#2)** |
| **No coupling between script length and slide visual duration** — `config.yaml:127` has `durationPerSlide: 8` (a fixed 8-second target) regardless of actual TTS duration. If TTS is 4 seconds, the visual still plays for 8 seconds and 4 seconds is filler. | Visual time and audio time aren't synchronized → silence + static frame. | **Critical** |
| **No "fact density" requirement** — the prompt says "draw SPECIFIC facts" but doesn't quantify (e.g., "minimum 2 named entities, 1 number, 1 quote per story slide") | LLM defaults to vague summary instead of citing specifics. Vague narration is short narration. | High |
| **Locked 7-slide arc** (`SLIDE_ARC` constant, `prompts.ts:17-25`): intro → What Happened → Background → Key Details → Analysis → Why It Matters → Outro. The parser **throws** if the LLM deviates (`prompts.ts:184-192`). | Every video has the exact same structure. A surprise reveal, a cold open, a tension build, a counterintuitive ending — none are possible. The viewer subconsciously anticipates each beat. | **Critical** |
| **"Apple keynote style. Bold, cinematic, substantive."** | Apple keynotes are rehearsed corporate speak, not engaging YouTube. This single phrase defaults the LLM into formal mode. | **Critical** |
| **"No hedging (might, could, perhaps, arguably) — be decisive"** | Strips nuance and authenticity. Real stories have unknowns; pretending otherwise sounds robotic. | High |
| **"Use simple TTS-friendly language"** | For Vietnamese this kills regional voice, slang, idioms — the very things that make Vietnamese narration sound human instead of translated-from-English. | **Critical for VN** |
| **`speakerNotes: 4-6 confident sentences per slide`** × 7 slides = **~30 sentences** in a 2-min video → ~4 sec/sentence → no breath, no pause, no rhythm | Wall-of-words narration. Engaging videos vary sentence length dramatically (1-word punches between 20-word setups). | **Critical** |
| **Body bullets duplicate speaker notes content** — viewer reads bullets while TTS reads similar text → cognitive collision | YouTube research shows on-screen text should *complement* narration, not parrot it. | High |
| **No personality directives**: no "skeptical journalist", no "excited fan", no "concerned analyst", no "outraged citizen". `tone: energetic` is one word with no example. | LLM defaults to Reuters-wire neutrality. | High |
| **No structural variety** by story type — a security breach, a product launch, and an ethics scandal all get the same 7-slide treatment | The story's natural shape is destroyed. | Medium |
| **Prompt has zero example outputs** | LLMs follow examples 10× harder than they follow rules. With no examples, the LLM imagines a generic tech-news template. | High |

**Root cause:** The prompt is a *quality floor* (won't be embarrassing) at the cost of being a *quality ceiling* (can't be great). It optimizes for "no errors" instead of "compelling story".

---

### Step 5 — TTS (`src/steps/05-tts/engines.ts`, `index.ts`)

| Weakness | Why it's bad | Severity |
|---|---|---|
| **Single voice for the entire video** (`vi-VN-HoaiMyNeural`) | Sounds like an audiobook reader, not a video. Multi-narrator (host + secondary) or a single narrator with rare quoted voices is far more engaging. | High |
| **No SSML / prosody control** — `edgeTtsAdapter` only passes `--voice` and `--file`, no rate/pitch/emphasis/breaks | The voice has only one register: forward, even, no drama. | **Critical** |
| **Sentence chunker (`sanitize.ts`)** splits by sentence boundaries with no semantic awareness | Equal-length chunks → equal-length cadence → monotony. No "long setup, short punch" rhythm. | Medium |
| **edge-tts vi-VN reliability ~50%** even after 4× retries (proven in last run: 7/14 chunks failed → silence gaps) | Half the audio is silence. Viewer hears narration … silence … narration. Worse than monotone. | **Critical** |
| **No background music** (config field exists but is empty AND not even passed to renderer; see Step 6) | Music fills the silence gaps and carries emotion. None present. | **Critical** |
| **Whisper model is `ggml-base.en.bin`** (English only) → **no word-level timestamps for Vietnamese** | Falls back to per-slide block captions instead of kinetic word-by-word — kills the TikTok-style caption energy that makes short videos pop. | **Critical for VN** |

**Root cause:** TTS is treated as plumbing, not as a creative element. No prosody, no music bed to compensate, no language-correct subtitles.

---

### Step 6 — Video render (`src/steps/06-video/broll.ts`, `pexels.ts`, `src/remotion/`)

| Weakness | Why it's bad | Severity |
|---|---|---|
| **B-roll is topic-disconnected, not just repetitive** — even with optimized cinematic prompts, Pexels stock footage of "neon data center" has nothing to do with the actual story ("Russia hacked Asus routers"). The viewer sees beautiful but irrelevant clips and tunes out. | This is the **#1 user complaint**. The system doesn't *research* the topic — it searches stock libraries with abstract keywords. There are no Russian flags, no real router brands, no attack maps, no source-article screenshots. | **Critical (#1)** |
| **No entity extraction** — the script mentions specific people, products, companies, places, dates, but none are pulled out for targeted visual search | Pexels search "router" gets generic photos. Pexels search "Asus RT-AC68U Russia GRU" gets nothing. The pipeline never tries the *right* search because it never identifies the entities. | **Critical** |
| **No use of source-article screenshots** — the script cites real news articles (already fetched in Step 3) but their screenshots/headlines/images aren't pulled and shown | The most authoritative visual for "according to MIT Tech Review" is *the actual MIT Tech Review headline*. We have the URL, we never grab it. | **Critical** |
| **No use of Wikipedia/Wikimedia images** for named entities (people, places, products, companies, events) | A story about Sam Altman could show Sam Altman's actual face (CC-licensed Wikipedia photo). Instead it shows a stock model in a suit. | **Critical** |
| **No company logo lookup** (Clearbit, Brandfetch, or simple favicon-based) for product/company mentions | A story about OpenAI should *open* with the OpenAI logo, not a stock image of "AI". | High |
| **Pexels query is `keywords[slideIdx % keywords.length]`** (`broll.ts:43-46`) | Slide 1 gets "router", slide 2 "hackers", slide 3 "router" (loop wraps), slide 4 "hackers"… Same 2-3 clips repeat. Even fixing this is a partial solution unless P0.0 (topic research) is done. | **Critical** |
| **`prompt-optimizer.ts` is wired but only used for AI video** (broll.ts never calls it) | The cinematic prompt LLM that exists in the codebase goes to waste in Pexels mode — but **fixing this alone is insufficient**. Cinematic prompts produce visually nice but topic-disconnected results. | High |
| **Background music** — `config.yaml` has `backgroundMusic` and `musicVolume` fields, `Video.tsx:164` has the loop logic, BUT `renderWithRemotion()` (`pipeline.ts:620-627`) **never passes musicPath to the renderer**. **Dead code.** | The single most impactful production change is one missing argument away. | **Critical** |
| **No Ken Burns / pan-zoom on B-roll** — Pexels videos play at native speed and framing | Static-feeling. Even slight constant motion (5% slow zoom) reads as "produced". | High |
| **Subtitles for B-roll burned via ffmpeg SRT** — block-style 2-line captions, not word-by-word kinetic | TikTok/Reels engagement comes from one-word-at-a-time bouncing captions. We have the data (whisper word timestamps) but only render karaoke captions in *non-B-roll* mode. | **Critical** |
| **15-frame fade between slides only** (`Video.tsx:88-93`) | One transition style for the entire video. No whip-pan, no cut-on-beat, no zoom transition, no glitch. | High |
| **Same title chip position every slide** (top-left glassmorphic, 64px) | Visual repetition is the dictionary definition of boring. | Medium |
| **No camera movement or scaling on text** — title fades in once and sits there | Static text + static B-roll = no on-screen movement except for the B-roll's own native motion. | High |
| **No icons / logos / data visualizations** — story about routers shows a stock photo of a router, not a router *icon* zooming in or a pulsing globe of compromised devices | Misses the "explainer" register. Big tech YouTubers (MKBHD, Veritasium, Vox) lean heavily on motion graphics for key moments. | High |
| **No font customization** — Remotion theme uses system fonts, no Inter/JetBrains Mono actually loaded | Looks unbranded. | Low |

**Root cause:** Pexels mode is a "downgrade path" — it was bolted on as a no-GPU alternative to AI video and inherited none of the creative tooling (prompt optimizer, kinetic captions, music bed) that the AI-video path has. It produces a *technically valid* video, not a *compelling* one.

---

### Cross-cutting weaknesses

| Issue | Impact |
|---|---|
| **Agent skills (`agents/`, `skills/`) are documentation, not active prompt overrides.** They describe the pipeline to human operators but no code reads them at runtime. Improvements must go into source files, not SKILL.md. | Slows iteration if you expected to tune via SKILL.md edits. |
| **No A/B output** — every story produces exactly one script with no second variant. No editorial choice. | Locks in whatever the first roll gives you. |
| **No human-in-loop creative gate** before render. Only an approval step *after* the full video is done — too late to fix the script. | Wasted GPU/time on bad scripts you'll throw out. |
| **No prompt-evolution feedback loop** — successful videos don't feed back into better future prompts. | The system can't learn what works for *this* channel. |
| **Telemetry missing**: no per-step duration logging that would identify slow steps to optimize. | Can't optimize what you can't see. |

---

## Improvement Design (priority order, highest ROI first)

The goal is **biggest perceptual upgrade per line-of-code changed**. Free wins first.

### 🥇 P0 — Free wins, do these first (small changes, huge impact)

#### P0.A — **A-roll architecture + typewriter + motion** (added per user direction, part of Phase A) ⭐

Current pipeline has only B-roll → no anchor visual → viewer's eye drifts. Add A-roll
(primary subject) per slide, layer B-roll cutaways behind/around it, and animate text
with typewriter effect + subtle motion on every element.

- **Type changes** (`src/types.ts`):
  ```ts
  type VisualRole = "a-roll" | "b-roll";
  type VisualKind =
    | "screenshot"        // article scroll-and-highlight (A-roll)
    | "stat-card"         // kinetic stat/number card (A-roll)
    | "quote-card"        // big quote text (A-roll)
    | "timeline-card"     // animated timeline (A-roll)
    | "title-card"        // intro/outro typewriter title (A-roll)
    | "wikipedia"         // CC-licensed photo (B-roll)
    | "logo"              // Clearbit logo (B-roll)
    | "pexels-photo"      // stock photo (B-roll)
    | "pexels-video";     // stock clip (B-roll)
  type VisualItem = {
    role: VisualRole;
    kind: VisualKind;
    path?: string;        // local file (when applicable)
    text?: string;        // for text cards (stat/quote/title/CTA)
    durationSec: number;
    motion?: "ken-burns" | "scroll" | "spring-in" | "typewriter" | "none";
  };
  type VisualPlan = { slideIndex: number; items: VisualItem[] };
  ```
- **A-roll selection rule:** every slide MUST have at least one item with `role: "a-roll"`.
  The visual research step picks the A-roll *kind* based on slide role:
  - `intro` → `title-card` (typewriter the title)
  - story slide labeled "What Happened" → `screenshot` (article scroll, with the
    relevant paragraph highlighted as TTS narrates that beat)
  - story labeled "Background" → `timeline-card`
  - story labeled "Key Details" → `stat-card` (LLM extracts the most quotable number)
  - story labeled "Analysis" → `quote-card`
  - story labeled "Why It Matters" → `stat-card` or `quote-card` (whichever fits)
  - `outro` → `title-card` with CTA
- **B-roll layering:** the remaining 2-3 items are B-roll cutaways. They render in the
  margins / behind / between the A-roll segment, providing visual rhythm. Total visual
  duration = TTS duration for the slide.

- **New Remotion components** (`src/remotion/components/`):
  - `TitleCard.tsx` — typewriter-revealed title text, blinking cursor, spring scale-in
  - `StatCard.tsx` — large number with typewriter, label below, subtle parallax background
  - `QuoteCard.tsx` — quote in big serif, attribution typewritten after, fade B-roll behind
  - `ArticleScroll.tsx` — wraps a screenshot, animates scroll position + draws a moving
    yellow highlight rectangle on the active paragraph
  - `TimelineCard.tsx` — horizontal timeline, dots appear with spring, label typewrites
  - `KenBurnsImage.tsx` — wraps any image with `interpolate(scale 1.0→1.06)` + small drift
  - `Typewriter.tsx` — reusable: takes text + duration, slices visible chars with spring

- **Motion baseline rules** (enforced across all components):
  - All photos (Wikipedia, screenshots, Pexels) wrap in `KenBurnsImage` — never static
  - All Pexels videos get a slow scale envelope (1.0 → 1.04 over the clip duration)
  - All text uses `Typewriter.tsx` for the first appearance — no instant fade-in text
  - All entrances use Remotion `spring()` not linear interpolate (springs feel alive)
  - Inter-visual transitions: 8-12 frame crossfades with eased opacity, NOT hard cuts
    or 15-frame linear fades

- **Engine integration:** the existing Pexels engine path in `pipeline.ts` calls
  `await researchVisuals(slides, concept, relatedSources, config)` (the new step from
  P0.0) which now returns `VisualPlan[]` with both A-roll and B-roll items. Remotion
  iterates each slide's items, rendering each with its appropriate component + motion.

- **Cost:** ~700 lines total (250 visual-research + 7 Remotion components × ~50 lines +
  pipeline glue + types). Big change but contained to Phase A.
- **Impact:** ★★★★★ — gives the eye an anchor on every slide, adds constant motion,
  every text reveal feels alive. Combined with P0.0 (topic-relevant fetched visuals)
  and P0.1 (dense scripts + no dead time), this should make the videos feel
  fundamentally different — produced, not generated.

#### P0.0 — **Topic-aware visual research** (addresses user feedback #1) ⭐ NEW TOP PRIORITY

The current `broll.ts:38-59` does 2-character keyword searches like "router" → generic stock
footage. The fix is a new step between script generation and rendering: **extract entities
from the script, then fetch topic-specific visuals from the right source for each entity
type**. Pexels stays as the *atmospheric fallback*, not the primary source.

- **New file:** `src/steps/06-video/visual-research.ts` (~150 lines)
- **What it does:**
  1. **Entity extraction** — given a slide's `title + body + speakerNotes`, call the LLM
     with a small prompt: *"Extract named entities from this Vietnamese tech-news slide.
     Return JSON: `{people: [], companies: [], products: [], places: [], events: [], concepts: []}`."*
     One LLM call per slide (cheap).
  2. **Per-entity visual fetch**, in priority order until we have a usable result:
     - **Source-article screenshots** — for each related-source URL fetched in Step 3, use
       Playwright (already a dependency) to screenshot the article header (title + hero
       image). Saves to `output/<run>/visuals/screenshot_<n>.png`. **Most authoritative
       visual for "according to MIT Tech Review".**
     - **Wikipedia/Wikimedia** for people, places, products (free, CC-licensed). Use the
       MediaWiki API: `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=...`
       — returns the page's hero image URL. No API key.
     - **Brand logos** for company entities — Clearbit's free Logo API:
       `https://logo.clearbit.com/<domain>` — returns a transparent PNG. No key.
     - **Pexels image search** (`api.pexels.com/v1/search?query=...`) for atmospheric/mood
       shots when nothing specific exists. Pexels has both photos AND videos endpoints —
       we currently only use videos. Photos are far more on-topic for many entities.
     - **Pexels videos** (current path) as last resort with optimized cinematic prompts.
  3. **Per-slide visual mix** — instead of one Pexels clip per slide, allow each slide to
     have a *sequence* of visuals: e.g., for slide 2 of "Russia hacks routers":
     `[russian-flag.jpg (1.5s) → asus-router-product-shot.jpg (2s) → mit-tech-review-screenshot.png (2s) → pexels-atmospheric-cyber.mp4 (3s)]`.
     Total visual time matches TTS duration exactly, fed into Remotion as a per-slide clip
     array.
- **Output shape** added to existing types:
  ```ts
  type VisualPlan = {
    slideIndex: number;
    items: Array<{
      kind: "screenshot" | "wikipedia" | "logo" | "pexels-photo" | "pexels-video";
      path: string;        // local file
      durationSec: number; // share of slide audio time
      caption?: string;    // optional small attribution
    }>;
  };
  ```
- **Engine integration:** the Pexels engine in `pipeline.ts` calls
  `await researchVisuals(slides, concept, relatedSources, config)` between script and
  Remotion render. The render step then iterates per-slide visual sequences instead of one
  clip per slide.
- **Cost:** ~200 lines of new code, plus ~30 lines of Remotion changes to render visual
  sequences. Reuses Playwright (already installed for scraping). Wikipedia + Clearbit need
  no keys.
- **Impact:** ★★★★★ — directly fixes user complaint #1. Transforms output from "stock
  footage with text" to "topic-specific video with real footage".
- **Risk:** screenshots might fail for paywalled articles → Wikipedia fallback. Wikipedia
  might miss obscure entities → Pexels fallback. The fallback chain ensures we always have
  *something* visual.

#### P0.1 — **Fix script density and dead-time** (addresses user feedback #2) ⭐ NEW

The script LLM is producing sparse content; the resulting TTS audio is shorter than the
visual; the viewer sees static frames during silence. Fix at two levels: write denser
scripts AND make slide duration follow audio duration.

- **File 1:** `src/steps/04-script/prompts.ts:41-78` (the system prompt)
  - Replace **"4-6 confident sentences per slide"** with explicit minimums:
    - intro slide: **2-3 punchy sentences, ~10-15 seconds of speech**
    - story slides 2-6: **5-8 sentences, ~25-35 seconds of speech each, MUST include at
      least 2 named entities, 1 specific number/date/quote, and 1 vivid detail**
    - outro slide: **2-3 sentences, clear call-to-action**
  - Add to the rules section: *"Scripts that are too short cause dead air in the final
    video. Be substantive. Cite specifics. Build the story."*
  - Add a hard rule: *"speakerNotes word count target: ~50-90 words per story slide"* —
    Vietnamese ~50 words ≈ 25 seconds of TTS at HoaiMy's default rate.
- **File 2:** `src/steps/06-video/broll.ts` and the engine path in `pipeline.ts`
  - Remove `durationPerSlide: 8` as a fixed target. Each slide's render duration =
    `audioSegments[i].durationSeconds + 0.4s` (small lead-out for transition).
  - Total video duration = sum of audio durations + transitions. No more silence padding.
- **File 3:** `config.yaml:127`
  - Change `durationPerSlide: 8` from a *target* to a *minimum floor* (e.g., `2.5`) — only
    used if TTS for a slide is suspiciously short.
- **Cost:** ~30 lines across 3 files
- **Impact:** ★★★★★ — directly fixes user complaint #2. Eliminates dead air entirely.
- **Combined with P0.0**: visual sequences are already sized to audio duration, so no
  silence + on-topic visuals in motion = no dead time at all.

#### P0.2 — Rewrite `script/prompts.ts` system prompt with personality + examples
- **File:** `src/steps/04-script/prompts.ts:41-78`
- **Changes:**
  - Replace "Apple keynote style" with a specific persona (`"You are a sharp Vietnamese tech YouTuber with 500K subscribers. Think Vox meets MKBHD meets a Vietnamese cultural insider."`)
  - **Add 1 full worked example** of an excellent 7-slide output (in Vietnamese) showing variable sentence length, surprising openings, human stakes
  - Replace "no hedging" with "be honest about what's unknown"
  - Replace "simple TTS-friendly language" with "use natural Vietnamese — slang and idioms welcome where they fit"
  - Drop the speakerNotes target from "4-6 confident sentences" to **"1-5 sentences, varying dramatically — short punchy sentences are powerful"**
  - Add directive: **bullet body must NOT restate speakerNotes — it's a visual sidebar (a stat, a name, a number)**
  - Add: "Open the intro with one of: a question, a startling number, a quote, a counterintuitive claim. Never start with 'Today we look at…'"
- **Cost:** ~1 file, ~80 lines of prompt text
- **Impact:** ★★★★★ — biggest single lever

#### P0.3 — Wire background music into the renderer (3-line fix)
- **Files:** `src/pipeline.ts:620-627`, possibly `src/remotion/render.ts`, possibly `Video.tsx`
- **Changes:**
  - Pass `musicPath` from `config.video.backgroundMusic` into `renderWithRemotion()` call
  - Copy the file into the Remotion `public/` directory at render time (Remotion serves from there)
  - Add a default music asset to `public/music/bed-default.mp3` so it works out-of-box
  - Set `musicVolume: 0.12` default (under voice, audible in silence gaps)
- **Cost:** ~5 lines of glue + 1 asset file
- **Impact:** ★★★★★ — instantly transforms perceived production value, masks the silence gaps from TTS failures

#### P0.4 — Use `prompt-optimizer.ts` for Pexels *fallback* queries (only when P0.0 has no specific visual)
- **Files:** `src/steps/06-video/broll.ts:38-59`, `src/steps/06-video/pexels.ts`, `src/pipeline.ts` (where Pexels engine runs)
- **Changes:**
  - In the Pexels engine path, after the script step, call `optimizePrompts(slides, config.content)` (already exists, see `prompt-optimizer.ts:26`)
  - Use the resulting cinematic prompts as Pexels search queries instead of `keyword[i % len]`
  - Cache the optimized prompts in the run output (`script-prompts.json`) for reuse on retry
- **Cost:** ~30 lines, integrates an existing function
- **Impact:** ★★★★ — every slide gets a unique, vivid query → varied B-roll → no more repeating clips

#### P0.5 — Switch concept scoring weights + add tension axis
- **Files:** `src/steps/02-concept/scoring.ts:57-81`, `config.yaml:86-90`, `src/types.ts` (ScoreWeights shape)
- **Changes:**
  - Add a 5th score axis: `tension` (1-10) — "does this story have conflict, stakes, surprise?"
  - Update the LLM scoring prompt to show example scores for "boring" vs "compelling" tech stories
  - Default weights: `necessity: 0.8, attractiveness: 1.5, novelty: 1.5, depth: 1.0, tension: 2.0`
  - Allow override in `config.yaml`
- **Cost:** ~40 lines across 3 files
- **Impact:** ★★★ — better story selection means even unchanged downstream produces more interesting videos

#### P0.6 — Download multilingual whisper model + use it
- **Files:** `config.yaml:157`, plus a one-time `~/.openclaw/models/whisper/ggml-base.bin` download (~140 MB)
- **Changes:**
  - Switch `subtitles.modelPath` from `ggml-base.en.bin` to `ggml-base.bin` (or `ggml-small.bin` for better accuracy)
  - Add `language: "vi"` flag to whisper-cli invocation in `subtitles.ts`
  - Install whisper.cpp Windows binary (manual download from `ggerganov/whisper.cpp` releases on GitHub, *not* winget)
- **Cost:** model download + ~10 lines in subtitles.ts
- **Impact:** ★★★ — unlocks word-level Vietnamese timestamps → enables kinetic captions on B-roll (P1.1)

### 🥈 P1 — Visual upgrades (medium effort, big impact)

#### P1.1 — Kinetic word-by-word captions on B-roll mode
- **Files:** `src/steps/06-video/broll.ts:78-124` (currently emits SRT for ffmpeg burn), `src/remotion/components/WordCaption.tsx` (currently used only in Remotion-only mode), the engine switch in `pipeline.ts`
- **Changes:**
  - **Stop burning SRT in B-roll mode**. Instead, run B-roll through Remotion as the background layer with `WordCaption` overlaying it.
  - Requires Remotion to accept B-roll video as a `<Video>` source per scene (it already does, see `BrollSlide.tsx:131-144` — extend it to also render `<WordCaption>`)
- **Cost:** ~50 lines of Remotion + remove the ffmpeg subtitle pass
- **Depends on:** P0.6 (need word timestamps for vi)
- **Impact:** ★★★★ — TikTok-style captions are *the* visual signature of high-engagement short-form video

#### P1.2 — Ken Burns pan/zoom on Pexels clips
- **Files:** `src/remotion/components/StorySlide.tsx` (where B-roll renders), or extend `BrollSlide.tsx`
- **Changes:**
  - Apply a Remotion `interpolate()` over scale (1.0 → 1.08) and translation across the clip duration
  - Randomize start scale and direction per slide so all 7 clips don't pan the same way
- **Cost:** ~20 lines
- **Impact:** ★★★ — adds constant subtle motion, the difference between "stock footage" and "produced video"

#### P1.3 — Add Vietnamese sources to scrape
- **Files:** `config.yaml:4-66`
- **Changes:**
  - Add Tinh Tế, Genk, ICTNews, VnExpress số hóa, Reddit `r/vietnam` tech threads
  - Tag sources with `culture: "vi"` and bias the scoring step to prefer them when content language is `vi`
- **Cost:** ~6 RSS URLs + 5 lines of weighting in scoring
- **Impact:** ★★★★ for Vietnamese audience — finally tells *Vietnamese* tech stories

#### P1.4 — TTS chunk pacing + intentional pauses
- **Files:** `src/steps/05-tts/sanitize.ts` (chunker), `src/steps/05-tts/engines.ts` (edge-tts adapter), or build a new wrapper
- **Changes:**
  - In the script prompt, allow `[pause:short]` and `[pause:long]` markers in speakerNotes
  - Sanitize step: split on these markers, generate empty audio segments for pauses
  - This gives the LLM control over rhythm
- **Cost:** ~30 lines
- **Impact:** ★★★ — makes narration breathe

### 🥉 P2 — Bigger creative bets (larger effort, transformative if they land)

#### P2.1 — Two-narrator banter mode
- Use two voices (`vi-VN-HoaiMyNeural` + `vi-VN-NamMinhNeural`), have the script LLM tag each sentence with which narrator says it. Synthesize per-sentence, alternate.
- **Cost:** ~80 lines + script prompt rework
- **Impact:** ★★★★ — sounds like a podcast, not a robot

#### P2.2 — Diverse related-source fetching (replace `pickRelated()` with LLM-routed)
- For each picked concept, ask the LLM: *"Find me 1 expert opinion source, 1 contrarian view, 1 data point, 1 victim/user story, 1 historical precedent."* Use a search step (Brave/DuckDuckGo API) to satisfy each role.
- **Cost:** ~120 lines + a search-API integration
- **Impact:** ★★★★ — script gets *productive disagreement* to write from

#### P2.3 — Per-scene visual mode router
- New step between script and render: ask LLM "for this slide, is the best visual: motion footage / static photo / icon-and-text / data viz / face-cam quote / split-screen?". Render each per its mode.
- **Cost:** Big — needs new Remotion components for each mode + a router step
- **Impact:** ★★★★★ — true visual variety

### Skipped / not recommended for now

- **ElevenLabs TTS** — defer until P0 + P1 are done. The current voice quality isn't the bottleneck; the script and visuals are. Don't pay $22/mo to make boring scripts sound nicer.
- **AI video (LTX/Wan)** — heavy GPU dependency, slow, the venv setup is non-trivial, and the user already has Pexels + Remotion working. Defer until the cheap wins are exhausted.

---

## Recommended phasing

**Phase A — "Fix the user complaints + add anchor + add motion" (current implementation):**
P0.0 + P0.1 + P0.A
→ Topic-aware visuals (no more random stock footage), dense scripts (no more dead time),
A-roll architecture (anchor visual on every slide), typewriter text reveals, Ken Burns
motion on every photo, spring entrances. **This is the full first-implementation scope
agreed across user turns 1-4.**

**Phase B — "Audio polish":** P0.2 (script personality) + P0.3 (background music) + P0.6
(multilingual whisper) + P1.1 (kinetic word-by-word captions on B-roll)
→ Better script voice, music bed, Vietnamese word timestamps unlocking TikTok-style
captions.

**Phase C — "Smarter selection":** P0.4 (Pexels fallback prompts) + P0.5 (scoring weights
+ tension axis) + P1.3 (Vietnamese sources)
→ Better story picks and culturally-relevant sourcing.

**Phase D — "Bigger creative bets":** P1.4 + P2.1 + P2.2 + P2.3
→ TTS pacing pauses, multi-narrator, diverse sourcing, per-scene visual mode router.

---

## Critical files to modify (Phase A scope)

| File | Purpose | P-level |
|---|---|---|
| **NEW** `src/remotion/components/Typewriter.tsx` | Reusable typewriter text reveal with cursor | **P0.A** |
| **NEW** `src/remotion/components/KenBurnsImage.tsx` | Wraps any image with slow scale + drift | **P0.A** |
| **NEW** `src/remotion/components/TitleCard.tsx` | A-roll: intro/outro typewriter title | **P0.A** |
| **NEW** `src/remotion/components/StatCard.tsx` | A-roll: kinetic stat/number card | **P0.A** |
| **NEW** `src/remotion/components/QuoteCard.tsx` | A-roll: big quote text | **P0.A** |
| **NEW** `src/remotion/components/ArticleScroll.tsx` | A-roll: source-article scroll-and-highlight | **P0.A** |
| **NEW** `src/remotion/components/TimelineCard.tsx` | A-roll: animated timeline | **P0.A** |
| **NEW** `src/steps/06-video/visual-research.ts` | Entity extract + multi-source fetch + A-roll/B-roll planner | **P0.0 + P0.A** |
| **NEW** `src/steps/06-video/entity-extract.ts` | LLM call: slide → `{people, companies, products, places, events, concepts, key_stats, key_quotes}` | **P0.0** |
| `src/types.ts` | Add `VisualPlan`, `VisualItem`, `VisualRole`, `VisualKind` | **P0.0 + P0.A** |
| `src/pipeline.ts` (Pexels engine path) | Call `researchVisuals()`, thread `VisualPlan[]` to Remotion | **P0.0** |
| `src/remotion/components/BrollSlide.tsx:131-144` | Iterate the slide's `items[]` and render each with its component (TitleCard / StatCard / KenBurnsImage / etc.) | **P0.0 + P0.A** |
| `src/steps/06-video/pexels.ts` | Add image-search wrapper (`api.pexels.com/v1/search`) | **P0.0** |
| `src/steps/04-script/prompts.ts:41-78` | Density rules + word-count targets + (also extract `key_stats[]` and `key_quotes[]` into the script JSON for the stat/quote cards) | **P0.1** |
| `src/pipeline.ts:620-627` (renderWithRemotion call site) | Slide duration = audio duration (no padding) | **P0.1** |
| `src/steps/04-script/index.ts` and `prompts.ts:130` (`parseConceptScript`) | Extend output JSON shape to include `key_stats: string[]` and `key_quotes: {text, attribution}[]` per slide for the A-roll cards | **P0.1 + P0.A** |
| `src/remotion/render.ts` | Accept and use musicPath argument | P0.3 |
| `src/remotion/Video.tsx:164` | Already has `<Audio loop>` — verify wiring | P0.3 |
| `src/steps/06-video/broll.ts:38-59` (`buildSearchTerm`) | Replace dumb keyword rotation with optimized prompt — but only as Pexels *fallback* path | P0.4 |
| `src/steps/06-video/prompt-optimizer.ts:26` | `optimizePrompts()` — already exists, call from fallback path | P0.4 (reuse) |
| `src/steps/02-concept/scoring.ts:56-98` | Scoring prompt — add tension axis + examples | P0.5 |
| `config.yaml:86-90` | scoreWeights defaults | P0.5 |
| `src/types.ts` | Add `tension` to `ScoreWeights` shape | P0.5 |
| `config.yaml:157` | Switch whisper model to multilingual | P0.6 |
| `src/steps/06-video/subtitles.ts` | Pass `--language vi` to whisper-cli | P0.6 |
| `config.yaml:4-66` | Add Vietnamese RSS sources | P1.3 |

---

## Existing functions to reuse (don't rewrite)

| Function | Where | Use for |
|---|---|---|
| `optimizePrompts(slides, config)` | `src/steps/06-video/prompt-optimizer.ts:26` | Generate Pexels queries (P0.3) |
| `WordCaption` component | `src/remotion/components/WordCaption.tsx:10-84` | Kinetic captions on B-roll (P1.1) |
| `parseConceptScript()` | `src/steps/04-script/prompts.ts:130` | Already validates the script JSON shape — keep it but relax the slide-arc enforcement after P0.1 if we want structural variety |
| `generateTextWithFallback()` | `src/content/llm.ts` | Any new LLM call should use this for the model fallback chain |
| `chunkBySentence` logic | `src/steps/05-tts/sanitize.ts` | Extend it to handle `[pause:*]` markers (P1.4) |

---

## Verification

### Verifying Phase A (the user-feedback fixes)

1. **Smoke run:** `npx tsx src/cli.ts run news --skip-upload`
2. **Topic-relevance check (P0.0):** open `output/<run>/visuals/` — verify the directory
   exists and contains *topic-specific* files: at least one `screenshot_*.png` of the
   actual source article, at least one `wikipedia_*.jpg` if any named entity exists, at
   least one `logo_*.png` if any company is mentioned. **Look at the files** — do they
   relate to the story title? If the story is "Russia hacked routers" do you see Russian
   imagery, real router brands, news headlines? If it's still all generic stock footage,
   P0.0 has not actually shipped.
3. **Dead-time check (P0.1):** open `output/<run>/video_landscape.mp4`. Scrub through.
   **Are there any silent gaps where the visual sits with no narration?** If yes, the
   slide-duration-follows-audio change didn't ship. Run
   `ffprobe -show_streams output/<run>/video_landscape.mp4` and verify the audio
   stream covers the full video duration with no silence segments.
4. **Script density check (P0.1):** read `output/<run>/script.json`. For each story slide,
   check the `speakerNotes` field — should be 50-90 Vietnamese words, mention at least 2
   named entities, at least 1 specific number/date/quote.
5. **Music check (P0.3):** does the video have audible background music under the
   narration? `ffprobe` should show one audio stream with mixed content.
6. **Personality check (P0.2):** does the intro slide open with a hook (question, number,
   quote, counterintuitive claim) instead of "Hôm nay chúng ta tìm hiểu…"?

### Verifying Phase B

7. **Caption check (P1.1):** are captions appearing word-by-word on the B-roll in
   Vietnamese (requires P0.6 multilingual whisper)? Open the video and pause on a frame
   mid-narration — should see one or two highlighted Vietnamese words, not a 2-line
   English-style block.
8. **Motion check (P1.2):** does each visual have subtle pan/zoom?
9. **Source check (P1.3):** does at least one of the 30 scraped articles come from a
   Vietnamese source (Tinh Tế, Genk, ICTNews, VnExpress)?

### Final acceptance

End-to-end target after Phase A: **a Vietnamese viewer can watch the first 30 seconds and
say "đúng chủ đề, không có khoảng lặng, có nhạc nền, mở đầu hấp dẫn"** ("on-topic, no
silent gaps, has background music, engaging opening"). That directly maps to the user's
two complaints + the music polish.

End-to-end target after Phase B: would actually be willing to publish to a real YouTube
channel.
