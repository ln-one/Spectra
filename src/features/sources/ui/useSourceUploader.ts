"use client";

import type { QueryKey } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import AwsS3 from "@uppy/aws-s3";
import { Uppy } from "@uppy/core";
import enUS from "@uppy/locales/lib/en_US";
import zhCN from "@uppy/locales/lib/zh_CN";
import { useLocale } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type {
  SourceActionErrorCode,
  SourceActionResult,
  SourceClientActions,
} from "../client-actions";
import type { Source } from "../types";
import { MAX_SOURCE_FILE_BYTES, SOURCE_FILE_EXTENSIONS, sourceFileMaxBytes } from "../validation";

const MAX_UPLOAD_BATCH_SIZE = 20;
const allowedFileTypes = SOURCE_FILE_EXTENSIONS.map((extension) => `.${extension}`);

function unwrap<T>(
  result: SourceActionResult<T>,
  message: (code: SourceActionErrorCode) => string,
) {
  if (result.ok) return result.data;
  throw new Error(message(result.code));
}

function replaceSource(current: Source[] | undefined, source: Source) {
  if (!current) return [source];
  const index = current.findIndex((item) => item.id === source.id);
  if (index === -1) return [...current, source];
  return current.map((item) => (item.id === source.id ? source : item));
}

export function useSourceUploader({
  actions,
  actionFailedMessage,
  errorMessage,
  queryKey,
  workspaceId,
}: {
  actions: SourceClientActions;
  actionFailedMessage: string;
  errorMessage: (code: SourceActionErrorCode) => string;
  queryKey: QueryKey;
  workspaceId: string;
}) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const actionFailedMessageRef = useRef(actionFailedMessage);
  const errorMessageRef = useRef(errorMessage);
  actionFailedMessageRef.current = actionFailedMessage;
  errorMessageRef.current = errorMessage;
  const [uppy] = useState(() => {
    const instance = new Uppy({
      autoProceed: true,
      allowMultipleUploadBatches: true,
      onBeforeFileAdded: (file) => {
        const maxBytes = sourceFileMaxBytes(file.name);
        if (typeof file.size !== "number" || maxBytes === null || file.size <= maxBytes)
          return true;
        queueMicrotask(() =>
          instance.info(errorMessageRef.current("source_file_too_large"), "error", 5_000),
        );
        return false;
      },
      restrictions: {
        allowedFileTypes,
        maxFileSize: MAX_SOURCE_FILE_BYTES,
        maxNumberOfFiles: MAX_UPLOAD_BATCH_SIZE,
        minFileSize: 1,
      },
    });

    instance.use(AwsS3, {
      limit: 3,
      shouldUseMultipart: false,
      getUploadParameters: async (file) => {
        const sourceId = typeof file.meta.sourceId === "string" ? file.meta.sourceId : undefined;
        const target = sourceId
          ? unwrap(await actions.prepare(sourceId), errorMessageRef.current)
          : unwrap(
              await actions.start(workspaceId, {
                originalFilename: file.name,
                declaredSizeBytes: file.size ?? 0,
              }),
              errorMessageRef.current,
            );
        instance.setFileMeta(file.id, {
          sourceId: target.source.id,
          uploadGeneration: target.upload.generation,
        });
        queryClient.setQueryData<Source[]>(queryKey, (current) =>
          replaceSource(current, target.source),
        );
        return { method: target.upload.method, url: target.upload.url, fields: {} };
      },
    });

    instance.addPostProcessor(async (fileIds) => {
      await Promise.all(
        fileIds.map(async (fileId) => {
          const file = instance.getFile(fileId);
          if (!file || file.error) return;
          const sourceId = typeof file.meta.sourceId === "string" ? file.meta.sourceId : undefined;
          const generation =
            typeof file.meta.uploadGeneration === "number" ? file.meta.uploadGeneration : undefined;
          if (!sourceId || !generation) {
            instance.setFileState(fileId, { error: actionFailedMessageRef.current });
            return;
          }
          try {
            const completed = unwrap(
              await actions.complete(sourceId, generation),
              errorMessageRef.current,
            );
            queryClient.setQueryData<Source[]>(queryKey, (current) =>
              replaceSource(current, completed),
            );
          } catch (error) {
            instance.setFileState(fileId, {
              error: error instanceof Error ? error.message : actionFailedMessageRef.current,
            });
          }
        }),
      );
      await queryClient.invalidateQueries({ queryKey });
    });

    instance.on("complete", ({ failed, successful }) => {
      for (const file of successful ?? []) {
        if (instance.getFile(file.id)) instance.removeFile(file.id);
      }
      for (const file of failed ?? []) {
        if (typeof file.meta.sourceId !== "string" && instance.getFile(file.id)) {
          instance.removeFile(file.id);
        }
      }
    });

    return instance;
  });

  useEffect(() => {
    uppy.setOptions({ locale: locale === "zh-CN" ? zhCN : enUS });
  }, [locale, uppy]);

  const lifecycleGeneration = useRef(0);
  useEffect(() => {
    const generation = ++lifecycleGeneration.current;
    return () => {
      queueMicrotask(() => {
        if (lifecycleGeneration.current === generation) uppy.destroy();
      });
    };
  }, [uppy]);

  return uppy;
}
