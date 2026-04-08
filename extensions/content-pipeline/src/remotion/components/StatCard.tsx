import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { glassCardStyle, gradientTextStyle, theme } from "../theme";
import { Typewriter } from "./Typewriter";

interface StatCardProps {
  /** The headline number/stat (e.g. "1.200", "$50M", "78%") */
  text: string;
  /** Label/context line beneath the number (e.g. "router bị xâm nhập") */
  subtext?: string;
}

/**
 * A-roll for "Key Details" / "Why It Matters" slides.
 *
 * Renders ONE giant statistic typewritten in, with an explanatory label
 * fading + sliding up beneath it. Background is a slowly parallaxing glow.
 * The number is the visual anchor — viewer's eye locks on it.
 */
export const StatCard: React.FC<StatCardProps> = ({ text, subtext }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Spring scale-in for the wrapper
  const scale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.5 },
    from: 0.85,
    to: 1,
  });

  // Number characters take ~30 chars/sec — usually short
  const numDoneFrame = Math.ceil(((text?.length ?? 0) / 30) * fps) + 4;

  // Subtle parallax background glow
  const glowX = interpolate(frame, [0, 400], [-100, 100]);

  return (
    <AbsoluteFill
      style={{
        background: theme.bg.gradient,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing.slidePadding,
      }}
    >
      {/* Parallax glow */}
      <div
        style={{
          position: "absolute",
          width: 1200,
          height: 1200,
          left: `calc(50% - 600px + ${glowX}px)`,
          top: "calc(50% - 600px)",
          background:
            "radial-gradient(circle, rgba(48,209,88,0.16) 0%, rgba(48,209,88,0) 55%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          ...glassCardStyle,
          transform: `scale(${scale})`,
          textAlign: "center",
          minWidth: 700,
          maxWidth: "80%",
          padding: "80px 96px",
        }}
      >
        {/* The big number */}
        <div
          style={{
            fontFamily: theme.font.heading,
            fontWeight: 900,
            fontSize: 220,
            lineHeight: 1,
            letterSpacing: -6,
            ...gradientTextStyle,
            background:
              "linear-gradient(135deg, #ffffff 0%, #30d158 60%, #00c47e 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          <Typewriter text={text} charsPerSecond={20} cursorColor="#30d158" />
        </div>

        {/* Label */}
        {subtext && (
          <div
            style={{
              marginTop: 36,
              fontFamily: theme.font.body,
              fontWeight: 500,
              fontSize: theme.size.subtitle,
              color: theme.text.primary,
              lineHeight: 1.3,
              opacity: interpolate(frame, [numDoneFrame, numDoneFrame + 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              transform: `translateY(${interpolate(frame, [numDoneFrame, numDoneFrame + 12], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
            }}
          >
            <Typewriter text={subtext} startFrame={numDoneFrame} cursorColor="#30d158" />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
