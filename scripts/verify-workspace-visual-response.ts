import { Agent } from "@mastra/core/agent";
import { loadEnvConfig } from "@next/env";
import type { ModelMessage } from "ai";
import sharp from "sharp";

loadEnvConfig(process.cwd());

async function main() {
  const image = await sharp({
    create: {
      background: "#ffffff",
      channels: 4,
      height: 420,
      width: 960,
    },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="960" height="420" xmlns="http://www.w3.org/2000/svg"><rect width="960" height="420" fill="#12213a"/><text x="480" y="230" text-anchor="middle" fill="white" font-size="84" font-family="Arial">K7-ORBIT</text></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();

  const { createWorkspaceAgentResources } = await import("@/features/agents/config");
  const { model } = createWorkspaceAgentResources();
  const agent = new Agent({
    id: "spectra-visual-contract-check",
    instructions:
      "Read the attached image and reply with the exact visible identifier only. Do not explain.",
    model,
    name: "Spectra visual response contract check",
  });
  const message: ModelMessage = {
    role: "user",
    content: [
      { text: "What is the exact visible identifier?", type: "text" },
      { data: image, mediaType: "image/png", type: "file" },
    ],
  };
  const output = await agent.stream([message], { maxSteps: 1 });
  for await (const _chunk of output.fullStream) {
    // Consume the stream so the provider response and usage settle before assertion.
  }
  const text = await output.text;
  if (!text.includes("K7-ORBIT")) {
    throw new Error("workspace_visual_response_contract_failed");
  }
  console.log("workspace_visual_response_contract_passed");
}

void main();
