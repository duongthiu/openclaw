import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

interface KenBurnsImageProps {
  /** Path relative to Remotion's public/ directory (passed via staticFile) */
  src: string;
  /** Total duration of the visible window in frames (used for scale interpolation) */
  durationInFrames: number;
  /** Direction the image drifts (default "in" = slow zoom-in toward center) */
  variant?: "in" | "out" | "left" | "right";
  /** Object-fit mode (default "cover" — fills frame) */
  fit?: "cover" | "contain";
  /** Optional caption rendered as a small label */
  caption?: string;
}

/**
 * Wraps an image in a constant-motion frame.
 * Scale slowly grows from 1.00 → 1.06 (or shrinks for "out") and the image
 * drifts gently in the chosen direction. Designed to make every still photo
 * feel alive — no static images anywhere in the pipeline.
 *
 * Implementation: pure CSS transform interpolated against `useCurrentFrame()`,
 * so it works inside any Remotion <Sequence> without per-frame React work.
 */
export const KenBurnsImage: React.FC<KenBurnsImageProps> = ({
  src,
  durationInFrames,
  variant = "in",
  fit = "cover",
  caption,
}) => {
  const frame = useCurrentFrame();
  const safeDur = Math.max(1, durationInFrames);

  // Scale envelope
  const startScale = variant === "out" ? 1.06 : 1.0;
  const endScale = variant === "out" ? 1.0 : 1.06;
  const scale = interpolate(frame, [0, safeDur], [startScale, endScale], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Drift envelope (small, ~3% of frame width)
  let translateX = 0;
  let translateY = 0;
  if (variant === "left") translateX = interpolate(frame, [0, safeDur], [40, -40]);
  else if (variant === "right") translateX = interpolate(frame, [0, safeDur], [-40, 40]);
  else translateY = interpolate(frame, [0, safeDur], [-15, 15]);

  // Resolve src: support both staticFile-relative paths and absolute file:// URLs
  const resolvedSrc = src.startsWith("http") || src.startsWith("file:") ? src : staticFile(src);

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#000" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transformOrigin: "center",
        }}
      >
        <Img
          src={resolvedSrc}
          style={{
            width: "100%",
            height: "100%",
            objectFit: fit,
            display: "block",
          }}
        />
      </div>
      {caption && (
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: 24,
            background: "rgba(0,0,0,0.55)",
            color: "rgba(255,255,255,0.85)",
            padding: "6px 14px",
            borderRadius: 8,
            fontSize: 18,
            fontFamily:
              "-apple-system, 'SF Pro Text', 'Inter', sans-serif",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          {caption}
        </div>
      )}
    </AbsoluteFill>
  );
};
