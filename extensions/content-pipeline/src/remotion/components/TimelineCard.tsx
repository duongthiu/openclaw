import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { glassCardStyle, gradientTextStyle, theme } from "../theme";
import { Typewriter } from "./Typewriter";

interface TimelineCardProps {
  /** Slide title (typewritten) */
  text: string;
  /** Pipe-delimited list of timeline beats: "Q1 2024 launch|Q3 2024 leak|Today: lawsuit" */
  subtext?: string;
}

/**
 * A-roll for "Background" slides.
 *
 * Renders a horizontal timeline of 2-4 beats. Each beat consists of a dot
 * + a label that springs in sequentially. The slide title is typewritten
 * at the top. Background is the standard gradient with a slow accent glow.
 */
export const TimelineCard: React.FC<TimelineCardProps> = ({ text, subtext }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const beats = (subtext ?? "")
    .split(/[|\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  // Title types in first
  const titleScale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.6 },
    from: 0.92,
    to: 1,
  });

  const titleDoneFrame = Math.ceil(((text?.length ?? 0) / 35) * fps) + 6;

  return (
    <AbsoluteFill
      style={{
        background: theme.bg.gradient,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing.slidePadding,
      }}
    >
      {/* Slow drifting accent */}
      <div
        style={{
          position: "absolute",
          width: 1000,
          height: 1000,
          top: -200,
          right: -300,
          background:
            "radial-gradient(circle, rgba(0,122,255,0.18) 0%, rgba(0,122,255,0) 60%)",
          filter: "blur(50px)",
          pointerEvents: "none",
        }}
      />

      {/* Title */}
      <div
        style={{
          fontFamily: theme.font.heading,
          fontWeight: 800,
          fontSize: theme.size.title,
          lineHeight: 1.1,
          letterSpacing: -1.5,
          textAlign: "center",
          maxWidth: "82%",
          transform: `scale(${titleScale})`,
          ...gradientTextStyle,
          marginBottom: 80,
        }}
      >
        <Typewriter text={text} cursorColor="#8ab4f8" />
      </div>

      {/* Timeline */}
      {beats.length > 0 && (
        <div
          style={{
            ...glassCardStyle,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 32,
            padding: "60px 80px",
            width: "82%",
            maxWidth: 1500,
            position: "relative",
          }}
        >
          {/* Connecting line */}
          <div
            style={{
              position: "absolute",
              left: 80,
              right: 80,
              top: "calc(50% - 1px)",
              height: 2,
              background:
                "linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(0,122,255,0.5) 50%, rgba(255,255,255,0.05) 100%)",
            }}
          />

          {beats.map((beat, i) => {
            // Each beat springs in after the previous one
            const beatStartFrame = titleDoneFrame + i * 14;
            const beatScale = spring({
              frame: frame - beatStartFrame,
              fps,
              config: { damping: 12, stiffness: 110, mass: 0.5 },
              from: 0,
              to: 1,
            });
            const beatOpacity = interpolate(
              frame,
              [beatStartFrame, beatStartFrame + 6],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  position: "relative",
                  zIndex: 1,
                  opacity: beatOpacity,
                  transform: `scale(${beatScale})`,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: "#007AFF",
                    border: "4px solid rgba(0,122,255,0.25)",
                    marginBottom: 24,
                    boxShadow: "0 0 24px rgba(0,122,255,0.6)",
                  }}
                />
                <div
                  style={{
                    fontFamily: theme.font.body,
                    fontWeight: 600,
                    fontSize: 26,
                    color: "white",
                    lineHeight: 1.3,
                  }}
                >
                  <Typewriter text={beat} startFrame={beatStartFrame + 4} cursorColor="#8ab4f8" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
