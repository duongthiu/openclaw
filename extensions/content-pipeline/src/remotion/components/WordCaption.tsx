import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import type { WordTimestamp } from "../types";

interface Props {
  words: WordTimestamp[];
}

/** Karaoke-style word highlighting — current word turns blue */
export const WordCaption: React.FC<Props> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  // Find the current sentence window (show ~8-10 words around current)
  const currentWordIdx = words.findIndex((w) => currentTime >= w.start && currentTime <= w.end);

  if (currentWordIdx === -1 && currentTime > (words[words.length - 1]?.end ?? 0)) {
    return null; // Past all words
  }

  // Show a window of words around the current position
  const windowStart = Math.max(0, currentWordIdx - 4);
  const windowEnd = Math.min(words.length, currentWordIdx + 8);
  const visibleWords = words.slice(windowStart, windowEnd);

  if (visibleWords.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        padding: "0 120px",
      }}
    >
      <div
        style={{
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(20px)",
          borderRadius: 16,
          padding: "16px 32px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "6px 8px",
          maxWidth: 1200,
        }}
      >
        {visibleWords.map((word, i) => {
          const globalIdx = windowStart + i;
          const isCurrent = globalIdx === currentWordIdx;
          const isPast = currentTime > word.end;

          return (
            <span
              key={`${word.word}-${globalIdx}`}
              style={{
                fontSize: theme.size.caption,
                fontFamily: theme.font.body,
                fontWeight: isCurrent ? 700 : 500,
                color: isCurrent
                  ? theme.text.accent
                  : isPast
                    ? theme.text.primary
                    : theme.text.secondary,
                transition: "color 0.1s",
                transform: isCurrent ? "scale(1.1)" : "scale(1)",
                display: "inline-block",
              }}
            >
              {word.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
