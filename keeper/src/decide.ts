/**
 * LLM decision: persona + role + public state + action history → Decision.
 *
 * Calls the OrcaRouter OpenAI-compatible `/chat/completions` endpoint with a
 * native `fetch` (available in Node >= 18). If no API key is configured, or
 * the HTTP call / JSON parse fails, it degrades to a deterministic mock
 * decision so the skeleton always runs.
 */

import type { Config } from './config.js';
import { hasApiKey, loadConfig, resolveModel } from './config.js';
import { buildPrompt, getPersona, type PersonaId } from './persona.js';
import {
  NIGHT_ACTION_ROLES,
  type Action,
  type Budget,
  type Decision,
  type GameState,
  type PublicPlayer,
  type Role,
} from './types.js';

export interface DecideInput {
  seat: number;
  persona: PersonaId;
  /** The seat's own decrypted role — the ONLY hidden info the keeper knows. */
  role: Role;
  state: GameState;
  budget?: Budget;
  config?: Config;
}

const SYSTEM_PROMPT = [
  'You are an AI player in the social deduction game One Night Werewolf.',
  'You control exactly one seat and know ONLY your own role. You cannot see',
  "other players' roles. Respond with a single JSON object and nothing else:",
  '{"action":"vote"|"night_action"|"pass","target":<seat number or null>,"reasoning":"..."}',
  '- "vote": cast an anonymous vote for a seat (Vote phase).',
  '- "night_action": perform your role\'s night action on a target seat, only if your role has one.',
  '- "pass": do nothing (no night action, or you choose not to act).',
  '- "target" is the seat number you act on, or null when there is no target.',
  'Never reveal your role in "reasoning". Never invent knowledge you do not have.',
].join(' ');

const VALID_ACTIONS = new Set<Action>(['vote', 'night_action', 'pass']);

export async function decide(input: DecideInput): Promise<Decision> {
  const config = input.config ?? loadConfig();
  const persona = getPersona(input.persona);
  const players: PublicPlayer[] = input.state.seats.map((s) => ({
    seat: s.seat,
    alive: s.alive,
  }));

  const prompt = buildPrompt({
    seat: input.seat,
    role: input.role,
    phase: input.state.phase,
    players,
    actionHistory: input.state.actionHistory,
    persona,
  });

  if (!hasApiKey(config)) {
    return mockDecision(input, persona, players);
  }

  try {
    return await callModel(config, input.budget ?? 'default', prompt);
  } catch (err) {
    console.warn(
      `[keeper][decide] LLM call failed (${(err as Error).message}); falling back to mock decision.`,
    );
    return mockDecision(input, persona, players);
  }
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

async function callModel(
  config: Config,
  budget: Budget,
  prompt: string,
): Promise<Decision> {
  const model = resolveModel(budget, config);
  const url = `${config.baseUrl}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.requestTimeoutMs,
  );

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: model.id,
        temperature: model.temperature,
        max_tokens: model.maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as ChatResponse;
    const content = extractContent(data);
    if (!content) {
      throw new Error('empty completion content');
    }
    return parseDecision(content);
  } finally {
    clearTimeout(timer);
  }
}

function extractContent(data: ChatResponse): string {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'string'
          ? part
          : part && typeof part === 'object' && 'text' in part
            ? String((part as { text: unknown }).text)
            : '',
      )
      .join('');
  }
  return '';
}

/**
 * JSON fallback parser: tries a straight parse, then strips markdown fences,
 * then extracts the first balanced `{...}` block. Always returns a valid
 * Decision — degrading to `pass` if the content is unusable.
 */
function parseDecision(content: string): Decision {
  const parsed = extractJsonObject(content);
  return normalize(parsed);
}

function extractJsonObject(text: string): unknown {
  let t = text.trim();
  // Strip ```json ... ``` fences.
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(t);
  } catch {
    /* fall through to regex extraction */
  }

  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

function normalize(raw: unknown): Decision {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const action: Action = VALID_ACTIONS.has(obj.action as Action)
    ? (obj.action as Action)
    : 'pass';

  let target: number | null = null;
  if (action !== 'pass') {
    const t = obj.target;
    if (typeof t === 'number' && Number.isInteger(t)) {
      target = t;
    } else if (
      typeof t === 'string' &&
      t.trim() !== '' &&
      Number.isInteger(Number(t))
    ) {
      target = Number(t);
    }
  }

  const reasoning =
    typeof obj.reasoning === 'string'
      ? obj.reasoning.trim()
      : 'No reasoning provided.';

  return { action, target, reasoning };
}

/** Deterministic, persona-flavored decision used when no key is available. */
function mockDecision(
  input: DecideInput,
  persona: ReturnType<typeof getPersona>,
  players: PublicPlayer[],
): Decision {
  const { seat, role, state } = input;
  const others = players.filter((p) => p.seat !== seat);
  const pickTarget = (): number | null => {
    if (others.length === 0) return null;
    const h = hashString(`${state.gameId}:${seat}:${state.actionHistory.length}`);
    return others[h % others.length]!.seat;
  };

  switch (state.phase) {
    case 'night': {
      if (!NIGHT_ACTION_ROLES.includes(role)) {
        return {
          action: 'pass',
          target: null,
          reasoning: `${persona.name} ${role} has no night action.`,
        };
      }
      const target = pickTarget();
      return {
        action: 'night_action',
        target,
        reasoning: `${persona.name} ${role} acts on seat ${target ?? 'none'}.`,
      };
    }
    case 'vote': {
      // Cautious seats occasionally abstain (deterministic, not random).
      if (persona.id === 'cautious' && state.actionHistory.length % 3 === 0) {
        return {
          action: 'pass',
          target: null,
          reasoning: `${persona.name} abstains for lack of evidence.`,
        };
      }
      const target = pickTarget();
      return {
        action: 'vote',
        target,
        reasoning: `${persona.name} votes for seat ${target ?? 'none'}.`,
      };
    }
    default:
      return {
        action: 'pass',
        target: null,
        reasoning: `No action in phase '${state.phase}'.`,
      };
  }
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
