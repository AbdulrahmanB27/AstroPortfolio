# AGENTS.md — Multi-Agent Team Protocol

All agents working on this project MUST read `CLAUDE.md` before starting any task.
All agents MUST read `tasks/lessons.md` before modifying code.

---

## Team Structure

### Lead / Orchestrator
**Model:** Claude Opus 4.6
**Role:** Architecture decisions, complex debugging, code review, quality gates, task routing
**When to use:** Ambiguous requirements, cross-cutting concerns, final sign-off

### Fast Executor
**Model:** Claude Sonnet 4.6
**Role:** Lint fixes, simple refactors, file search, straightforward implementations
**When to use:** Well-defined tasks with clear scope, bulk edits, formatting

### Researcher / Analyst
**Model:** Gemini 3.1 Pro (when available via IDE or MCP)
**Role:** Large context analysis, alternative architecture perspectives, documentation
**When to use:** Analyzing large files, comparing approaches, generating docs

---

## Task Routing Rules

| Task Type | Preferred Model | Effort Level |
|---|---|---|
| Architecture / design decisions | Opus 4.6 | max |
| Complex bug investigation | Opus 4.6 | max |
| Code review | Opus 4.6 | high |
| Simple bug fixes (clear root cause) | Sonnet 4.6 | medium |
| Lint / formatting / unused imports | Sonnet 4.6 | low |
| File exploration / search | Sonnet 4.6 | low |
| Straightforward feature (< 3 files) | Sonnet 4.6 | medium |
| Multi-file feature (3+ files) | Opus 4.6 | high |
| Large codebase analysis | Gemini 3.1 Pro | high |
| Documentation generation | Gemini 3.1 Pro | medium |
| Performance profiling analysis | Gemini 3.1 Pro | high |

---

## Agent Protocols

### Before Starting Any Task
1. Read `CLAUDE.md` — follow all guidelines
2. Read `tasks/lessons.md` — avoid known pitfalls
3. Check `tasks/todo.md` — understand current state
4. Read relevant source files before modifying them

### During Work
- Track progress in shared task list
- Report blockers immediately to the lead
- Follow the project's development philosophy (simplicity, minimal surface area)
- Never introduce server dependencies (static site only)

### After Completing Work
- Verify the build passes (`npm run build`)
- Run lint (`npm run lint`) and address real issues
- Update `tasks/lessons.md` if a new pattern was discovered
- Mark task complete in the shared task list

---

## Coordination Rules

- Only ONE agent modifies a given file at a time
- The lead resolves conflicts and makes architectural calls
- Agents must not over-engineer — follow CLAUDE.md's simplicity principle
- When uncertain, ask the lead rather than guessing
- All agents use Zustand selectors (`useStore((s) => s.field)`), never full store subscription
- Per-frame 3D data goes in `planetRegistry.js`, never Zustand

---

## Project Quick Reference

**Stack:** Vite 7 + React 19 + Three.js (R3F 9) + GSAP 3 + Zustand 5
**Stage flow:** SURFACE -> LIFTOFF -> ORBIT <-> STAR_CORE / PLANET
**Data:** `src/data/data.json` (static, no backend)
**Dev:** `npm run dev` (localhost:5173)
**Build:** `npm run build` (dist/)
