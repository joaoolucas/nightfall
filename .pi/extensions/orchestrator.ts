/**
 * Hackathon Orchestrator
 *
 * Turns pi into a multi-role orchestrator for a non-stop workflow:
 *
 *   Supervisor  -> GPT-5.6 Sol            (planning & coordination)
 *   Worker      -> hcnsec/DeepSeek-V4-Flash (fast implementation)
 *   Reviewer    -> hcnsec/Kimi-K2.6       (code review + vision)
 *   Merger      -> hcnsec/DeepSeek-V4-Pro (merge/conflict resolution)
 *   Architect   -> claude-bridge/claude-opus-5 (final architecture gate)
 *
 * Each subagent runs in a separate `pi` process (isolated context), with its
 * own model, thinking level, and tool set.
 *
 * Usage:
 *   /role <role>        switch the main agent to a role
 *   /kickoff <goal>     start the non-stop loop (Supervisor takes over)
 *   run_agent (tool)    used by the Supervisor to dispatch subagents
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

type Role = "supervisor" | "worker" | "reviewer" | "merger" | "architect";
type SubRole = "worker" | "reviewer" | "merger" | "architect";

interface RoleSpec {
  model: string; // provider/id
  thinking: string;
  tools: string[]; // subagent tools
  systemPrompt: string; // role instructions (appended to the system prompt)
  label: string;
}

const ROLES: Record<Role, RoleSpec> = {
  supervisor: {
    model: "openai-codex/gpt-5.6-sol",
    thinking: "high",
    tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
    systemPrompt: "You are the Supervisor. Plan, dispatch workers, review, merge, and validate until the Definition of Done is met.",
    label: "Supervisor (GPT-5.6 Sol · high · planning)",
  },
  worker: {
    model: "hcnsec/DeepSeek-V4-Flash",
    thinking: "off",
    tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
    systemPrompt: [
      "You are a worker (DeepSeek V4 Flash). Implement the assigned task end-to-end, autonomously.",
      "Use read/edit/write/bash as needed. Run the build and relevant tests when done.",
      "Final output:",
      "## Completed - what was done",
      "## Files Changed - list of changed files",
      "## Notes - info for the reviewer (key files, decisions)",
      "Do not stop until the task is complete.",
    ].join("\n"),
    label: "Worker (DeepSeek V4 Flash · fast)",
  },
  reviewer: {
    model: "hcnsec/Kimi-K2.6",
    thinking: "off",
    tools: ["read", "grep", "find", "ls", "bash"],
    systemPrompt: [
      "You are a senior code reviewer. Review the recent changes.",
      "Bash is read-only: git diff, git log, git show. Do NOT modify files or run builds.",
      "Final output:",
      "## Critical (must fix) - with file:line",
      "## Warnings (should fix)",
      "## Suggestions (consider)",
      "## Verdict - APPROVE or REQUEST CHANGES",
      "Be specific with paths and line numbers.",
    ].join("\n"),
    label: "Reviewer (Kimi K2.6 · vision)",
  },
  merger: {
    model: "hcnsec/DeepSeek-V4-Pro",
    thinking: "off",
    tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
    systemPrompt: [
      "You are a merger. Resolve conflicts and integrate the changes.",
      "Use git status/git diff to understand the state, edit conflicts, and run build/tests at the end.",
      "Final output:",
      "## Merged - what was integrated/resolved",
      "## Conflicts Resolved - conflicts handled",
      "## Verification - build/tests run and their result",
      "## Files Changed - changed files",
    ].join("\n"),
    label: "Merger (DeepSeek V4 Pro)",
  },
  architect: {
    model: "claude-bridge/claude-opus-5",
    thinking: "high",
    tools: ["read", "grep", "find", "ls", "bash"],
    systemPrompt: [
      "You are the final architecture and quality gate (Claude Opus 5). Review without editing anything.",
      "Bash is read-only: use git diff, git log, and tests only when needed. Do not modify files.",
      "Analyze module boundaries, state machines, persistence/migrations, game economy and balance, accessibility, security, performance, and scalability.",
      "Distinguish release blockers from follow-up improvements and cite file:line for every finding.",
      "Final output:",
      "## Architecture Assessment",
      "## Release Blockers",
      "## Risks and Balance Findings",
      "## Recommendations",
      "## Verdict - APPROVE or REQUEST CHANGES",
    ].join("\n"),
    label: "Architect (Claude Opus 5 · high · final gate)",
  },
};

const SUBAGENT_ROLES: SubRole[] = ["worker", "reviewer", "merger", "architect"];

const MAX_CONCURRENCY = 4;
const OUTPUT_CAP = 50 * 1024; // 50 KB visible to the model per task

interface Usage {
  input: number;
  output: number;
  cost: number;
  turns: number;
}

interface RunResult {
  role: SubRole;
  task: string;
  exitCode: number;
  output: string;
  stderr: string;
  model: string;
  stopReason?: string;
  errorMessage?: string;
  usage: Usage;
}

interface AssistantMsg {
  role: "assistant";
  content: Array<{ type: string; text?: string }>;
  usage?: {
    input?: number;
    output?: number;
    cost?: { total?: number };
  };
  stopReason?: string;
  errorMessage?: string;
  model?: string;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) return { command: process.execPath, args };
  return { command: "pi", args };
}

function finalText(messages: AssistantMsg[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    for (const part of messages[i].content) {
      if (part.type === "text" && part.text) return part.text;
    }
  }
  return "";
}

function truncate(output: string): string {
  const byteLength = Buffer.byteLength(output, "utf8");
  if (byteLength <= OUTPUT_CAP) return output;
  let truncated = output.slice(0, OUTPUT_CAP);
  while (Buffer.byteLength(truncated, "utf8") > OUTPUT_CAP) truncated = truncated.slice(0, -1);
  return `${truncated}\n\n[truncated: ${byteLength - Buffer.byteLength(truncated, "utf8")} bytes omitted]`;
}

async function runSubagent(
  role: SubRole,
  task: string,
  cwd: string,
  signal?: AbortSignal,
  onProgress?: (text: string) => void,
): Promise<RunResult> {
  const spec = ROLES[role];
  const args: string[] = [
    "--mode", "json",
    "-p",
    "--no-session",
    "--model", spec.model,
    "--thinking", spec.thinking,
    "--tools", spec.tools.join(","),
  ];

  const result: RunResult = {
    role,
    task,
    exitCode: 0,
    output: "",
    stderr: "",
    model: spec.model,
    usage: { input: 0, output: 0, cost: 0, turns: 0 },
  };

  const messages: AssistantMsg[] = [];

  const exitCode = await new Promise<number>((resolve) => {
    const invocation = getPiInvocation(args);
    let finalArgs = [...invocation.args, "--append-system-prompt", spec.systemPrompt, `Task: ${task}`];

    let proc;
    try {
      proc = spawn(invocation.command, finalArgs, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      resolve(1);
      return;
    }

    let buffer = "";
    const processLine = (line: string) => {
      if (!line.trim()) return;
      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.type === "message_end" && event.message && event.message.role === "assistant") {
        const msg = event.message as AssistantMsg;
        messages.push(msg);
        result.usage.turns++;
        if (msg.usage) {
          result.usage.input += msg.usage.input || 0;
          result.usage.output += msg.usage.output || 0;
          result.usage.cost += msg.usage.cost?.total || 0;
        }
        if (msg.stopReason) result.stopReason = msg.stopReason;
        if (msg.errorMessage) result.errorMessage = msg.errorMessage;
        if (msg.model) result.model = msg.model;
        onProgress?.(finalText(messages) || "(working...)");
      }
    };

    proc.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) processLine(line);
    });

    proc.stderr.on("data", (data: Buffer) => {
      result.stderr += data.toString();
    });

    proc.on("close", (code: number | null) => {
      if (buffer.trim()) processLine(buffer);
      resolve(code ?? 0);
    });

    proc.on("error", () => resolve(1));

    if (signal) {
      const kill = () => {
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 5000);
      };
      if (signal.aborted) kill();
      else signal.addEventListener("abort", kill, { once: true });
    }
  });

  result.exitCode = exitCode;
  result.output = finalText(messages);
  return result;
}

async function mapConcurrent<T>(items: T[], fn: (item: T, index: number) => Promise<RunResult>): Promise<RunResult[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(MAX_CONCURRENCY, items.length));
  const results: RunResult[] = new Array(items.length);
  let next = 0;
  const workers = new Array(limit).fill(null).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const RoleEnum = StringEnum(SUBAGENT_ROLES, {
  description: "Subagent role: worker (implements), reviewer (reviews), merger (integrates/merges), architect (reviews architecture)",
});

const RunAgentParams = Type.Object({
  role: Type.Optional(RoleEnum),
  task: Type.Optional(Type.String({ description: "Task to delegate (single mode)" })),
  tasks: Type.Optional(
    Type.Array(
      Type.Object({
        role: RoleEnum,
        task: Type.String({ description: "Task to delegate" }),
      }),
      { description: "Array of {role, task} for parallel execution (independent workers)" },
    ),
  ),
  cwd: Type.Optional(Type.String({ description: "Working directory for the subagent (default: current cwd)" })),
});

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.notify(
        `Orchestrator: /kickoff <goal> · /role supervisor|worker|reviewer|merger|architect`,
        "info",
      );
    }
  });

  pi.registerTool({
    name: "run_agent",
    label: "Run Agent",
    description: [
      "Dispatch a task to a subagent with its own model/thinking/tools and isolated context.",
      "Roles: worker (implements), reviewer (reviews), merger (integrates/merges), architect (reviews architecture).",
      "Use tasks[] to run workers in parallel when tasks are independent and do not touch the same files.",
      "Returns the subagent's final text (and usage stats).",
    ].join(" "),
    promptGuidelines: [
      "Use run_agent (role=worker) to implement; role=reviewer to review; role=merger to integrate; role=architect to review architecture.",
      "Run workers in parallel (tasks[]) when tasks are independent; never parallelize tasks that edit the same files.",
    ],
    parameters: RunAgentParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const cwd = params.cwd ?? ctx.cwd;
      const hasSingle = Boolean(params.role && params.task);
      const hasTasks = (params.tasks?.length ?? 0) > 0;

      if (hasSingle === hasTasks) {
        return {
          content: [{ type: "text", text: "Provide exactly one mode: {role + task} OR {tasks: [...]}." }],
          details: {},
          isError: true,
        };
      }

      if (hasTasks) {
        const items = params.tasks!;
        const results = await mapConcurrent(items, (t, i) =>
          runSubagent(t.role, t.task, cwd, signal, (txt) =>
            onUpdate?.({ content: [{ type: "text", text: `[${i + 1}/${items.length}] ${t.role}: ${txt}` }], details: {} }),
          ),
        );

        const ok = results.filter((r) => r.exitCode === 0 && r.stopReason !== "error" && r.stopReason !== "aborted").length;
        const summaries = results
          .map((r) => {
            const failed = r.exitCode !== 0 || r.stopReason === "error" || r.stopReason === "aborted";
            const status = failed ? `failed${r.stopReason ? ` (${r.stopReason})` : ""}` : "ok";
            return `### ${r.role} [${status}]\n${failed ? (r.errorMessage || r.stderr || r.output) : truncate(r.output)}`;
          })
          .join("\n\n---\n\n");

        return {
          content: [{ type: "text", text: `Parallel: ${ok}/${results.length} completed.\n\n${summaries}` }],
          details: { results },
          isError: ok === 0,
        };
      }

      const result = await runSubagent(params.role!, params.task!, cwd, signal, (txt) =>
        onUpdate?.({ content: [{ type: "text", text: txt }], details: {} }),
      );

      const failed = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
      const usage = `${result.usage.turns} turns · ↑${result.usage.input} ↓${result.usage.output} · $${result.usage.cost.toFixed(4)} · ${result.model}`;
      return {
        content: [
          {
            type: "text",
            text: failed
              ? `[${result.role}] failed${result.stopReason ? ` (${result.stopReason})` : ""}: ${result.errorMessage || result.stderr || result.output}\n\n${usage}`
              : `${truncate(result.output)}\n\n${usage}`,
          },
        ],
        details: { result },
        isError: failed,
      };
    },
  });

  async function applyRole(ctx: any, role: Role): Promise<boolean> {
    const spec = ROLES[role];
    const slash = spec.model.indexOf("/");
    const provider = spec.model.slice(0, slash);
    const id = spec.model.slice(slash + 1);

    const model = ctx.modelRegistry?.find(provider, id);
    if (!model) {
      ctx.ui.notify(`Model not found: ${spec.model}`, "error");
      return false;
    }
    const ok = await pi.setModel(model);
    if (!ok) {
      ctx.ui.notify(`No credential for ${spec.model}`, "error");
      return false;
    }
    pi.setThinkingLevel(spec.thinking as any);
    ctx.ui.notify(`Role: ${spec.label}`, "info");
    return true;
  }

  pi.registerCommand("role", {
    description: "Switch the main agent to a role (supervisor|worker|reviewer|merger|architect)",
    getArgumentCompletions: () =>
      (Object.keys(ROLES) as Role[]).map((r) => ({ value: r, label: ROLES[r].label })),
    handler: async (args, ctx) => {
      const role = (args || "").trim().toLowerCase() as Role;
      if (!ROLES[role]) {
        ctx.ui.notify("Usage: /role supervisor|worker|reviewer|merger|architect", "error");
        return;
      }
      await applyRole(ctx, role);
    },
  });

  pi.registerCommand("kickoff", {
    description: "Start the non-stop workflow (Supervisor takes over)",
    handler: async (args, ctx) => {
      const goal = (args || "").trim();
      if (!goal) {
        ctx.ui.notify("Usage: /kickoff <goal>", "error");
        return;
      }

      const ok = await applyRole(ctx, "supervisor");
      if (!ok) return;

      const prompt = [
        `KICKOFF — goal: ${goal}`,
        "",
        "Follow the non-stop orchestration protocol in AGENTS.md. From now on you are the Supervisor.",
        "",
        "1. Plan: read the repository, understand the goal, and break it into small, verifiable tasks.",
        "2. Dispatch workers: use the run_agent tool (role=worker). Use tasks[] to run in parallel when tasks are independent and do not edit the same files.",
        "3. Review: use run_agent (role=reviewer) on what was implemented.",
        "4. Fix/integrate: use run_agent (role=merger) to resolve conflicts and apply fixes.",
        "5. Validate architecture: use run_agent (role=architect) when there are structural changes.",
        "6. Verify: run build/tests with bash. Commit at every stable iteration.",
        "",
        "Do NOT stop between steps. Keep looping until the Definition of Done is met.",
        "If something fails, diagnose, fix, and continue. Only stop if genuinely blocked (e.g. missing information only the user can provide) — in that case report exactly what is needed.",
        "",
        "Definition of Done: code implemented, build/tests passing, reviewed, and committed.",
      ].join("\n");

      pi.sendUserMessage(prompt);
    },
  });
}
