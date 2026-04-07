import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { theme, gradientTextStyle } from "../theme";
import { Background } from "./Background";

interface Props {
  title: string;
  bullets: string[];
  date: string;
  slideIndex: number;
  totalSlides: number;
}

export const IntroSlide: React.FC<Props> = ({ title, bullets, date, slideIndex, totalSlides }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Date badge: fade in
  const dateOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Title: spring scale
  const titleScale = spring({
    fps,
    frame: frame - 10,
    config: { damping: 12, mass: 0.8, stiffness: 120 },
  });
  const titleOpacity = interpolate(frame, [8, 20], [0, 1], { extrapolateRight: "clamp" });

  return (
    <Background>
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: theme.spacing.slidePadding,
          textAlign: "center",
        }}
      >
        {/* Date */}
        <div
          style={{
            fontSize: theme.size.caption,
            color: theme.text.secondary,
            opacity: dateOpacity,
            marginBottom: 32,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {date}
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: theme.size.heroTitle,
            fontFamily: theme.font.heading,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.1,
            margin: 0,
            marginBottom: 48,
            transform: `scale(${titleScale})`,
            opacity: titleOpacity,
            ...gradientTextStyle,
          }}
        >
          {title}
        </h1>

        {/* Preview bullets */}
        <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.bulletGap }}>
          {bullets.map((bullet, i) => {
            const bulletDelay = 30 + i * 12;
            const bulletOpacity = interpolate(frame, [bulletDelay, bulletDelay + 15], [0, 1], {
              extrapolateRight: "clamp",
            });
            const bulletY = interpolate(frame, [bulletDelay, bulletDelay + 15], [20, 0], {
              extrapolateRight: "clamp",
            });

            return (
              <div
                key={i}
                style={{
                  fontSize: theme.size.bullet,
                  fontFamily: theme.font.body,
                  color: theme.text.secondary,
                  opacity: bulletOpacity,
                  transform: `translateY(${bulletY}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: theme.text.accent,
                    flexShrink: 0,
                  }}
                />
                {bullet}
              </div>
            );
          })}
        </div>

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
