export interface SessionSwitcherItem {
  sessionId: string;
  title: string;
  updatedAt: string;
  runSummary?: string;
  artifactId?: string | null;
}
