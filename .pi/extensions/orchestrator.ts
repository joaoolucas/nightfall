/**
 * Hackathon Orchestrator
 *
 * Transforma o pi em um orquestrador multi-papel para um workflow non-stop:
 *
 *   Supervisor  -> GPT-5.6 Sol            (agente principal)
 *   Worker      -> DeepSeek V4 Pro        (implementação)
 *   Reviewer    -> Gemini 3.7 Flash       (code review, via openrouter)
 *   Merger      -> DeepSeek V4 Pro        (merge/resolução de conflitos)
 *   Architect   -> Grok 4.5 (via xai)     (revisão de arquitetura)
 *
 * Cada subagente roda em um processo `pi` separado (contexto isolado),
 * com modelo, thinking level e conjunto de ferramentas próprios.
 *
 * Uso:
 *   /role <papel>      troca o modelo do agente principal para o papel
 *   /kickoff <objetivo>  inicia o loop non-stop (Supervisor assume o controle)
 *   run_agent (tool)   usada pelo Supervisor para despachar subagentes
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
  tools: string[]; // ferramentas do subagente
  systemPrompt: string; // instruções de papel (appended ao system prompt)
  label: string;
}

const ROLES: Record<Role, RoleSpec> = {
  supervisor: {
    model: "openrouter/openai/gpt-5.6-sol",
    thinking: "high",
    tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
    systemPrompt: "Você é o Supervisor. Planeje, despache workers, revise, faça merge e valide até atingir a Definition of Done.",
    label: "Supervisor (GPT-5.6 Sol · high)",
  },
  worker: {
    model: "openrouter/deepseek/deepseek-v4-pro-0813",
    thinking: "high",
    tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
    systemPrompt: [
      "Você é um worker (DeepSeek V4 Pro). Implemente a tarefa recebida de ponta a ponta, de forma autônoma.",
      "Use read/edit/write/bash conforme necessário. Ao terminar, rode o build e os testes relevantes.",
      "Saída final:",
      "## Completed - o que foi feito",
      "## Files Changed - lista de arquivos alterados",
      "## Notes - informações para o reviewer (arquivos-chave, decisões)",
      "Não pare até concluir a tarefa.",
    ].join("\n"),
    label: "Worker (DeepSeek V4 Pro · high)",
  },
  reviewer: {
    model: "openrouter/google/gemini-3.7-flash",
    thinking: "high",
    tools: ["read", "grep", "find", "ls", "bash"],
    systemPrompt: [
      "Você é um code reviewer sênior (Gemini 3.7 Flash). Revise as mudanças recentes.",
      "Bash somente leitura: git diff, git log, git show. NÃO modifique arquivos nem rode builds.",
      "Saída final:",
      "## Critical (must fix) - com arquivo:linha",
      "## Warnings (should fix)",
      "## Suggestions (consider)",
      "## Verdict - APPROVE ou REQUEST CHANGES",
      "Seja específico com caminhos e números de linha.",
    ].join("\n"),
    label: "Reviewer (Gemini 3.7 Flash · high)",
  },
  merger: {
    model: "openrouter/deepseek/deepseek-v4-pro-0813",
    thinking: "high",
    tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
    systemPrompt: [
      "Você é um merger (DeepSeek V4 Pro). Resolva conflitos e integre as mudanças.",
      "Use git status/git diff para entender o estado, edite conflitos e rode build/testes ao final.",
      "Saída final:",
      "## Merged - o que foi integrado/resolvido",
      "## Conflicts Resolved - conflitos tratados",
      "## Verification - build/testes executados e resultado",
      "## Files Changed - arquivos alterados",
    ].join("\n"),
    label: "Merger (DeepSeek V4 Pro · high)",
  },
  architect: {
    model: "xai/grok-4.5",
    thinking: "high",
    tools: ["read", "grep", "find", "ls"],
    systemPrompt: [
      "Você é um arquiteto de software (Grok 4.5). Revise a arquitetura da solução, sem editar nada.",
      "Analise módulos, contratos/interfaces, acoplamento, segurança e escalabilidade.",
      "Saída final:",
      "## Architecture Assessment",
      "## Risks",
      "## Recommendations",
      "## Verdict - APPROVE ou REQUEST CHANGES",
    ].join("\n"),
    label: "Architect (Grok 4.5 · high)",
  },
};

const SUBAGENT_ROLES: SubRole[] = ["worker", "reviewer", "merger", "architect"];

const MAX_CONCURRENCY = 4;
const OUTPUT_CAP = 50 * 1024; // 50 KB visíveis para o modelo por tarefa

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
  return `${truncated}\n\n[truncado: ${byteLength - Buffer.byteLength(truncated, "utf8")} bytes omitidos]`;
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
        onProgress?.(finalText(messages) || "(trabalhando...)");
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
  description: "Papel do subagente: worker (implementa), reviewer (revisa), merger (integra/merge), architect (revisa arquitetura)",
});

const RunAgentParams = Type.Object({
  role: Type.Optional(RoleEnum),
  task: Type.Optional(Type.String({ description: "Tarefa a delegar (modo single)" })),
  tasks: Type.Optional(
    Type.Array(
      Type.Object({
        role: RoleEnum,
        task: Type.String({ description: "Tarefa a delegar" }),
      }),
      { description: "Array de {role, task} para execução paralela (workers independentes)" },
    ),
  ),
  cwd: Type.Optional(Type.String({ description: "Diretório de trabalho do subagente (default: cwd atual)" })),
});

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.notify(
        `Orquestrador: /kickoff <objetivo> · /role supervisor|worker|reviewer|merger|architect`,
        "info",
      );
    }
  });

  pi.registerTool({
    name: "run_agent",
    label: "Run Agent",
    description: [
      "Despacha uma tarefa para um subagente com modelo/thinking/tools próprios e contexto isolado.",
      "Papéis: worker (implementa), reviewer (revisa), merger (integra/merge), architect (revisa arquitetura).",
      "Use tasks[] para rodar workers em paralelo quando as tarefas forem independentes e não tocarem os mesmos arquivos.",
      "Retorna o texto final do subagente (e estatísticas de uso).",
    ].join(" "),
    promptGuidelines: [
      "Use run_agent (role=worker) para implementar; role=reviewer para revisar; role=merger para integrar; role=architect para revisar arquitetura.",
      "Rode workers em paralelo (tasks[]) quando as tarefas forem independentes; nunca paralelize tarefas que editam os mesmos arquivos.",
    ],
    parameters: RunAgentParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const cwd = params.cwd ?? ctx.cwd;
      const hasSingle = Boolean(params.role && params.task);
      const hasTasks = (params.tasks?.length ?? 0) > 0;

      if (hasSingle === hasTasks) {
        return {
          content: [{ type: "text", text: "Forneça exatamente um modo: {role + task} OU {tasks: [...]}." }],
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
            const status = failed ? `falhou${r.stopReason ? ` (${r.stopReason})` : ""}` : "ok";
            return `### ${r.role} [${status}]\n${failed ? (r.errorMessage || r.stderr || r.output) : truncate(r.output)}`;
          })
          .join("\n\n---\n\n");

        return {
          content: [{ type: "text", text: `Paralelo: ${ok}/${results.length} concluídos.\n\n${summaries}` }],
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
              ? `[${result.role}] falhou${result.stopReason ? ` (${result.stopReason})` : ""}: ${result.errorMessage || result.stderr || result.output}\n\n${usage}`
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
      ctx.ui.notify(`Modelo não encontrado: ${spec.model}`, "error");
      return false;
    }
    const ok = await pi.setModel(model);
    if (!ok) {
      ctx.ui.notify(`Sem credencial para ${spec.model}`, "error");
      return false;
    }
    pi.setThinkingLevel(spec.thinking as any);
    ctx.ui.notify(`Papel: ${spec.label}`, "info");
    return true;
  }

  pi.registerCommand("role", {
    description: "Troca o agente principal para um papel (supervisor|worker|reviewer|merger|architect)",
    getArgumentCompletions: () =>
      (Object.keys(ROLES) as Role[]).map((r) => ({ value: r, label: ROLES[r].label })),
    handler: async (args, ctx) => {
      const role = (args || "").trim().toLowerCase() as Role;
      if (!ROLES[role]) {
        ctx.ui.notify("Uso: /role supervisor|worker|reviewer|merger|architect", "error");
        return;
      }
      await applyRole(ctx, role);
    },
  });

  pi.registerCommand("kickoff", {
    description: "Inicia o workflow non-stop (Supervisor assume o controle)",
    handler: async (args, ctx) => {
      const goal = (args || "").trim();
      if (!goal) {
        ctx.ui.notify("Uso: /kickoff <objetivo>", "error");
        return;
      }

      const ok = await applyRole(ctx, "supervisor");
      if (!ok) return;

      const prompt = [
        `KICKOFF — objetivo: ${goal}`,
        "",
        "Siga o protocolo de orquestração non-stop do AGENTS.md. A partir de agora você é o Supervisor.",
        "",
        "1. Planeje: leia o repositório, entenda o objetivo e divida em tarefas pequenas e verificáveis.",
        "2. Despache workers: use a ferramenta run_agent (role=worker). Use tasks[] para rodar em paralelo quando as tarefas forem independentes e não editarem os mesmos arquivos.",
        "3. Revise: use run_agent (role=reviewer) sobre o que foi implementado.",
        "4. Corrija/integre: use run_agent (role=merger) para resolver conflitos e aplicar correções.",
        "5. Valide arquitetura: use run_agent (role=architect) quando houver mudanças estruturais.",
        "6. Verifique: rode build/testes com bash. Faça commit a cada iteração estável.",
        "",
        "NÃO pare entre etapas. Continue o loop até a Definition of Done ser atingida.",
        "Se algo falhar, diagnostique, corrija e continue. Só pare se estiver genuinamente bloqueado (ex.: falta informação que apenas o usuário pode fornecer) — nesse caso reporte exatamente o que precisa.",
        "",
        "Definition of Done: código implementado, build/testes passando, revisado e commitado.",
      ].join("\n");

      pi.sendUserMessage(prompt);
    },
  });
}
