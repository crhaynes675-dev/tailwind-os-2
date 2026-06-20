# Tailwind OS3 — `web/`

Fresh rebuild of the app around the **Tailwind OS3 process map**.
React + TypeScript + Vite + Tailwind CSS v4. Reuses the existing AWS
backend (Cognito + API Gateway + DynamoDB) — wired in a later phase.

The legacy single-file app still lives at `../frontend/index.html` and
stays live until OS3 is ready to cut over.

## Run

```bash
cd web
npm install      # first time
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

## Structure

```
src/
  domain/          ← the OS3 spec, encoded (single source of truth)
    status.ts        6-state Status Architecture (the backbone) + legacy mapping
    lifecycle.ts     14-stage Core Job Lifecycle
    modules.ts       11 modules → navigation
    workflows.ts     13 workflows with per-step owner / input / output gates
  data/
    jobs.ts          Job type + seed data (swapped for live API in Phase 2)
  components/
    Layout.tsx       top bar + module nav
  pages/
    Dashboard.tsx    Dashboard Hub — stat tiles + 6-state pipeline board
    ModuleStub.tsx   placeholder for unbuilt modules; renders their workflow spec
  App.tsx            router
```

## Phase plan

1. ✅ Status/lifecycle backbone + Dashboard Hub  ← **current**
2. Navigation into the 11 modules (routes done; screens are stubs)
3. Build out partial workflow screens (Schedule, Dispatch, Installation, Post-Install, Routing, Reporting)
4. Build net-new modules: Delivery, Service (incl. Leak Diagnostic)
5. Wire live API/auth; migrate data; cut over from legacy app
