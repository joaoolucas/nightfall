/**
 * Persona system for AI players.
 *
 * A persona shapes how a seat's LLM decides its night action and vote. It is
 * intentionally a *style* hint, not a cheat: the persona never receives info
 * beyond the seat's own role.
 */

import type { Phase, PublicPlayer, Role } from './types.js';

export type PersonaId = 'aggressive' | 'cautious' | 'deceptive';

export interface Persona {
  id: PersonaId;
  name: string;
  /** One-line description of how this persona behaves. */
  description: string;
  /** Concrete tactical guidance fed into the prompt. */
  tactics: string;
  /** How the persona talks / votes in discussion. */
  speechStyle: string;
  /** Short illustrative quotes (flavor only, not used verbatim). */
  exampleQuotes: string[];
}

export const PERSONAS: Record<PersonaId, Persona> = {
  aggressive: {
    id: 'aggressive',
    name: 'Aggressive',
    description:
      'Leads the accusation, votes early, and pushes hard against the most suspicious seat.',
    tactics:
      'Prefer to act decisively and early. Almost never pass when an action or vote is available. Pick a concrete target and commit.',
    speechStyle:
      'Direct, accusatory, high-pressure. Uses short declarative statements.',
    exampleQuotes: [
      '"Seat 3 is lying. Vote them now."',
      '"I have no time for fence-sitters."',
    ],
  },
  cautious: {
    id: 'cautious',
    name: 'Cautious',
    description:
      'Weighs risk, avoids reckless accusations, and will pass rather than act on weak signal.',
    tactics:
      'Only act when the evidence justifies it. If nothing is clear, passing is acceptable. Avoid targeting without a reason.',
    speechStyle:
      'Measured, hedged, evidence-focused. Qualifies claims carefully.',
    exampleQuotes: [
      '"I am not convinced yet. I need more information."',
      '"Let us not rush to blame anyone."',
    ],
  },
  deceptive: {
    id: 'deceptive',
    name: 'Deceptive',
    description:
      'Misdirects and deflects: claims a fake role, casts doubt on others, and hides true intent.',
    tactics:
      'Blend in. Deflect suspicion away from your team, and onto plausible others. Lie about your role if it helps, but never reveal real hidden knowledge.',
    speechStyle:
      'Charming, evasive, slippery. Plausible deniability in every sentence.',
    exampleQuotes: [
      '"I am just a villager, but seat 5 has been awfully quiet."',
      '"Interesting that you are so sure, seat 2."',
    ],
  },
};

export const DEFAULT_PERSONA: PersonaId = 'cautious';

export function getPersona(id: PersonaId | string): Persona {
  const key = (Object.keys(PERSONAS) as PersonaId[]).includes(id as PersonaId)
    ? (id as PersonaId)
    : DEFAULT_PERSONA;
  return PERSONAS[key];
}

/** Context for building a decision prompt. Only public info + own role. */
export interface PromptContext {
  seat: number;
  role: Role;
  phase: Phase;
  /** Public player info ONLY — roles of other seats must never be passed in. */
  players: PublicPlayer[];
  actionHistory: string[];
  persona: Persona;
}

/**
 * Builds the LLM prompt: persona + role + public state + action history.
 * Deliberately does NOT include other seats' roles (provable no-peeking).
 */
export function buildPrompt(ctx: PromptContext): string {
  const lines: string[] = [];

  lines.push(`You are seat ${ctx.seat} in a game of One Night Werewolf.`);
  lines.push(`Your role (known ONLY to you): ${ctx.role}.`);
  lines.push(`Do not reveal your real role in your reasoning.`);
  lines.push(``);
  lines.push(`Persona: ${ctx.persona.name}`);
  lines.push(`  ${ctx.persona.description}`);
  lines.push(`Tactics: ${ctx.persona.tactics}`);
  lines.push(`Style: ${ctx.persona.speechStyle}`);
  lines.push(``);
  lines.push(`Current phase: ${ctx.phase}`);
  lines.push(`Players:`);
  for (const p of ctx.players) {
    const you = p.seat === ctx.seat ? ' (you)' : '';
    const status = p.alive ? 'alive' : 'eliminated';
    lines.push(`  - seat ${p.seat}${you}: ${status}`);
  }
  lines.push(``);
  lines.push(`Action history (public):`);
  if (ctx.actionHistory.length === 0) {
    lines.push(`  (none yet)`);
  } else {
    for (const entry of ctx.actionHistory) {
      lines.push(`  - ${entry}`);
    }
  }
  lines.push(``);
  lines.push(
    `Decide your next move. Respond with a single JSON object and nothing else,`,
  );
  lines.push(
    `using exactly: {"action":"vote"|"night_action"|"pass","target":<seat number or null>,"reasoning":"..."}`,
  );

  return lines.join('\n');
}
