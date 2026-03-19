import {
  groupArtifactsByTool,
  mapArtifactToToolType,
} from "@/lib/project-space/artifact-history";
import type { components } from "@/lib/sdk/types";

type Artifact = components["schemas"]["Artifact"];

describe("artifact history mapper", () => {
  const baseArtifact = {
    project_id: "proj_1",
    visibility: "private",
    created_at: "2026-03-12T10:00:00.000Z",
    updated_at: "2026-03-12T10:00:00.000Z",
  } as const;

  it("maps artifact type to tool type", () => {
    const pptArtifact: Artifact = {
      ...baseArtifact,
      id: "art_1",
      type: "pptx",
    };
    const summaryArtifact: Artifact = {
      ...baseArtifact,
      id: "art_2",
      type: "summary",
    };
    expect(mapArtifactToToolType(pptArtifact)).toBe("ppt");
    expect(mapArtifactToToolType(summaryArtifact)).toBe("summary");
  });

  it("prefers metadata output_type when present", () => {
    const artifact: Artifact = {
      ...baseArtifact,
      id: "art_3",
      type: "docx",
      metadata: { output_type: "handout" },
    };
    expect(mapArtifactToToolType(artifact)).toBe("handout");
  });

  it("groups by session and sorts by created time desc", () => {
    const artifacts: Artifact[] = [
      {
        ...baseArtifact,
        id: "art_a",
        type: "summary",
        session_id: "sess_1",
        created_at: "2026-03-12T10:00:00.000Z",
      },
      {
        ...baseArtifact,
        id: "art_b",
        type: "summary",
        session_id: "sess_1",
        created_at: "2026-03-12T11:00:00.000Z",
      },
      {
        ...baseArtifact,
        id: "art_c",
        type: "pptx",
        session_id: "sess_2",
        created_at: "2026-03-12T12:00:00.000Z",
      },
    ];
    const grouped = groupArtifactsByTool(artifacts, "sess_1");
    expect(grouped.summary).toHaveLength(2);
    expect(grouped.summary[0].artifactId).toBe("art_b");
    expect(grouped.summary[1].artifactId).toBe("art_a");
    expect(grouped.ppt).toHaveLength(0);
  });
});
