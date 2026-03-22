export type SpeakerNotesStep = "config" | "generate" | "preview";

export type SpeechTone = "calm" | "energetic" | "professional";

export interface SlideScriptItem {
  page: number;
  title: string;
  script: string;
  actionHint?: string;
}
