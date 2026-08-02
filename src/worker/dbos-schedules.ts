import type { DBOS } from "@dbos-inc/dbos-sdk";

export type DbosScheduleDefinition = Parameters<typeof DBOS.applySchedules>[0][number];
