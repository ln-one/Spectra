import { z } from "zod";

async function main() {
  const { getOneMessage } = await import("execa");
  const input = z.object({ operation: z.string() }).parse(await getOneMessage());
  if (input.operation === "submit") {
    await new Promise<never>(() => undefined);
  } else {
    process.abort();
  }
}

void main();
