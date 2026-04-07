import React from "react";
import { Composition } from "remotion";
import type { VideoProps } from "./types";
import { NewsVideo } from "./Video";

export const RemotionRoot: React.FC = () => {
  // Default props for preview/development
  const defaultProps: VideoProps = {
    slides: [
      {
        slideType: "intro",
        title: "Today in Tech",
        body: ["AI breakthroughs this week", "New open source tools", "Industry news roundup"],
        speakerNotes: "Welcome to today's tech news!",
        durationFrames: 150,
      },
      {
        slideType: "story",
        title: "AI Gets Smarter",
        body: [
          "New models released",
          "Open source momentum grows",
          "Enterprise adoption accelerating",
        ],
        speakerNotes: "AI continues to evolve rapidly.",
        sourceUrl: "https://news.ycombinator.com",
        durationFrames: 180,
      },
      {
        slideType: "outro",
        title: "That's a Wrap!",
        body: ["Like and subscribe", "Share with friends", "See you tomorrow"],
        speakerNotes: "Thanks for watching!",
        durationFrames: 120,
      },
    ],
    audioPath: "",
    words: [],
  };

  const totalFrames = defaultProps.slides.reduce((sum, s) => sum + s.durationFrames, 0);

  return (
    <>
      <Composition
        id="NewsVideo"
        component={NewsVideo}
        durationInFrames={totalFrames}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultProps}
      />
    </>
  );
};
