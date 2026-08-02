import type { ArtifactCreationCapabilities } from "@/features/artifacts/task-agent/creation-capabilities";
import type { ArtifactCreationRequest } from "./artifact-create-tool-contract";

type ArtifactCreationExample = {
  input: {
    briefContext: "latest" | "continue_previous_artifact_request";
    requests: ArtifactCreationRequest[];
  };
};

export function artifactCreationInputExamples(
  capabilities: ArtifactCreationCapabilities,
): ArtifactCreationExample[] {
  return [
    {
      input: {
        briefContext: "latest",
        requests: [
          {
            brief: {
              objective: "Explain the requested subject as a teaching document",
              requirements: [],
              sections: [],
              subject: "The subject explicitly requested by the user",
            },
            groundingRefs: [],
            kind: "teaching_document",
            title: "Requested teaching document",
          },
        ],
      },
    },
    ...(capabilities.has("presentation")
      ? [
          {
            input: {
              briefContext: "latest" as const,
              requests: [
                {
                  brief: {
                    objective: "Present the requested subject as a slide deck",
                    requirements: [],
                    sections: [],
                    slideCount: null,
                    subject: "The subject explicitly requested by the user",
                  },
                  groundingRefs: [],
                  kind: "presentation" as const,
                  title: "Requested presentation",
                },
              ],
            },
          },
        ]
      : []),
    ...(capabilities.has("animation")
      ? [
          {
            input: {
              briefContext: "latest" as const,
              requests: [
                {
                  brief: {
                    durationSeconds: null,
                    objective: "Explain the requested subject as a silent knowledge animation",
                    requirements: [],
                    scenes: [],
                    subject: "The subject explicitly requested by the user",
                  },
                  groundingRefs: [],
                  kind: "animation" as const,
                  title: "Requested knowledge animation",
                },
              ],
            },
          },
        ]
      : []),
    {
      input: {
        briefContext: "latest",
        requests: [
          {
            brief: {
              objective: "Practice the requested subject through Flap Revival",
              questionPlan: {
                questionCount: 12,
                singleChoice: 8,
                trueFalse: 4,
              },
              requirements: [],
              skin: "city_sunset",
              subject: "The subject explicitly requested by the user",
            },
            groundingRefs: [],
            kind: "game",
            title: "Requested knowledge challenge",
          },
        ],
      },
    },
    {
      input: {
        briefContext: "latest",
        requests: [
          {
            brief: {
              branches: [],
              objective: "Organize the requested subject as a mind map",
              requirements: [],
              subject: "The subject explicitly requested by the user",
            },
            groundingRefs: [],
            kind: "mind_map",
            title: "Requested mind map",
          },
        ],
      },
    },
    {
      input: {
        briefContext: "latest",
        requests: [
          {
            brief: {
              objective: "Assess the requested subject",
              questionPlan: {
                multipleChoice: 2,
                questionCount: 8,
                singleChoice: 4,
                trueFalse: 2,
              },
              requirements: [],
              subject: "The subject explicitly requested by the user",
            },
            groundingRefs: [],
            kind: "quiz",
            title: "Requested quiz",
          },
        ],
      },
    },
    {
      input: {
        briefContext: "latest",
        requests: [
          {
            brief: {
              objective: "Explain the requested subject",
              requirements: [],
              sections: [],
              subject: "The shared subject explicitly requested by the user",
            },
            groundingRefs: [],
            kind: "teaching_document",
            title: "Requested teaching document",
          },
          {
            brief: {
              branches: [],
              objective: "Organize the requested subject visually",
              requirements: [],
              subject: "The shared subject explicitly requested by the user",
            },
            groundingRefs: [],
            kind: "mind_map",
            title: "Requested mind map",
          },
        ],
      },
    },
  ];
}
