import {
  createReference,
  deleteReference,
  getReferences,
  updateReference,
} from "./references";
import { getVersion, getVersions } from "./versions";
import { createArtifact, getArtifact, getArtifacts } from "./artifacts";
import { addMember, getMembers, updateMember } from "./members";
import {
  createCandidateChange,
  getCandidateChanges,
  reviewCandidateChange,
} from "./candidate-changes";

export const projectSpaceApi = {
  getReferences,
  createReference,
  updateReference,
  deleteReference,
  getVersions,
  getVersion,
  getArtifacts,
  getArtifact,
  createArtifact,
  getMembers,
  addMember,
  updateMember,
  getCandidateChanges,
  createCandidateChange,
  reviewCandidateChange,
};
