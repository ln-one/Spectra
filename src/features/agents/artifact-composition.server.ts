import "server-only";

import { saveGameRevision } from "@/features/artifacts/games/service";
import { saveMindMapRevision } from "@/features/artifacts/mind-maps/service";
import { enqueuePresentationRefinementWorkflow } from "@/features/artifacts/presentations/refine-dbos";
import { publishArtifactEditProposal } from "@/features/artifacts/proposal-service.server";
import { saveQuizRevision } from "@/features/artifacts/quizzes/service";
import { artifactServerModules } from "@/features/artifacts/server-modules.server";
import { listArtifactHistory } from "@/features/artifacts/workbench-server";
import { resolveWorkspaceKnowledgeGroundingRefs } from "./knowledge-tool.server";

export { createArtifactCommandAdapters } from "./artifact-command-adapters.server";

const teachingDocument = artifactServerModules.teaching_document;
const mindMap = artifactServerModules.mind_map;
const quiz = artifactServerModules.quiz;
const game = artifactServerModules.game;
const presentation = artifactServerModules.presentation;
const animation = artifactServerModules.animation;

export type ArtifactToolDependencies = {
  createTeachingDocument: typeof teachingDocument.createFromAgent;
  getTeachingDocumentDetail: typeof teachingDocument.getDetail;
  listHistory: typeof listArtifactHistory;
  createMindMap?: typeof mindMap.createFromAgent;
  getMindMapDetail?: typeof mindMap.getDetail;
  saveMindMapRevision?: typeof saveMindMapRevision;
  createQuiz?: typeof quiz.createFromAgent;
  getQuizDetail?: typeof quiz.getDetail;
  saveQuizRevision?: typeof saveQuizRevision;
  createGame?: typeof game.createFromAgent;
  saveGameRevision?: typeof saveGameRevision;
  createPresentation?: typeof presentation.createFromAgent;
  createAnimation?: typeof animation.createFromAgent;
  getGameDetail?: typeof game.getDetail;
  getPresentationDetail?: typeof presentation.getDetail;
  enqueuePresentationRefinement?: typeof enqueuePresentationRefinementWorkflow;
  publishProposal?: typeof publishArtifactEditProposal;
  resolveGroundingRefs?: typeof resolveWorkspaceKnowledgeGroundingRefs;
};

export const artifactAgentComposition = {
  createAnimation: animation.createFromAgent,
  createGame: game.createFromAgent,
  createMindMap: mindMap.createFromAgent,
  createPresentation: presentation.createFromAgent,
  createQuiz: quiz.createFromAgent,
  createTeachingDocument: teachingDocument.createFromAgent,
  getGameDetail: game.getDetail,
  getMindMapDetail: mindMap.getDetail,
  getQuizDetail: quiz.getDetail,
  getPresentationDetail: presentation.getDetail,
  getTeachingDocumentDetail: teachingDocument.getDetail,
  listHistory: listArtifactHistory,
  publishProposal: publishArtifactEditProposal,
  resolveGroundingRefs: resolveWorkspaceKnowledgeGroundingRefs,
  enqueuePresentationRefinement: enqueuePresentationRefinementWorkflow,
  saveMindMapRevision,
  saveGameRevision,
  saveQuizRevision,
} satisfies ArtifactToolDependencies;
