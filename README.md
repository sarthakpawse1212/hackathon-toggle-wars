# Cancel-Flow Experiment

A small Flagsmith experimentation project for the WeMakeDevs × Flagsmith Toggle Wars hackathon.

## Experiment

The existing `cancel_flow` flag serves three experiences: one-click cancellation (`control`), an inline one-month pause offer (`pause`), and an inline 30% discount for three months (`discount`). Cancellation remains one click away and equally visible in every variant.

The primary metric is `subscription_retained`. `complaint_submitted` is an independently analyzed guardrail calculated from per-user outcomes; this project does not assume Flagsmith reports it as a second experiment metric.

**All user behavior is simulated.** Outcomes demonstrate the event pipeline and the stated model; they are not real customer data or evidence about actual subscribers.

## Current implementation

**Progress as of 26 Nov 2026:** Phase 1 backend and mocked verification are complete. TypeScript validation passes and all 11 unit tests pass. No live Flagsmith exposure or conversion has been verified.

- [x] Local Flagsmith Docker setup and existing `cancel-flow` project
- [x] Existing `cancel_flow` flag and variants
- [x] Experiment design and pre-registered decision rule
- [x] TypeScript/Fastify API with mockable Flagsmith adapter
- [x] Unit tests for request validation, identity consistency, duplicate events, and cancellation visibility
- [ ] Run an approved pilot against a started Flagsmith experiment
- [ ] Traffic simulator and results analysis

The latest `npm install` reported 6 dependency advisories (1 moderate, 3 high, 2 critical); they have not been triaged.

No experiment is created or started by this application. Creating an experiment starts it immediately, so that remains a separate approval-gated step.

## Local development

Requires Node.js 20 or later. Install dependencies:

```powershell
npm install
```

Use the ignored `.env` file for local settings. Compare with [.env.example](.env.example), but do not overwrite an existing `.env` file. Set `FLAGSMITH_SERVER_KEY` to the local server-side environment key; never commit or print it. The local API and event URLs in the example use the Flagsmith database warehouse endpoints.

Start the API:

```powershell
npm run dev
```

The server listens on port 3000 by default. Routes:

- `GET /healthz`
- `GET /account/cancel?uid=u_demo_1` — JSON when sent `Accept: application/json`, otherwise the accessible HTML experience
- `POST /account/cancel/action` — JSON body `{ "uid": "u_demo_1", "action": "cancel" }`
- `POST /account/complaint` — JSON body `{ "uid": "u_demo_1" }`, valid only after cancellation

The service stores flow state in memory. Restarting it clears that state. No database, auth, simulator, results script, or rollout script is included in this phase.

Run checks:

```powershell
npm run typecheck
npm test
```

The unit tests mock Flagsmith and do not require a running experiment. They do not establish that real exposures or conversions reached the Flagsmith dashboard.

## Project docs

- [Experiment design](docs/experiment-design.md)
- [Project brief](docs/cancel-flow-experiment-brief.md)
- [Windows Flagsmith local setup](docs/flagsmith-local-setup-windows.md)
