export type SimulationStep = "config" | "generate" | "preview";

export type StudentProfile = "divergent_top" | "detail_oriented" | "confused_beginner";

export interface VirtualStudent {
  id: string;
  name: string;
  tag: string;
  profile: StudentProfile;
}

export interface SimulationQuestion {
  id: string;
  studentId: string;
  text: string;
  depth: "basic" | "medium" | "hard";
}
