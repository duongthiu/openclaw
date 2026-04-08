import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { gradientTextStyle, theme } from "../theme";
import { Typewriter } from "./Typewriter";

interface TitleCardProps {
  /** Main title text (typewritten) */
  title: string;
  /** Optional subtitle / sub-text (also typewritten, after the title finishes) */
  subtitle?: string;
}

/**
 * A-roll for intro/outro slides.
 *
 * Big gradient title that types itself in, then a subtitle types after.
 * Spring scale-in for the wrapper card so the entrance feels alive.
 * Background is a subtle dark gradient with a slow drifting glow.
 */
export const TitleCard: React.FC<TitleCardProps> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Spring scale-in for the whole card (frames 0-25)
  const scale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 90, mass: 0.6 },
    from: 0.92,
    to: 1,
  });

  // Slow drifting backdrop glow — keeps background from feeling static
  const glowX = interpolate(frame, [0, 600], [0, 200]);
  const glowY = interpolate(frame, [0, 600], [0, -120]);

  // Approx character delay before subtitle starts (after title is fully typed)
  const titleDoneFrame = Math.ceil(((title?.length ?? 0) / 35) * fps) + 6;

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
      {/* Drifting accent glow */}
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          left: `calc(50% - 450px + ${glowX}px)`,
          top: `calc(50% - 450px + ${glowY}px)`,
          background:
            "radial-gradient(circle, rgba(138,180,248,0.18) 0%, rgba(138,180,248,0) 60%)",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "center",
          textAlign: "center",
          maxWidth: "82%",
        }}
      >
        <div
          style={{
            fontFamily: theme.font.heading,
            fontWeight: 800,
            fontSize: theme.size.heroTitle,
            lineHeight: 1.05,
            letterSpacing: -2,
            ...gradientTextStyle,
          }}
        >
          <Typewriter text={title} cursorColor="#8ab4f8" />
        </div>

        {subtitle && (
          <div
            style={{
              marginTop: 36,
              fontFamily: theme.font.body,
              fontWeight: 400,
              fontSize: theme.size.subtitle,
              color: theme.text.secondary,
              lineHeight: 1.35,
              whiteSpace: "pre-line",
            }}
          >
            <Typewriter text={subtitle} startFrame={titleDoneFrame} cursorColor="#8ab4f8" />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
