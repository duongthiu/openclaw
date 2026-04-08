import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { glassCardStyle, theme } from "../theme";
import { Typewriter } from "./Typewriter";

interface QuoteCardProps {
  /** The quote text (typewritten) */
  text: string;
  /** Attribution shown after the quote (e.g. "MIT Tech Review", "Sam Altman") */
  subtext?: string;
}

/**
 * A-roll for "Analysis" slides.
 *
 * Big serif quote with opening curly mark, typewritten text reveal,
 * attribution slides up after the quote completes. Background is a
 * darker variant with a subtle accent glow on the left side.
 */
export const QuoteCard: React.FC<QuoteCardProps> = ({ text, subtext }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 13, stiffness: 95, mass: 0.55 },
    from: 0.9,
    to: 1,
  });

  // Quote takes a while to type at 35 cps for typical 60-150 char quotes
  const quoteDoneFrame = Math.ceil(((text?.length ?? 0) / 35) * fps) + 6;

  // Slow drifting glow on the left
  const glowY = interpolate(frame, [0, 600], [-80, 80]);

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
      <div
        style={{
          position: "absolute",
          width: 700,
          height: 700,
          left: -200,
          top: `calc(50% - 350px + ${glowY}px)`,
          background:
            "radial-gradient(circle, rgba(175,82,222,0.18) 0%, rgba(175,82,222,0) 60%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          ...glassCardStyle,
          transform: `scale(${scale})`,
          maxWidth: "78%",
          padding: "80px 96px",
          position: "relative",
        }}
      >
        {/* Big opening quote mark */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 30,
            fontFamily: "Georgia, serif",
            fontSize: 220,
            color: "rgba(175,82,222,0.35)",
            lineHeight: 1,
            pointerEvents: "none",
          }}
        >
          “
        </div>

        {/* Quote text */}
        <div
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 56,
            lineHeight: 1.35,
            color: theme.text.primary,
            position: "relative",
            zIndex: 1,
          }}
        >
          <Typewriter text={text} cursorColor="#af52de" />
        </div>

        {/* Attribution */}
        {subtext && (
          <div
            style={{
              marginTop: 40,
              fontFamily: theme.font.body,
              fontWeight: 600,
              fontSize: theme.size.body,
              color: "#af52de",
              opacity: interpolate(frame, [quoteDoneFrame, quoteDoneFrame + 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              transform: `translateX(${interpolate(frame, [quoteDoneFrame, quoteDoneFrame + 14], [-16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
            }}
          >
            — <Typewriter text={subtext} startFrame={quoteDoneFrame} cursorColor="#af52de" />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
