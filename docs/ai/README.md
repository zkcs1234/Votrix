# Votrix AI Documentation

> **Entry point for AI coding agents.** Read this file first, then `AI_CONTEXT.md`.

---

## Purpose

This folder contains documentation written **for AI agents**, not humans. The goal is to let future AI sessions understand the entire Votrix codebase by reading these files instead of scanning source code — reducing token usage while maintaining accuracy.

---

## Contents

| File | Purpose |
|------|---------|
| `README.md` | This file — start here |
| `AI_CONTEXT.md` | **Master summary — always read second** |
| `SYSTEM_ARCHITECTURE.md` | Architecture, auth flow, request lifecycle |
| `FEATURES.md` | All features with status, files, endpoints |
| `DATABASE.md` | Complete schema: tables, columns, relations, indexes |
| `API.md` | Every API endpoint documented |
| `REALTIME.md` | WebSocket server, rooms, events |
| `BUSINESS_RULES.md` | Voting rules, permissions, lifecycle, validation |
| `UI_UX.md` | Pages, layouts, components, states |
| `PROJECT_STRUCTURE.md` | Folder responsibilities |
| `DEPENDENCIES.md` | All packages with purpose and usage |
| `CHANGELOG_AI.md` | AI-focused changelog (append-only) |
| `KNOWN_ISSUES.md` | Bugs, debt, security concerns |
| `TODO_AI.md` | Prioritized task list |

---

## Reading Order for AI Agents

1. **Always read `AI_CONTEXT.md` first** — it gives you the full picture in one file.
2. Read the specific file relevant to your task:
   - Changing DB schema → `DATABASE.md`
   - Adding/changing an API endpoint → `API.md`
   - Frontend UI work → `UI_UX.md`
   - Business logic → `BUSINESS_RULES.md`
   - Realtime/WebSocket work → `REALTIME.md`
3. After completing changes, **update every affected file** plus `CHANGELOG_AI.md`.

---

## Update Workflow

When the project changes:

1. Read `README.md` (this file)
2. Read `AI_CONTEXT.md`
3. Read only the docs files relevant to the requested feature
4. Implement the change
5. Update all affected docs files:
   - DB change → `DATABASE.md`
   - API change → `API.md`
   - Feature added/changed → `FEATURES.md`
   - Realtime change → `REALTIME.md`
   - Business logic change → `BUSINESS_RULES.md`
   - UI change → `UI_UX.md`
6. Always update `CHANGELOG_AI.md` and `AI_CONTEXT.md` if affected

---

## Documentation Standards

- Every file includes **Last Updated**, **Documentation Version**, **Related Files**, and **Related Documentation**
- Never duplicate information between files — cross-reference instead
- Base documentation only on **actual code** — never invent features
- If information is unknown or unclear, write `Unknown`
- Keep all files synchronized with the codebase at all times

---

**Last Updated:** 2026-07-04  
**Documentation Version:** 1.0.0
