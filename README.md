# Cancel-Flow Experiment

A small Flagsmith experimentation project for the WeMakeDevs × Flagsmith Toggle Wars hackathon.

## Experiment

The existing `cancel_flow` flag serves three experiences: one-click cancellation (`control`), an inline one-month pause offer (`pause`), and an inline 30% discount for three months (`discount`). Cancellation remains one click away and equally visible in every variant.

The primary metric is `subscription_retained`. `complaint_submitted` is an independently analyzed guardrail calculated from per-user outcomes; this project does not assume Flagsmith reports it as a second experiment metric.

**All user behavior is simulated.** Outcomes demonstrate the event pipeline and the stated model; they are not real customer data or evidence about actual subscribers.

## Current implementation

**Progress as of 27 Nov 2026:** Phase 1 and the Phase 2 persona model/simulator are implemented. TypeScript validation passes and all 21 unit tests pass. The simulator uses synthetic identities, a reproducible seed, Flagsmith-served arms, and explicitly labeled CSV outcomes. No live Flagsmith exposure or conversion has been verified.

- [x] Local Flagsmith Docker setup and existing `cancel-flow` project
- [x] Existing `cancel_flow` flag and variants
- [x] Experiment design and pre-registered decision rule
- [x] TypeScript/Fastify API with mockable Flagsmith adapter
- [x] Enrollment protection: non-enrolled identities see control, are logged, and produce no conversion events
- [x] Unit tests for request validation, identity consistency, enrollment handling, duplicate events, and cancellation visibility
- [x] Seeded persona/outcome model and HTTP simulator with randomized request order and CSV output
- [ ] Run an approved pilot against a started Flagsmith experiment
- [ ] Results analysis and run after explicit live-experiment approval

The latest `npm install` reported 6 dependency advisories (1 moderate, 3 high, 2 critical); remediation is deferred for now.

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

The service stores flow state in memory. Restarting it clears that state. No database, auth, results analysis script, or rollout script is included.

### Run the disclosed simulator

Start the API in one terminal, then in another run:

```powershell
npm run simulate -- --users 6000 --seed 42 --timeout-ms 10000 --base-url http://localhost:3000
```

If omitted, `--run-id` is generated uniquely and printed with the output path. Before any API request, the simulator exclusively reserves the run ID in `results/.<run-id>.reservation.json` and checks that the CSV and partial-output paths are free. A run ID is never reusable: completed and failed markers remain, and an interrupted process leaves its marker in `running` state. Do not delete or reuse a marker. For an explicit `--run-id`, any existing marker or output causes the simulator to stop before contacting the API. `--timeout-ms` defaults to 10000; timed-out requests are aborted, reported with the identity, and not retried.

The simulator requests each identity's actual arm before simulating behavior, randomizes request order, and only publishes the CSV after all requests succeed. Output is written as `results/<run-id>.csv`; every row is marked `simulated=true`. Retention and complaint rates include enrolled identities only. If the experiment is not running, identities may fall back to control and conversion events will not be tracked; the script reports those identities separately. A live pilot and any experiment creation/start remain approval-gated.

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
