import {
  groupArtifactsByTool,
  mapArtifactToToolType,
} from "@/lib/project-space";
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

  it("maps courseware_ppt studio-card artifacts to ppt", () => {
    const artifact: Artifact = {
      ...baseArtifact,
      id: "art_4",
      type: "summary",
      metadata: { tool_type: "studio_card:courseware_ppt" },
    };
    expect(mapArtifactToToolType(artifact)).toBe("ppt");
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

  it("prefers metadata.title over run_title and name for artifact history title", () => {
    const artifacts: Artifact[] = [
      {
        ...baseArtifact,
        id: "art_run_title",
        type: "pptx",
        metadata: {
          run_title: "计算机网络",
          run_title_source: "manual",
          title: "PPTX · 12345678",
          name: "旧名称",
        },
      },
    ];

    const grouped = groupArtifactsByTool(artifacts);
    expect(grouped.ppt[0]?.title).toBe("PPTX · 12345678");
  });

  it("uses generic fallback title without exposing artifact id", () => {
    const artifacts: Artifact[] = [
      {
        ...baseArtifact,
        id: "art_no_title",
        type: "mindmap",
      },
    ];

    const grouped = groupArtifactsByTool(artifacts);
    expect(grouped.mindmap[0]?.title).toBe("Mindmap 生成记录");
  });
});
