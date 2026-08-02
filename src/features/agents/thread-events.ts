import { z } from "zod";

export const threadTitleUpdateSchema = z
  .object({
    conversationId: z.string().uuid(),
    title: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine((value) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)),
  })
  .strict();

export type ThreadTitleUpdate = z.infer<typeof threadTitleUpdateSchema>;
