/**
 * Model / runtime configuration for the keeper.
 *
 * Reuses the orchestrator's OrcaRouter model IDs (keeper/README.md):
 *   - default (fast/cheap):   orcarouter/kimi/kimi-k3
 *   - strong  (personality):  orcarouter/deepseek/deepseek-v4-pro-0813
 *
 * All values come from the environment; nothing is hardcoded secret.
 */

import type { Budget } from './types.js';

export const DEFAULT_MODEL_ID = 'orcarouter/kimi/kimi-k3';
export const STRONG_MODEL_ID = 'orcarouter/deepseek/deepseek-v4-pro-0813';
export const DEFAULT_BASE_URL = 'https://api.orcarouter.ai/v1';

export interface ModelConfig {
  id: string;
  temperature: number;
  maxTokens: number;
}

export interface Config {
  /** Base URL of the OpenAI-compatible gateway (no trailing slash). */
  baseUrl: string;
  /** API key; `undefined` means the keeper runs in deterministic mock mode. */
  apiKey?: string;
  models: Record<Budget, ModelConfig>;
  requestTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    baseUrl: (env.ORCAROUTER_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    apiKey: env.ORCAROUTER_API_KEY?.trim() || undefined,
    models: {
      default: {
        id: DEFAULT_MODEL_ID,
        temperature: 0.2,
        maxTokens: 256,
      },
      strong: {
        id: STRONG_MODEL_ID,
        temperature: 0.4,
        maxTokens: 512,
      },
    },
    requestTimeoutMs: toPositiveInt(env.ORCAROUTER_TIMEOUT_MS, 15_000),
  };
}

export function resolveModel(budget: Budget, config: Config): ModelConfig {
  return config.models[budget] ?? config.models.default;
}

export function hasApiKey(config: Config): boolean {
  return Boolean(config.apiKey);
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
