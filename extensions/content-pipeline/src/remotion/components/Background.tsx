import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { theme } from "../theme";

/** Animated gradient background with subtle Ken Burns zoom */
export const Background: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Subtle zoom: 1.0 → 1.05 over slide duration
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.05], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      {/* Gradient background with zoom */}
      <AbsoluteFill
        style={{
          background: theme.bg.gradient,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      />

      {/* Subtle noise/grain overlay */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, rgba(120, 119, 198, 0.08) 0%, transparent 50%)",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 80% 70%, rgba(0, 122, 255, 0.05) 0%, transparent 50%)",
        }}
      />

      {/* Content */}
      {children}
    </AbsoluteFill>
  );
};
