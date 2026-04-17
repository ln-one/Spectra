export type SpeakerNotesStep = "config" | "generate" | "preview";

export type SpeechTone = "calm" | "energetic" | "professional";

export interface SlideScriptItem {
  page: number;
  title: string;
  slideId?: string;
  sections: SpeakerNotesSection[];
}

export interface SpeakerNotesParagraph {
  id: string;
  anchorId: string;
  text: string;
  role: "script" | "action_hint" | "transition" | string;
}

export interface SpeakerNotesSection {
  id: string;
  title: string;
  paragraphs: SpeakerNotesParagraph[];
}

export interface SourcePptSlidePreview {
  page: number;
  title: string;
  summary?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  slideId?: string;
}
