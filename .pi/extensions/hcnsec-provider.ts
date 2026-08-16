import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MODEL_IDS: Array<[string, string]> = [
  ["auto", "HCNsec Auto Router"],
  ["DeepSeek-V4-Flash", "DeepSeek V4 Flash"],
  ["DeepSeek-V4-Pro", "DeepSeek V4 Pro"],
  ["glm-5.2", "GLM 5.2"],
  ["kat-coder-pro-v2.5", "KAT Coder Pro v2.5"],
  ["Kimi-K2.6", "Kimi K2.6"],
  ["MiniMax-M3", "MiniMax M3"],
  ["Qwen3.6-27B", "Qwen 3.6 27B"],
  ["Qwen3.8-27B", "Qwen 3.8 27B"],
  ["sensenova-6.7-flash-lite", "SenseNova 6.7 Flash Lite"],
  ["sensenova-u1-fast", "SenseNova U1 Fast"],
  ["step-3.5-flash", "Step 3.5 Flash"],
  ["step-3.5-flash-2603", "Step 3.5 Flash 2603"],
  ["step-3.7-flash", "Step 3.7 Flash"],
  ["step-explore", "Step Explore"],
  ["step-router-v1", "Step Router v1"],
];

/**
 * HCNsec OpenAI-compatible provider.
 *
 * Authentication is resolved from the local `hcnsec` credential in
 * `~/.pi/agent/auth.json`; no API key belongs in this repository.
 */
export default function registerHcnsec(pi: ExtensionAPI) {
  pi.registerProvider("hcnsec", {
    name: "HCNsec",
    baseUrl: "https://api.hcnsec.cn/v1",
    api: "openai-completions",
    authHeader: true,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: true,
      maxTokensField: "max_tokens",
    },
    models: MODEL_IDS.map(([id, name]) => ({
      id,
      name,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      // Keep completion reservations small enough for the provider's pre-charge
      // while allowing tool-driven agents to continue over multiple turns.
      maxTokens: 2_048,
    })),
  });
}
