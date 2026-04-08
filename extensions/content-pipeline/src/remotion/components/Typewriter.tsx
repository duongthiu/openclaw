import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

interface TypewriterProps {
  /** Text to reveal char-by-char */
  text: string;
  /** Frame to start the reveal at (default 0). Useful for staggered entrances. */
  startFrame?: number;
  /** Reveal speed in characters per second (default 35) */
  charsPerSecond?: number;
  /** Show a blinking cursor at the active position (default true) */
  cursor?: boolean;
  /** Color of the cursor block (default white) */
  cursorColor?: string;
  /** Style applied to the wrapping <span> */
  style?: React.CSSProperties;
  /** Optional className for additional styling */
  className?: string;
}

/**
 * Reusable typewriter text reveal for Remotion.
 *
 * Slices the visible portion of `text` based on the current frame, with
 * an optional blinking cursor at the trailing edge. Designed to be the
 * default text-reveal animation across every A-roll component (TitleCard,
 * StatCard, QuoteCard, etc.) — no plain fade-ins anywhere.
 *
 * Once the full text is revealed the cursor keeps blinking subtly.
 */
export const Typewriter: React.FC<TypewriterProps> = ({
  text,
  startFrame = 0,
  charsPerSecond = 35,
  cursor = true,
  cursorColor = "#ffffff",
  style,
  className,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const safeText = text ?? "";

  const elapsedFrames = Math.max(0, frame - startFrame);
  const charsPerFrame = charsPerSecond / fps;
  const visibleChars = Math.floor(elapsedFrames * charsPerFrame);
  const visible = safeText.slice(0, Math.min(visibleChars, safeText.length));
  const isComplete = visibleChars >= safeText.length;

  // Cursor blink: 0.5 Hz on/off after reveal completes; always solid during reveal
  const cursorVisible = cursor
    ? isComplete
      ? Math.floor((frame / fps) * 2) % 2 === 0
      : true
    : false;

  return (
    <span style={style} className={className}>
      {visible}
      {cursorVisible && (
        <span
          style={{
            display: "inline-block",
            width: "0.55em",
            height: "1em",
            marginLeft: "0.05em",
            backgroundColor: cursorColor,
            verticalAlign: "text-bottom",
            opacity: 0.85,
          }}
        />
      )}
    </span>
  );
};
