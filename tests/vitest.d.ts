declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseRun: {
      databasePrefix: string;
      templateDatabaseName: string;
    };
  }
}

export {};
