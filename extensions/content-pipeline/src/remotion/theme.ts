/** Apple Keynote-inspired design tokens */
export const theme = {
  bg: {
    primary: "#000000",
    gradient: "linear-gradient(145deg, #000000 0%, #0a0a2e 40%, #1a1a3e 70%, #0f0f2a 100%)",
    card: "rgba(255, 255, 255, 0.06)",
    cardBorder: "rgba(255, 255, 255, 0.08)",
    code: "rgba(0, 0, 0, 0.5)",
  },
  text: {
    primary: "#ffffff",
    secondary: "rgba(255, 255, 255, 0.55)",
    muted: "rgba(255, 255, 255, 0.3)",
    accent: "#007AFF",
    accentPurple: "#AF52DE",
    accentGreen: "#30D158",
  },
  font: {
    heading: "-apple-system, 'SF Pro Display', 'Inter', 'Helvetica Neue', sans-serif",
    body: "-apple-system, 'SF Pro Text', 'Inter', sans-serif",
    code: "'SF Mono', 'JetBrains Mono', 'Fira Code', monospace",
  },
  size: {
    heroTitle: 80,
    title: 64,
    subtitle: 36,
    body: 32,
    bullet: 30,
    caption: 26,
    badge: 18,
    slideNum: 16,
  },
  spacing: {
    slidePadding: 120,
    cardPadding: 48,
    cardRadius: 24,
    bulletGap: 20,
  },
} as const;

/** Gradient text style (for headlines) */
export const gradientTextStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #ffffff 0%, #8ab4f8 60%, #c084fc 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

/** Frosted glass card style */
export const glassCardStyle: React.CSSProperties = {
  background: theme.bg.card,
  borderRadius: theme.spacing.cardRadius,
  padding: theme.spacing.cardPadding,
  border: `1px solid ${theme.bg.cardBorder}`,
  backdropFilter: "blur(40px)",
  WebkitBackdropFilter: "blur(40px)",
};

/** Source badge style */
export const badgeStyle: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.08)",
  padding: "8px 20px",
  borderRadius: 16,
  fontSize: theme.size.badge,
  color: theme.text.secondary,
  backdropFilter: "blur(20px)",
};
