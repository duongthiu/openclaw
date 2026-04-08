export interface SlideData {
  slideType: "intro" | "story" | "outro" | "title" | "step" | "code";
  slideRole?: string;
  title: string;
  body: string | string[];
  speakerNotes: string;
  sourceUrl?: string;
  code?: string;
  language?: string;
  durationFrames: number;
  keyStats?: string[];
  keyQuotes?: Array<{ text: string; attribution?: string }>;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

// P0.A — Visual plan (sequence of A-roll + B-roll items per slide)
export type VisualRole = "a-roll" | "b-roll";
export type VisualKind =
  | "title-card"
  | "stat-card"
  | "quote-card"
  | "article-scroll"
  | "timeline-card"
  | "wikipedia"
  | "logo"
  | "pexels-photo"
  | "pexels-video"
  | "screenshot";
export interface VisualItem {
  role: VisualRole;
  kind: VisualKind;
  path?: string;
  text?: string;
  subtext?: string;
  durationSec: number;
  caption?: string;
}
export interface VisualPlan {
  slideIndex: number;
  items: VisualItem[];
}

export interface VideoProps {
  slides: SlideData[];
  audioPath: string;
  words: WordTimestamp[];
  /**
   * Per-slide background MP4 paths (relative to Remotion's public/ dir).
   * Legacy: one full-bleed clip per slide, used by the original Pexels engine.
   * Superseded by `visualPlans` when both are provided.
   */
  brollPaths?: string[];
  /**
   * P0.A — Per-slide visual sequence (A-roll anchor + B-roll cutaways).
   * When present for a slide, NewsVideo renders the items in order,
   * each with its own component (TitleCard / StatCard / KenBurnsImage / etc.)
   * sized to its `durationSec` share of the slide's total duration.
   * Falls back to brollPaths[i] then to the branded slide component.
   */
  visualPlans?: VisualPlan[];
  musicPath?: string;
  musicVolume?: number;
  fps?: number;
}
