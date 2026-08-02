export interface KnowledgeSourceCleanupOperations {
  listWorkflowIds(sourceId: string): Promise<string[]>;
  purgeDeletedSourceIndex(sourceId: string): Promise<void>;
}
