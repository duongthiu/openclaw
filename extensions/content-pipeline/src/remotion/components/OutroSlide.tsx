import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { theme, gradientTextStyle } from "../theme";
import { Background } from "./Background";

interface Props {
  title: string;
  bullets: string[];
  slideIndex: number;
  totalSlides: number;
}

export const OutroSlide: React.FC<Props> = ({ title, bullets, slideIndex, totalSlides }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title: spring scale
  const titleScale = spring({
    fps,
    frame: frame - 5,
    config: { damping: 10, mass: 0.8, stiffness: 100 },
  });
  const titleOpacity = interpolate(frame, [3, 15], [0, 1], { extrapolateRight: "clamp" });

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
        {/* Title */}
        <h1
          style={{
            fontSize: theme.size.heroTitle,
            fontFamily: theme.font.heading,
            fontWeight: 700,
            letterSpacing: -2,
            margin: 0,
            marginBottom: 48,
            transform: `scale(${titleScale})`,
            opacity: titleOpacity,
            ...gradientTextStyle,
          }}
        >
          {title}
        </h1>

        {/* CTA bullets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center" }}>
          {bullets.map((bullet, i) => {
            const delay = 20 + i * 10;
            const opacity = interpolate(frame, [delay, delay + 12], [0, 1], {
              extrapolateRight: "clamp",
            });
            const y = interpolate(frame, [delay, delay + 12], [15, 0], {
              extrapolateRight: "clamp",
            });

            return (
              <div
                key={i}
                style={{
                  fontSize: theme.size.subtitle,
                  fontFamily: theme.font.body,
                  color: theme.text.secondary,
                  opacity,
                  transform: `translateY(${y}px)`,
                }}
              >
                {bullet}
              </div>
            );
          })}
        </div>

        {/* Subscribe CTA */}
        <div
          style={{
            marginTop: 60,
            opacity: interpolate(frame, [50, 65], [0, 1], { extrapolateRight: "clamp" }),
            fontSize: theme.size.body,
            color: theme.text.accent,
            fontWeight: 600,
          }}
        >
          Subscribe for daily tech updates
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
