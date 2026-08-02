export type VersionedObject = {
  key: string;
  versionId: string;
};

export type InspectedObject = VersionedObject & {
  etag: string;
  sizeBytes: number;
};

export interface SourceStorage {
  createUploadUrl(input: { key: string; expiresInSeconds: number }): Promise<{ url: string }>;
  createDownloadUrl(input: {
    reference: VersionedObject;
    expiresInSeconds: number;
  }): Promise<{ url: string }>;
  headObject(reference: { key: string; versionId?: string }): Promise<InspectedObject | null>;
  readObjectRange(
    reference: VersionedObject,
    range: { start: number; end: number },
  ): Promise<Uint8Array>;
  copyObjectConditionally(input: {
    source: InspectedObject;
    destinationKey: string;
  }): Promise<VersionedObject>;
  downloadObjectToFile(reference: VersionedObject, destinationPath: string): Promise<void>;
  putObject(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<VersionedObject>;
  deleteObjectVersion(reference: VersionedObject): Promise<void>;
}
