import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  staticFile,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { IntroSlide } from "./components/IntroSlide";
import { OutroSlide } from "./components/OutroSlide";
import { StorySlide } from "./components/StorySlide";
import { WordCaption } from "./components/WordCaption";
import { TitleCard } from "./components/TitleCard";
import { StatCard } from "./components/StatCard";
import { QuoteCard } from "./components/QuoteCard";
import { ArticleScroll } from "./components/ArticleScroll";
import { TimelineCard } from "./components/TimelineCard";
import { KenBurnsImage } from "./components/KenBurnsImage";
import { Typewriter } from "./components/Typewriter";
import type { VideoProps, SlideData, VisualPlan, VisualItem } from "./types";

function parseBody(body: string | string[]): string[] {
  if (Array.isArray(body)) return body;
  return body
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function getSource(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function renderSlide(slide: SlideData, index: number, total: number): React.ReactNode {
  const bullets = parseBody(slide.body);

  switch (slide.slideType) {
    case "intro":
    case "title":
      return (
        <IntroSlide
          title={slide.title}
          bullets={bullets}
          date={new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
          slideIndex={index}
          totalSlides={total}
        />
      );
    case "story":
    case "step":
      return (
        <StorySlide
          title={slide.title}
          bullets={bullets}
          source={getSource(slide.sourceUrl)}
          slideIndex={index}
          totalSlides={total}
        />
      );
    case "outro":
      return (
        <OutroSlide title={slide.title} bullets={bullets} slideIndex={index} totalSlides={total} />
      );
    default:
      return (
        <StorySlide
          title={slide.title}
          bullets={bullets}
          source={getSource(slide.sourceUrl)}
          slideIndex={index}
          totalSlides={total}
        />
      );
  }
}

/** Fade wrapper for slide transitions */
const FadeSlide: React.FC<{ children: React.ReactNode; durationInFrames: number }> = ({
  children,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], {
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>{children}</AbsoluteFill>;
};

/** A glassmorphic chip showing the slide title — overlaid on B-roll backgrounds. */
const TitleChip: React.FC<{ title: string }> = ({ title }) => {
  if (!title) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 80,
        left: 80,
        padding: "20px 36px",
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.18)",
        maxWidth: "70%",
      }}
    >
      <div
        style={{
          fontFamily: "Helvetica, sans-serif",
          fontWeight: 800,
          color: "white",
          fontSize: 64,
          lineHeight: 1.1,
          letterSpacing: -1,
          textShadow: "0 4px 24px rgba(0,0,0,0.6)",
        }}
      >
        {title}
      </div>
    </div>
  );
};

/** B-roll background slide: full-bleed video + dark vignette + title chip. */
const BrollSlide: React.FC<{ brollPath: string; title: string }> = ({ brollPath, title }) => {
  return (
    <AbsoluteFill>
      <OffthreadVideo src={staticFile(brollPath)} muted />
      {/* Dark gradient at top + bottom for caption + title readability */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.7) 100%)",
        }}
      />
      <TitleChip title={title} />
    </AbsoluteFill>
  );
};

/**
 * P0.A — Render a single VisualItem with the right component + Ken Burns motion.
 * Used inside <VisualSequence> below; takes the duration in frames the item
 * occupies inside its parent <Sequence> so motion components can compute their
 * envelopes.
 */
const VisualItemRenderer: React.FC<{ item: VisualItem; durationInFrames: number; index: number }> = ({
  item,
  durationInFrames,
  index,
}) => {
  switch (item.kind) {
    case "title-card":
      return <TitleCard title={item.text ?? ""} subtitle={item.subtext} />;
    case "stat-card":
      return <StatCard text={item.text ?? ""} subtext={item.subtext} />;
    case "quote-card":
      return <QuoteCard text={item.text ?? ""} subtext={item.subtext} />;
    case "article-scroll":
      if (!item.path) return <TitleCard title={item.text ?? ""} subtitle={item.subtext} />;
      return (
        <ArticleScroll
          src={item.path}
          title={item.text ?? ""}
          subtext={item.subtext}
          durationInFrames={durationInFrames}
        />
      );
    case "timeline-card":
      return <TimelineCard text={item.text ?? ""} subtext={item.subtext} />;
    case "wikipedia":
    case "pexels-photo":
    case "screenshot":
      if (!item.path) return null;
      return (
        <KenBurnsImage
          src={item.path}
          durationInFrames={durationInFrames}
          variant={(["in", "out", "left", "right"] as const)[index % 4]}
          fit="cover"
          caption={item.caption}
        />
      );
    case "logo":
      if (!item.path) return null;
      return <LogoCard src={item.path} caption={item.caption} durationInFrames={durationInFrames} />;
    case "pexels-video":
      if (!item.path) return null;
      return (
        <AbsoluteFill style={{ background: "#000" }}>
          <OffthreadVideo src={staticFile(item.path)} muted />
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 75%, rgba(0,0,0,0.55) 100%)",
            }}
          />
        </AbsoluteFill>
      );
    default:
      return null;
  }
};

/** Centered logo on dark gradient background, with spring scale-in. */
const LogoCard: React.FC<{ src: string; caption?: string; durationInFrames: number }> = ({
  src,
  caption,
}) => {
  const frame = useCurrentFrame();
  // Subtle scale and opacity entrance using interpolate (kept lightweight)
  const scale = interpolate(frame, [0, 18], [0.8, 1], { extrapolateRight: "clamp" });
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(135deg, #0a0a0a 0%, #181830 50%, #0a0a0a 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
      }}
    >
      <img
        src={src.startsWith("http") || src.startsWith("file:") ? src : staticFile(src)}
        alt={caption ?? "logo"}
        style={{
          maxWidth: "55%",
          maxHeight: "55%",
          objectFit: "contain",
          transform: `scale(${scale})`,
          opacity,
          filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.6))",
        }}
      />
      {caption && (
        <div
          style={{
            opacity,
            fontFamily: "-apple-system, 'SF Pro Text', 'Inter', sans-serif",
            fontWeight: 600,
            fontSize: 32,
            color: "rgba(255,255,255,0.85)",
            letterSpacing: 0.5,
          }}
        >
          <Typewriter text={caption} startFrame={14} />
        </div>
      )}
    </AbsoluteFill>
  );
};

/**
 * P0.A — Render a per-slide VisualPlan as a sequence of items.
 * Each item gets its own <Sequence> sized to its share of the slide's audio
 * duration. Items render in order with hard cuts between them (the inner
 * components handle their own spring/typewriter entrances so cuts feel alive).
 */
const VisualSequence: React.FC<{ plan: VisualPlan; slideDurationInFrames: number; fps: number }> = ({
  plan,
  slideDurationInFrames,
  fps,
}) => {
  if (!plan.items || plan.items.length === 0) return null;

  // Convert each item's durationSec to frames; renormalize to fit the slide
  const totalRequestedSec = plan.items.reduce((s, it) => s + Math.max(0.1, it.durationSec), 0);
  const totalAvailFrames = slideDurationInFrames;
  const scale = totalRequestedSec > 0 ? totalAvailFrames / (totalRequestedSec * fps) : 1;

  let frameOffset = 0;
  const rendered: React.ReactNode[] = [];
  for (let i = 0; i < plan.items.length; i++) {
    const item = plan.items[i];
    const wantedFrames = Math.max(20, Math.round(item.durationSec * fps * scale));
    // Clamp the last item to fill any remainder
    const remainingFrames = totalAvailFrames - frameOffset;
    const itemFrames = i === plan.items.length - 1 ? remainingFrames : Math.min(wantedFrames, remainingFrames);
    if (itemFrames <= 0) break;

    rendered.push(
      <Sequence key={i} from={frameOffset} durationInFrames={itemFrames}>
        <VisualItemRenderer item={item} durationInFrames={itemFrames} index={i} />
      </Sequence>,
    );
    frameOffset += itemFrames;
  }
  return <>{rendered}</>;
};

export const NewsVideo: React.FC<VideoProps> = ({
  slides,
  audioPath,
  words,
  brollPaths,
  visualPlans,
  musicPath,
  musicVolume = 0.15,
  fps = 30,
}) => {
  // Calculate frame offsets for each slide
  let frameOffset = 0;

  // Build a slideIndex → VisualPlan map for O(1) lookup
  const planByIndex = new Map<number, VisualPlan>();
  if (visualPlans) {
    for (const p of visualPlans) planByIndex.set(p.slideIndex, p);
  }

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* Narration audio — must be in public/ for Remotion */}
      {audioPath && <Audio src={staticFile(audioPath)} volume={1} />}

      {/* Background music */}
      {musicPath && <Audio src={staticFile(musicPath)} volume={musicVolume} loop />}

      {/* Slides with fade transitions.
          P0.A: render priority per slide:
            1. visualPlans[i] → render the A-roll/B-roll sequence (NEW)
            2. brollPaths[i]  → render the legacy single full-bleed Pexels clip
            3. fallback       → branded slide component (Intro/Story/Outro) */}
      {slides.map((slide, i) => {
        const from = frameOffset;
        frameOffset += slide.durationFrames;
        const plan = planByIndex.get(i);
        const hasPlan = plan && plan.items && plan.items.length > 0;
        const brollPath = brollPaths?.[i];
        return (
          <Sequence key={i} from={from} durationInFrames={slide.durationFrames}>
            <FadeSlide durationInFrames={slide.durationFrames}>
              {hasPlan ? (
                <VisualSequence
                  plan={plan as VisualPlan}
                  slideDurationInFrames={slide.durationFrames}
                  fps={fps}
                />
              ) : brollPath ? (
                <BrollSlide brollPath={brollPath} title={slide.title} />
              ) : (
                renderSlide(slide, i, slides.length)
              )}
            </FadeSlide>
          </Sequence>
        );
      })}

      {/* Word-level captions overlay (works for both slide modes) */}
      {words.length > 0 && <WordCaption words={words} />}
    </AbsoluteFill>
  );
};
