import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { theme, gradientTextStyle, glassCardStyle, badgeStyle } from "../theme";
import { Background } from "./Background";

interface Props {
  title: string;
  bullets: string[];
  source?: string;
  slideIndex: number;
  totalSlides: number;
}

export const StorySlide: React.FC<Props> = ({
  title,
  bullets,
  source,
  slideIndex,
  totalSlides,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title: spring from left
  const titleSpring = spring({
    fps,
    frame: frame - 5,
    config: { damping: 14, mass: 0.6, stiffness: 100 },
  });
  const titleX = interpolate(titleSpring, [0, 1], [-60, 0]);
  const titleOpacity = interpolate(frame, [3, 18], [0, 1], { extrapolateRight: "clamp" });

  // Card: fade up
  const cardOpacity = interpolate(frame, [15, 30], [0, 1], { extrapolateRight: "clamp" });
  const cardY = interpolate(frame, [15, 30], [30, 0], { extrapolateRight: "clamp" });

  // Source badge: fade in last
  const badgeOpacity = interpolate(frame, [40, 55], [0, 1], { extrapolateRight: "clamp" });

  return (
    <Background>
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: theme.spacing.slidePadding,
        }}
      >
        {/* Headline */}
        <h1
          style={{
            fontSize: theme.size.title,
            fontFamily: theme.font.heading,
            fontWeight: 700,
            letterSpacing: -1.5,
            lineHeight: 1.15,
            margin: 0,
            marginBottom: 40,
            transform: `translateX(${titleX}px)`,
            opacity: titleOpacity,
            ...gradientTextStyle,
          }}
        >
          {title}
        </h1>

        {/* Glass card with bullets */}
        <div
          style={{
            ...glassCardStyle,
            opacity: cardOpacity,
            transform: `translateY(${cardY}px)`,
            maxWidth: 1200,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {bullets.map((bullet, i) => {
              const bulletDelay = 25 + i * 10;
              const bulletOpacity = interpolate(frame, [bulletDelay, bulletDelay + 12], [0, 1], {
                extrapolateRight: "clamp",
              });

              return (
                <div
                  key={i}
                  style={{
                    fontSize: theme.size.bullet,
                    fontFamily: theme.font.body,
                    color: theme.text.primary,
                    opacity: bulletOpacity,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 16,
                    lineHeight: 1.5,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: theme.text.accent,
                      flexShrink: 0,
                      marginTop: 12,
                    }}
                  />
                  {bullet}
                </div>
              );
            })}
          </div>
        </div>

        {/* Source badge */}
        {source && (
          <div
            style={{
              position: "absolute",
              bottom: 60,
              left: theme.spacing.slidePadding,
              opacity: badgeOpacity,
              ...badgeStyle,
            }}
          >
            {source}
          </div>
        )}

        {/* Slide number */}
        <div
          style={{
            position: "absolute",
            bottom: 60,
            right: theme.spacing.slidePadding,
            fontSize: theme.size.slideNum,
            color: theme.text.muted,
          }}
        >
          {slideIndex + 1} / {totalSlides}
        </div>
      </div>
    </Background>
  );
};
