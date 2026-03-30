export type SpeakerNotesStep = "config" | "generate" | "preview";

export type SpeechTone = "calm" | "energetic" | "professional";

export interface SlideScriptItem {
  page: number;
  title: string;
  script: string;
  actionHint?: string;
}

export interface SourcePptSlidePreview {
  page: number;
  title: string;
  summary?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  slideId?: string;
}
