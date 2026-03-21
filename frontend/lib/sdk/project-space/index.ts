import {
  createReference,
  deleteReference,
  getReferences,
  updateReference,
} from "./references";
import { getVersion, getVersions } from "./versions";
import {
  createArtifact,
  downloadArtifact,
  getArtifact,
  getArtifacts,
} from "./artifacts";
import { addMember, deleteMember, getMembers, updateMember } from "./members";
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
  downloadArtifact,
  createArtifact,
  getMembers,
  addMember,
  updateMember,
  deleteMember,
  getCandidateChanges,
  createCandidateChange,
  reviewCandidateChange,
};
