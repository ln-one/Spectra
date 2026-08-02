import { safeValidateUIMessages, type UIMessage } from "ai";
import { z } from "zod";
import { agentSurfaceContextSchema } from "./surface-context";

export const agentClientRequestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const AGENT_CHAT_REQUEST_MAX_BYTES = 2 * 1024 * 1024;
export const AGENT_CHAT_MESSAGE_MAX_BYTES = 256 * 1024;
const AGENT_CHAT_MAX_MESSAGES = 200;
const AGENT_CHAT_LATEST_USER_TEXT_MAX_CHARS = 16_000;

export class AgentRequestTooLargeError extends Error {
  readonly code = "agent_request_too_large" as const;

  constructor() {
    super("agent_request_too_large");
    this.name = "AgentRequestTooLargeError";
  }
}

const agentChatRequestSchema = z
  .object({
    clientRequestId: agentClientRequestIdSchema,
    conversationId: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
    locale: z.enum(["zh-CN", "en-US"]),
    intent: z.enum(["chat", "plan"]).default("chat"),
    messageId: z.string().min(1).max(128).optional(),
    messages: z.array(z.unknown()).min(1).max(AGENT_CHAT_MAX_MESSAGES),
    surface: agentSurfaceContextSchema,
    trigger: z.enum(["submit-message", "regenerate-message"]),
    workspaceId: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
  })
  .strict();

function latestUserMessage(messages: UIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") return message;
  }
  return null;
}

export async function parseAgentChatRequest(input: unknown) {
  const parsed = agentChatRequestSchema.safeParse(input);
  if (!parsed.success) return null;

  for (const message of parsed.data.messages) {
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(message);
    } catch {
      throw new AgentRequestTooLargeError();
    }
    if (
      typeof serialized !== "string" ||
      new TextEncoder().encode(serialized).byteLength > AGENT_CHAT_MESSAGE_MAX_BYTES
    ) {
      throw new AgentRequestTooLargeError();
    }
  }

  const validated = await safeValidateUIMessages({ messages: parsed.data.messages });
  if (!validated.success || validated.data.some((message) => message.role === "system"))
    return null;

  const latest = latestUserMessage(validated.data);
  if (!latest) return null;
  const text = latest.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();
  if (!text || text.length > AGENT_CHAT_LATEST_USER_TEXT_MAX_CHARS) return null;

  return {
    clientRequestId: parsed.data.clientRequestId,
    conversationId: parsed.data.conversationId,
    forceWorkspaceRetrieval: Boolean(
      latest.metadata &&
        typeof latest.metadata === "object" &&
        Reflect.get(latest.metadata, "spectraForceWorkspaceRetrieval") === true,
    ),
    forceWebSearch: Boolean(
      latest.metadata &&
        typeof latest.metadata === "object" &&
        Reflect.get(latest.metadata, "spectraForceWebSearch") === true,
    ),
    latestUserMessage: latest,
    intent: parsed.data.intent,
    locale: parsed.data.locale,
    messages: validated.data,
    operation:
      parsed.data.trigger === "regenerate-message" ? ("regenerate" as const) : ("send" as const),
    surface: parsed.data.surface,
    text,
    workspaceId: parsed.data.workspaceId,
  };
}

export type ParsedAgentChatRequest = NonNullable<Awaited<ReturnType<typeof parseAgentChatRequest>>>;
