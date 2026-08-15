# Protocolo de Orquestração Non-Stop (Hackathon)

## Projeto: Nightfall

**O que construímos** (norte = `docs/SPEC.md`): plataforma de jogos sociais
provably-fair com privacidade STRK20. Título âncora: **Nightfall: One Night**
(One Night Werewolf).

**Componentes**:
- `contracts/` — Cairo: Fair Game Engine (anonymizer `privacy_invoke`)
- `app/` — Next.js (starter kit STRK20)
- `keeper/` — agentes de IA jogadores (viewing key por assento, LLM decide ação/voto)
- `docs/` — SPEC + README + docs

**Decisões de produto travadas**: staked + free mode · turn-based (não real-time) ·
agentes de IA (não bots) · monetização via rake on-chain · v0 = wedge arquitetado
como plataforma reutilizável.

Este repositório usa o pi como orquestrador multi-papel. O **agente principal** é o
Supervisor e despacha **subagentes** (processos `pi` isolados) com modelos
especializados.

## Papéis

| Papel | Modelo | Thinking | Ferramentas |
|-------|--------|----------|-------------|
| Supervisor | `openrouter/openai/gpt-5.6-sol` | high | read, bash, edit, write, grep, find, ls, run_agent |
| Worker | `openrouter/deepseek/deepseek-v4-pro-0813` | high | read, bash, edit, write, grep, find, ls |
| Reviewer | `openrouter/google/gemini-3.7-flash` | high | read, grep, find, ls, bash (só leitura) |
| Merger | `openrouter/deepseek/deepseek-v4-pro-0813` | high | read, bash, edit, write, grep, find, ls |
| Architect | `xai/grok-4.5` | high | read, grep, find, ls |

Comandos: `/role <papel>` troca o modelo do agente principal; `/kickoff <objetivo>`
inicia o loop non-stop.

## Loop non-stop

Repita até a Definition of Done (v0, em `docs/SPEC.md`) ser atingida:

1. **Planejar** — leia `docs/SPEC.md`, entenda o objetivo e divida em tarefas pequenas.
2. **Implementar** — despache `run_agent` com `role=worker`. Use `tasks[]` (paralelo)
   somente para tarefas independentes que **não** editam os mesmos arquivos
   (ex.: `contracts/` e `app/` e `keeper/` podem avançar em paralelo).
3. **Revisar** — despache `run_agent` com `role=reviewer` sobre o diff (`git diff`).
4. **Integrar** — despache `run_agent` com `role=merger` para resolver conflitos e
   aplicar correções do review.
5. **Validar arquitetura** — despache `run_agent` com `role=architect` quando houver
   mudanças estruturais (novos módulos, contratos, esquemas, protocolo).
6. **Verificar** — rode build e testes com `bash`. Faça commit a cada iteração estável.

## Regras

- **Não pare entre etapas.** Só pare se estiver genuinamente bloqueado; nesse caso
  reporte exatamente o que falta e o que já foi feito.
- **Commits frequentes** — commit em cada iteração estável, com mensagem clara.
- **Workers em paralelo** — só quando disjuntos em arquivos; caso contrário, sequencial.
- **Nunca deixe a árvore quebrada** — se um merge quebrar o build, corrija antes de seguir.
- **Nunca commit secrets** — `.env`, `.env.local` e chaves ficam fora do git (`.gitignore`).
- **Definition of Done (v0)** — ver `docs/SPEC.md` §9.

## Comandos de orquestração

- `/kickoff <objetivo>` — inicia o loop non-stop.
- `/role worker|reviewer|merger|architect|supervisor` — assume manualmente um papel no agente principal.
- `run_agent` (ferramenta do modelo) — despacha subagente: `{role, task}` ou `{tasks: [{role, task}, ...]}`.
