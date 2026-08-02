import type {
  ArtifactCreationRequest,
  PreviousArtifactCreationPlan,
} from "./artifact-create-tool-contract";

export type ArtifactCreationBriefContext = "latest" | "continue_previous_artifact_request";

function commonBriefLines(request: ArtifactCreationRequest) {
  const lines = [
    `Artifact kind: ${request.kind}`,
    `Requested title: ${request.title}`,
    `Subject: ${request.brief.subject}`,
    `Objective: ${request.brief.objective}`,
  ];
  if (request.description) lines.push(`Description: ${request.description}`);
  if (request.brief.audience) lines.push(`Audience: ${request.brief.audience}`);
  const requirements = request.brief.requirements ?? [];
  if (requirements.length > 0) {
    lines.push("Requirements:", ...requirements.map((item) => `- ${item}`));
  }
  return lines;
}

function renderArtifactCreationBrief(request: ArtifactCreationRequest) {
  const lines = commonBriefLines(request);
  if (request.kind === "teaching_document" && request.brief.sections.length > 0) {
    lines.push("Requested sections:", ...request.brief.sections.map((item) => `- ${item}`));
  }
  if (request.kind === "mind_map" && request.brief.branches.length > 0) {
    lines.push("Requested branches:", ...request.brief.branches.map((item) => `- ${item}`));
  }
  if (request.kind === "quiz") {
    const plan = request.brief.questionPlan;
    lines.push(
      "Question plan:",
      `- Total: ${plan.questionCount}`,
      `- Single choice: ${plan.singleChoice}`,
      `- Multiple choice: ${plan.multipleChoice}`,
      `- True/false: ${plan.trueFalse}`,
      "Follow this question plan exactly.",
    );
  }
  if (request.kind === "game") {
    const plan = request.brief.questionPlan;
    lines.push(
      `Skin: ${request.brief.skin}`,
      "Question plan:",
      `- Total: ${plan.questionCount}`,
      `- Single choice: ${plan.singleChoice}`,
      `- True/false: ${plan.trueFalse}`,
      "Use the flap_revival template and follow this question plan exactly.",
    );
  }
  if (request.kind === "presentation") {
    if (request.brief.slideCount) {
      lines.push(`Exact slide count: ${request.brief.slideCount}`);
    }
    if (request.brief.sections.length > 0) {
      lines.push("Requested slide sections:", ...request.brief.sections.map((item) => `- ${item}`));
    }
  }
  if (request.kind === "animation") {
    lines.push(`Duration: ${request.brief.durationSeconds ?? 30} seconds`);
    if (request.brief.scenes.length > 0) {
      lines.push("Requested scenes:", ...request.brief.scenes.map((item) => `- ${item}`));
    }
    lines.push("Create a silent 16:9 knowledge-explanation animation.");
  }
  const rendered = lines.join("\n");
  if (rendered.length > 20_000) throw new Error("artifact_creation_brief_too_large");
  return rendered;
}

export function resolveArtifactCreationBrief(input: {
  briefContext: ArtifactCreationBriefContext;
  previousArtifactCreationPlan?: PreviousArtifactCreationPlan | undefined;
  request: ArtifactCreationRequest;
}) {
  if (
    input.briefContext === "continue_previous_artifact_request" &&
    !input.previousArtifactCreationPlan
  ) {
    throw new Error("previous_artifact_request_missing");
  }
  return renderArtifactCreationBrief(input.request);
}
