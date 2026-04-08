import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { Typewriter } from "./Typewriter";

interface ArticleScrollProps {
  /** Path to the source-article screenshot (public/ relative or absolute) */
  src: string;
  /** Slide title overlay */
  title: string;
  /** Source hostname (e.g. "mit.edu", "techcrunch.com") */
  subtext?: string;
  /** Total visible duration in frames (used for scroll interpolation) */
  durationInFrames: number;
}

/**
 * A-roll for "What Happened" slides.
 *
 * Renders a source-article screenshot inside a fake browser chrome,
 * slowly scrolling vertically across the slide's duration. A typewriter
 * title chip slides in from the bottom-left over the screenshot. The
 * source hostname types in alongside.
 *
 * The screenshot is the AUTHORITATIVE visual — viewers literally see the
 * cited article. Combined with the typewriter title overlay, it reads as
 * "according to [source]: [title]".
 */
export const ArticleScroll: React.FC<ArticleScrollProps> = ({
  src,
  title,
  subtext,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const safeDur = Math.max(60, durationInFrames);

  // Browser chrome scale-in
  const chromeScale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.6 },
    from: 0.95,
    to: 1,
  });

  // Slow vertical scroll: image moves up over time so the viewer sees more of the article
  // Scroll progresses from 0 → -40% of image height across the slide
  const scrollY = interpolate(frame, [20, safeDur], [0, -38], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Title chip slides up from bottom after a small delay
  const chipDelay = 12;
  const chipY = interpolate(frame, [chipDelay, chipDelay + 18], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const chipOpacity = interpolate(frame, [chipDelay, chipDelay + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const resolvedSrc = src.startsWith("http") || src.startsWith("file:") ? src : staticFile(src);

  return (
    <AbsoluteFill
      style={{
        background: theme.bg.gradient,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
      }}
    >
      {/* Browser-chrome card */}
      <div
        style={{
          width: "82%",
          maxWidth: 1500,
          aspectRatio: "16 / 10",
          background: "#0a0a0a",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
          transform: `scale(${chromeScale})`,
          position: "relative",
        }}
      >
        {/* Browser top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "16px 22px",
            background: "#1a1a1a",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <span style={{ width: 14, height: 14, borderRadius: 7, background: "#ff5f56" }} />
          <span style={{ width: 14, height: 14, borderRadius: 7, background: "#ffbd2e" }} />
          <span style={{ width: 14, height: 14, borderRadius: 7, background: "#27c93f" }} />
          <div
            style={{
              flex: 1,
              marginLeft: 24,
              padding: "8px 20px",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 8,
              fontFamily: theme.font.code,
              fontSize: 18,
              color: "rgba(255,255,255,0.55)",
              maxWidth: 600,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {subtext ? `https://${subtext}` : "https://"}
          </div>
        </div>

        {/* Scrolling article body */}
        <div style={{ position: "absolute", inset: "60px 0 0 0", overflow: "hidden" }}>
          <div
            style={{
              transform: `translateY(${scrollY}%)`,
              width: "100%",
            }}
          >
            <Img
              src={resolvedSrc}
              style={{
                width: "100%",
                display: "block",
              }}
            />
          </div>
        </div>

        {/* Title chip overlay */}
        <div
          style={{
            position: "absolute",
            left: 32,
            bottom: 32,
            padding: "20px 32px",
            background: "rgba(0,0,0,0.78)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)",
            maxWidth: "calc(100% - 64px)",
            opacity: chipOpacity,
            transform: `translateY(${chipY}px)`,
          }}
        >
          {subtext && (
            <div
              style={{
                fontFamily: theme.font.code,
                fontSize: 18,
                color: "#8ab4f8",
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              <Typewriter text={subtext} startFrame={chipDelay} cursorColor="#8ab4f8" />
            </div>
          )}
          <div
            style={{
              fontFamily: theme.font.heading,
              fontWeight: 800,
              fontSize: 44,
              lineHeight: 1.15,
              color: "white",
              textShadow: "0 2px 12px rgba(0,0,0,0.5)",
            }}
          >
            <Typewriter text={title} startFrame={chipDelay + 8} cursorColor="white" />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
