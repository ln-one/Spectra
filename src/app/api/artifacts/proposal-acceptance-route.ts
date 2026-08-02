import { z } from "zod";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import type { Actor } from "@/features/identity/types";

const querySchema = z
  .object({ conversationId: z.string().uuid(), workspaceId: z.string().uuid() })
  .strict();
const paramsSchema = z.object({ artifactId: z.string().uuid(), runId: z.string().uuid() }).strict();

type ProposalScope = z.infer<typeof querySchema> & z.infer<typeof paramsSchema>;

export function createArtifactProposalAcceptanceRoute<
  Body extends Record<string, unknown>,
>(options: {
  accept: (actor: Actor, input: Body & ProposalScope) => Promise<unknown>;
  bodySchema: z.ZodType<Body>;
  conflictCodes: readonly string[];
  domainErrorCode: (error: unknown) => string | null;
  invalidCodes: readonly string[];
  invalidRequestCode: string;
  unavailableCode: string;
}) {
  return async function POST(
    request: Request,
    { params }: { params: Promise<{ artifactId: string; runId: string }> },
  ) {
    const url = new URL(request.url);
    const query = querySchema.safeParse(Object.fromEntries(url.searchParams));
    const body = options.bodySchema.safeParse(await request.json().catch(() => null));
    const routeParams = paramsSchema.safeParse(await params);
    if (!query.success || !body.success || !routeParams.success) {
      return Response.json({ detail: { code: options.invalidRequestCode } }, { status: 400 });
    }

    try {
      const actor = await getCurrentActor();
      return Response.json(
        await options.accept(actor, { ...routeParams.data, ...query.data, ...body.data }),
      );
    } catch (error) {
      if (error instanceof IdentityError) {
        return Response.json(
          { detail: { code: error.code } },
          { status: error.code === "authentication_required" ? 401 : 403 },
        );
      }
      const domainCode = options.domainErrorCode(error);
      if (domainCode) {
        const status = options.conflictCodes.includes(domainCode)
          ? 409
          : options.invalidCodes.includes(domainCode)
            ? 400
            : 404;
        return Response.json({ detail: { code: domainCode } }, { status });
      }
      return Response.json({ detail: { code: options.unavailableCode } }, { status: 503 });
    }
  };
}
