export interface SlideData {
  slideType: "intro" | "story" | "outro" | "title" | "step" | "code";
  title: string;
  body: string | string[];
  speakerNotes: string;
  sourceUrl?: string;
  code?: string;
  language?: string;
  durationFrames: number;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface VideoProps {
  slides: SlideData[];
  audioPath: string;
  words: WordTimestamp[];
  musicPath?: string;
  musicVolume?: number;
  fps?: number;
}
