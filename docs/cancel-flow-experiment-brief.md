# The Cancel-Flow Experiment — Project Brief & Build Plan

> **Purpose:** single source of truth for our Toggle Wars (Flagsmith Experimentation) hackathon project. Written for a solo developer **and** for AI coding agents. Humans: read top to bottom once, then use Section 10 (build plan) as your checklist. Agents: read Section 0 first, then everything, before writing code.
>
> **Last researched:** 25 Nov 2026. Hackathon kicks off 26 Nov 2026, 8:00 AM IST.

---

## 0. Rules for AI agents working from this file

### Current project status — 27 Nov 2026

This brief remains the project source of truth. Detailed experiment definitions live in [`docs/experiment-design.md`](experiment-design.md); implementation and local run instructions live in [`README.md`](../README.md).

- Local Flagsmith Docker setup, the `cancel-flow` project, `cancel_flow` flag, and `control`/`pause`/`discount` variants are already present. Do not recreate or alter them.
- Phase 1 backend foundation is implemented in TypeScript/Fastify with environment validation, a Flagsmith adapter, the four requested routes, an accessible HTML view, and in-memory per-identity event de-duplication. The adapter checks `flag.experiment?.inExperiment === true`; non-enrolled identities see control, are logged, and do not emit conversions.
- Tests mock Flagsmith. Typecheck passes and 21 tests pass across Phases 1 and 2 (13 were present at Phase 1 completion). No live exposures or conversions have been verified. No experiment has been created or started, and no dashboard configuration has been changed.
- Results/rollout scripts and a live pilot remain future work. The seeded simulator is implemented but has not been run against the local server or Flagsmith. Experiment creation starts it immediately; creation and starting require explicit approval.
- `.env`, Flagsmith credentials, and `docker-compose.yml` were not changed. `npm install` reported 6 dependency advisories (1 moderate, 3 high, 2 critical); remediation is deferred for now per the user's instruction.

1. **Never invent Flagsmith APIs.** Every technical claim is tagged:
   - `[VERIFIED]` — read in official docs / hackathon pages during research.
   - `[UNVERIFIED]` — from secondary sources or memory; confirm before relying on it or saying it in the demo.
   - `[TODO-CHECK]` — an implementation detail (method signature, payload field) that must be confirmed in the official docs for the exact SDK version before you code against it.
2. If a `[TODO-CHECK]` blocks you, open the doc in Section 14, read it, and **update this file** with the confirmed answer.
3. **One experiment, done well.** The hackathon FAQ says one well-designed A/B test with a clear hypothesis counts for more than many features. Do not add scope that doesn't sharpen the experiment (Section 12).
4. Keep secrets (Flagsmith keys) out of git. Use `.env` and commit `.env.example`.
5. Exposures and conversion events are joined **per identity**. Always use the identical user identifier for both.
6. **Honesty rule:** user behaviour in this project is **simulated by a model we wrote**. Never present results as real customer behaviour. Every artifact (README, video, results doc) must say so.
7. **Ethics rule:** the "cancel" option stays equally visible and one click away in **every** arm. We test *offers*, never obstruction.

---

## 1. TL;DR

| | |
|---|---|
| **Hackathon** | Toggle Wars — Flagsmith Experimentation Hackathon, online, 26–29 Nov 2026 |
| **Track** | **01 — Test Something Real** ($2,000). Solo build. |
| **Project** | Run a real Flagsmith experiment on a **subscription cancel flow**: does offering a **pause** or a **discount** keep customers **without annoying them**? |
| **Pitch (one line)** | "We tested whether offering a pause instead of cancelling saves customers or just frustrates them." |
| **Flag** | `cancel_flow`: `control` (one-click cancel) · `pause` · `discount` |
| **Primary metric** | `subscription_retained` |
| **Guardrail metric** | `complaint_submitted` (a flow that retains people by annoying them must lose) |
| **Traffic** | Simulated users with different reasons for leaving (modeled, disclosed) |
| **Why it can win** | Relatable problem, clear trade-off, simple demo, Flagsmith does real work (assigns flow, decides winner, rolls out *and* rolls back) |

---

## 2. Hackathon facts `[VERIFIED]`

Source: hackathon overview and Resources pages.

| Item | Detail |
|---|---|
| Name | Toggle Wars: The Flagsmith Experimentation Hackathon (WeMakeDevs × Flagsmith) |
| Dates | 26–29 Nov 2026, online. Hacking starts **8:00 AM IST 26 Nov**; submissions close **8:00 PM IST 29 Nov** (~84 hours) |
| Team | Solo or up to 4 |
| Cost | Free |
| Prizes | Track 01: $2,000 · Track 02: $1,000 · Track 03: PS5 + GTA 6 bundle · Bonus: AirPods for one random person who stars Flagsmith on GitHub |
| Flagsmith required | Yes, as a core part of the project |
| AI coding tools | Allowed, but you must understand and explain what you built |
| Help | Flagsmith Discord (team answers questions) |

### The official "round" structure

1. **Create a flag** — a multivariate flag holds the versions to compare.
2. **Pick a metric** — the event that counts as success (a click, a sign-up).
3. **Split the traffic** — how many users join, and how they divide.
4. **Ship the winner** — Flagsmith shows win probability per version; roll the winner out with the same flag.

Our project maps 1:1 onto these four rounds (Section 6).

### Tracks

| Track | Prize | What judges look for |
|---|---|---|
| **01 Test Something Real (ours)** | $2,000 | One experiment done well beats many features · a clear hypothesis · versions behind a flag · a metric from real events · results you can explain. Simulated traffic is fine; the experiment counts, not the app's size |
| 02 AI Agents and Feature Flags | $1,000 | CLI/API/MCP use · saves real time · human approves changes |
| 03 Build on Open Source Flagsmith | PS5 + GTA 6 | Self-hosted Flagsmith · integrations/plugins · developer tools · reusable |

### Scorecard (all tracks)

1. **Use of Flagsmith** — core to the project? Do the flags/experiments do real work?
2. **Impact** — real problem? Would a team actually use it?
3. **Creativity** — new idea, or a familiar idea taken somewhere new?
4. **Demo video** — clearly shows the problem, what was built, how Flagsmith fits.

### FAQ answers that shape our plan `[VERIFIED]`

- "Focus on the experiment" — a well-designed A/B test with a clear hypothesis and explainable results counts for more than a big app. The app only needs to be real enough to run the test on.
- Simulated users/traffic are fine: "Script the visits and events, then run the experiment on that data."

### Not yet read

- The official **Rules** and **Schedule** pages couldn't be fetched during research. `[TODO-CHECK]` Read them first for submission format, video length and repo requirements. Other WeMakeDevs hackathons required a public GitHub repo with visible commit history and a README — assume the same and **commit from hour one**.

---

## 3. Flagsmith primer

**What it is:** an open-source (BSD-3-Clause) feature flag and remote config platform. You wrap a feature in a flag and turn it on/off or change its value from a dashboard without redeploying; you can target by environment, user or segment. 15+ SDKs. Self-host with Docker/Kubernetes, or use Flagsmith Cloud. `[VERIFIED]`

**Concepts we use:**
- **Flag/feature** — a switch with an optional value (remote config).
- **Multivariate flag** — a flag with several variations, each with a percentage weight and a **key**.
- **Identity** — a user identifier; gives each user a consistent variation.
- **Environment** — experiments are scoped to an environment.

### 3.1 Flagsmith Experimentation (beta) `[VERIFIED]`

Runs A/B tests on top of existing flags: serve variations through a multivariate flag → collect events into a warehouse → read results from a built-in **Bayesian** stats engine.

Lifecycle:
1. **Connect a warehouse** (managed on Cloud; or Flagsmith's own Postgres DB / your own warehouse when self-hosting).
2. **Create metrics** — outcomes computed from events your app sends.
3. **Create an experiment** — pick the multivariate flag, how much traffic enters and how it splits, a primary metric, a hypothesis.
4. **Run it** — your app records **exposures** (who saw which variation) and **conversion events**.
5. **Analyse** — lift, credible intervals, win probability; at **95%** a banner recommends rolling out the winner.
6. **Ship the winner** — update the same flag, then clean up.

### 3.2 Reading results `[VERIFIED]`

- Results are computed **on demand**; **Refresh results** at most once every **5 minutes**; an "As of" timestamp shows freshness.
- Scorecards: **Users enrolled**, **Winning variation**, **Chance to be best**, **Lift vs control**.
- Per-variation table: **Exposures**, metric value, **Delta** vs control, **95% credible interval** (crossing zero = inconclusive), **Win probability**.
- A variation with **< 50 identities** (or **< 5 conversions** for occurrence metrics) shows **"Collecting data"**.
- **Sample ratio mismatch (SRM)** warning = traffic didn't split as configured → **don't act on the results**.
- Identities served **more than one variation** are **quarantined**/excluded; a few is normal.
- **End Experiment** freezes results and unlocks the flag. While running, **the flag is locked**.
- Metric kinds: per-user **occurrence, count, sum or mean** (no percentiles).

### 3.3 Common failure causes `[VERIFIED]`

| Symptom | Cause |
|---|---|
| No exposures | A variation has **no key**; user not identified **before** requesting the experiment flag; process exited before buffered events were sent |
| Conversions not counted | Event name doesn't **exactly** match the metric's event (case-sensitive); event sent under a **different identifier** than the exposure |
| Events not arriving (local instance) | SDK still posting to Flagsmith Cloud; set the SDK events URL to the local instance (`http://localhost:8000/api/`) |

Events are **buffered** and sent in batches — flush before the process exits.

---

## 4. Technical reference (verified from docs)

### 4.1 SDKs that can send experiment events `[VERIFIED]`

| SDK | Minimum version |
|---|---|
| JavaScript / React | `@flagsmith/flagsmith` 12.4.0+ |
| Python | `flagsmith` 6.3.0+ |
| **Node.js (our choice)** | `@flagsmith/nodejs` 9.1.0+ (older `flagsmith-nodejs` **cannot** send events) |
| Java | `com.flagsmith:flagsmith-java-client` 8.2.0+ |
| Go | `flagsmith-go-client/v5` v5.3.0+ |
| Flutter | `flagsmith` 6.2.0+ |

### 4.2 Core calls

- **Exposure:** `getExperimentFlag(<flag>, <identity>)` evaluates the flag and records a `$flag_exposure` event with the served variant — **only if** the flag exists, is enabled and the identity is enrolled in the experiment. Node form from docs: `await flagsmith.getExperimentFlag('checkout_button', 'user_42')`. `[VERIFIED]` Python equivalent: `get_experiment_flag(feature_name, identifier, traits=None)`; it skips emission for a default flag. `[VERIFIED]`
- If you evaluate in one place and render in another, call the exposure-tracking method at the point of display (e.g. `track_exposure_event`). Exposures are **deduplicated per identity+variant within a flush window**. `[VERIFIED]`
- **Conversion event:** Event names must exactly match the metric event and the same identity used for exposure must be used for conversion. The installed Node SDK 9.5.0 declaration is `trackEvent(event, opts?)`, where `opts` can contain `identifier` and optional `value`; occurrence events use `trackEvent(event, { identifier: uid })` with no value. `[VERIFIED AGAINST INSTALLED TYPES]`
- **Flush:** Await Node.js `close()` during graceful shutdown. The installed type is `close(timeoutMs?): Promise<void>` and closes polling while flushing buffered events. `[VERIFIED AGAINST INSTALLED TYPES]`

> The Run an Experiment page shows a positional Node `trackEvent` example, while the installed 9.5.0 TypeScript declaration uses an options object. The implementation follows the installed declaration. Recheck if the lockfile changes.

### 4.3 Existing Flagsmith configuration and experiment lifecycle

The local `cancel-flow` project, `cancel_flow` multivariate flag, and `control`/`pause`/`discount` variations are already configured. Use the existing resources; do not recreate or modify them as part of the current phase.

The official [Create an Experiment documentation](https://docs.flagsmith.com/experimentation/create-an-experiment) states that creating an experiment starts it immediately. No draft-only creation flow is documented. Do not create or start an experiment without explicit approval. Before any approved live setup, re-verify the current dashboard/API instructions against official documentation rather than relying on old CLI or API payload examples.

Official [Run an Experiment](https://docs.flagsmith.com/experimentation/run-an-experiment) and [Create Metrics](https://docs.flagsmith.com/experimentation/create-metrics) pages are the technical references for implementation and measurement. The local instance uses `http://localhost:8000/api/v1/` as `apiUrl` and `http://localhost:8000/api/` as `eventsApiUrl` for the Flagsmith database warehouse.

**Current measurement decision:** `subscription_retained` is the single Flagsmith primary metric. `complaint_submitted` is tracked as an event and independently analyzed from per-user simulation outcomes; do not claim Flagsmith reports both metrics in one experiment. The metrics docs confirm sum/mean use numeric event values; the experiment docs confirm the expected direction can be “should not increase” and control receives the remaining allocation. Multi-metric reporting is not assumed.

### 4.4 Hosting `[VERIFIED]`

- **Flagsmith Cloud** — managed warehouse, fastest to start.
- **Self-host** — Experimentation works in Open Source and Enterprise with no edition restriction. Set `EXPERIMENTATION_ENABLED=true` on the Flagsmith API (otherwise the Warehouse tab doesn't appear). Two storage modes: **Flagsmith database** (PostgreSQL only; evaluation use; nothing extra to run) or **your own warehouse** (ingestion service + Kafka + delivery; the repo's `docker-compose.yml` runs all experimentation services with a local ClickHouse).
- Local instance: API URL `http://localhost:8000/api/v1/`; events URL `http://localhost:8000/api/`.
- Quick start: `curl -o docker-compose.yml https://raw.githubusercontent.com/Flagsmith/flagsmith/main/docker-compose.yml && docker-compose -f docker-compose.yml up` (an admin user is bootstrapped; a password-reset link appears in the logs).

**Decision:** develop on **local Docker** (reproducible, no quota surprises, judges can re-run it); keep a Cloud project as a fallback if local warehouse setup costs more than ~2 hours. `[DECISION — revisit after Phase 0]`

---

## 5. The problem and the experiment

### 5.1 The real-life pain point

Almost everyone has fought a cancel flow.

- **Customers:** cancelling is hidden in menus, spread over several screens, or wrapped in guilt-trip copy. They feel tricked, complain, dispute charges.
- **Companies:** one-click cancel loses customers who might have stayed for a pause or a discount. But pushing save offers too hard annoys people and creates complaints and legal risk.
- **The team deciding:** a retention number alone misleads — a flow can "retain" people by frustrating them, and the bill arrives later as chargebacks and support tickets. Teams usually decide by gut feel or by copying a competitor.

**Regulatory context** (secondary sources; general summary, **not legal advice**) `[UNVERIFIED — confirm before quoting]`:
- The FTC's 2024 "Click-to-Cancel" rule was struck down by the Eighth Circuit on **8 July 2025**.
- The FTC issued an Advance Notice of Proposed Rulemaking in **March 2026** to revive it; the older ROSCA statute remains in force and has been used against Amazon Prime (2023) and Uber (2025).
- Commentary on enforcement mentions cancel flows with extra screens where "keep subscription"/"pause" buttons were more prominent than cancel. An earlier proposed rule would also have restricted "save offers", a point industry criticised.
- Sources: BCLP (jdsupra.com "I'm Not Dead Yet"), Goodwin (Feb 2026 alert), Sidley (Feb 2026 update), Jones Day (May 2026). Links in Section 14.

**Why this matters to our design:** the complaint guardrail isn't just ethics, it's risk. And it's why our "cancel" option stays equally visible in every arm.

### 5.2 Hypothesis (write this into the experiment)

> "Offering a pause (or a discount) inside the cancel flow will increase the share of cancelling users who remain subscribed, **without** raising the complaint rate by more than 2 percentage points over one-click cancel."

### 5.3 Why it's a good experiment

It has a **built-in trade-off**: retention vs annoyance. The naive metric ("who stayed?") gives the wrong answer on its own, which is exactly why a guardrail metric and a pre-registered decision rule make the result interesting and trustworthy.

---

## 6. Experiment design

### 6.1 Flag and arms

One multivariate flag `cancel_flow`, assigned **per user** (identity), server-side.

| Arm | Flag value / key | What the user sees |
|---|---|---|
| **Control** | `control` = one-click cancel | "Cancel your subscription?" → **Cancel**. One optional "Keep subscription". |
| **Variation A** | `pause` | Same screen, **inline**: "Pause for 1 month instead?" with **[Pause 1 month]** and an equally prominent **[Cancel anyway]** |
| **Variation B** | `discount` | Same screen, **inline**: "Stay for 30% off for 3 months?" with **[Take the discount]** and an equally prominent **[Cancel anyway]** |

Ethics constraints (non-negotiable): offer is **inline on the same screen** (no extra pages); "Cancel anyway" is **same size/prominence** as the offer button; no guilt-trip copy; cancel is always one click.

Allocation: 100% of users who open the cancel page enter the experiment; `pause` 33%, `discount` 33%, control the remainder. Flagsmith's experiment docs confirm control receives the remainder when variation allocations total 100%. `[VERIFIED]`

### 6.2 Metrics

Flagsmith metrics are per-user occurrence/count/sum/mean. We send an event **only when it happens**, so *occurrence rate = events ÷ exposed users*.

| Event | Role | Sent when | Direction |
|---|---|---|---|
| **`subscription_retained`** | **Primary** | The user ends the flow still subscribed (accepted pause, accepted discount, or backed out) | up |
| **`complaint_submitted`** | **Guardrail** | The user files a complaint after the flow ended in cancellation | should not increase (independently analyzed from per-user simulation results) `[VERIFIED]` |
| `retained_revenue` *(optional, stretch)* | Revenue sanity check | Sum of monthly revenue kept; discount keeps users at a lower price. Sum metrics require a numeric event value. | up `[VERIFIED; STRETCH ONLY]` |

**Definitions are fixed before the first run** (so no one can accuse us of choosing metrics after seeing results). Write them in `docs/experiment-design.md` at commit #1.

### 6.3 Pre-registered decision rule

> Ship the arm with the **highest `subscription_retained` rate** among arms whose **complaint rate is not more than 2 percentage points above control's**. Read results once, after every arm has reached the planned sample size. Require ≥ 95% win probability on the primary metric to call a clear winner; otherwise report "no clear winner".

Don't peek and stop early. Flagsmith refreshes at most every 5 minutes anyway.

### 6.4 Simulated users (modeled — disclose this everywhere)

Each simulated user has a **reason for leaving** (persona). Probabilities below are **illustrative assumptions we invented**, chosen so the trade-off is visible. Keep them in `config/personas.ts` and publish them in the README.

**Persona mix:** price 35% · not_using 30% · competitor 20% · accidental 15%.

**P(retained | persona, arm):**

| Persona | control | pause | discount |
|---|---|---|---|
| "Too expensive" (`price`) | 0.03 | 0.15 | 0.45 |
| "Not using it" (`not_using`) | 0.03 | 0.45 | 0.12 |
| "Switching to a competitor" (`competitor`) | 0.01 | 0.05 | 0.12 |
| "Cancelled by accident" (`accidental`) | 0.50 | 0.60 | 0.60 |

**P(complaint | persona, arm), given the user ended up cancelling:**

| Persona | control | pause | discount |
|---|---|---|---|
| `price` | 0.02 | 0.04 | 0.05 |
| `not_using` | 0.02 | 0.03 | 0.07 |
| `competitor` | 0.02 | 0.08 | 0.12 |
| `accidental` | 0.02 | 0.02 | 0.03 |

**Expected ground truth from this config** (computed; use it to validate the pipeline):

| Arm | Expected `subscription_retained` | Expected `complaint_submitted` (per exposed user) |
|---|---|---|
| control | ≈ 9.7% | ≈ 1.8% |
| pause | ≈ 28.8% | ≈ 3.3% |
| discount | ≈ 30.8% | ≈ 5.1% |

**Intended story:** discount retains slightly more than pause (a near tie), but triggers the most complaints (people who aren't price-sensitive get annoyed). Under the Section 6.3 rule, **pause passes the complaint guardrail (+1.5 pp) and discount fails it (+3.3 pp), so pause ships.** Control has the fewest complaints but retains almost no one.

> The story is a *consequence of our assumptions*, not a discovery about real customers. The project demonstrates a **method and pipeline**, and says so.

### 6.5 Sample size

The retention gap between pause and discount (~2 pp) and the complaint gaps (~1.8 pp) are small. A rough sample-size estimate for the complaint difference between pause and discount is **~2,000 users per arm** (≈ 6,000 total). Because simulation is cheap (HTTP-level, seconds), run **2,000–3,000 per arm**. Treat this as a planning estimate; Flagsmith uses Bayesian analysis, so judge by the credible intervals it shows. Adjust the config after the pilot if effects are too hard to detect.

### 6.6 Trust checks (show these in the demo)

1. **Exposures panel:** split ≈ 33/33/34, **no SRM warning**, few/no quarantined identities.
2. **Ground-truth check:** Flagsmith's measured rates and ordering match the expected table in Section 6.4 (within credible intervals). This proves the pipeline measures correctly.
3. **A/A sanity run (stretch):** a second flag with two identical variations shows **no** winner.
4. **Raw export:** save the per-user simulated outcomes to `results/` so anyone can cross-check Flagsmith's numbers.

### 6.7 Shipping the winner and rolling back

- **Ship:** End Experiment, then set `cancel_flow` to the winning value for 100% of users, then remove losing variations (docs recommend cleanup). `[VERIFIED]`
- **Rollback demo (nice touch):** simulate a complaint spike after rollout and flip the flag back to one-click cancel instantly, with no redeploy. This shows why the experiment lives on a feature flag.

---

## 7. Architecture

```
Simulator (Node script)                      Demo app (Node/TS, Fastify or Express)
  N users, personas, seeded RNG                     │
  for each user:                                    │
   1. GET  /account/cancel?uid=u_123  ─────────────►│ getExperimentFlag('cancel_flow', uid)   → arm + exposure
      (JSON mode: returns the offer shown)          │ render page for arm (HTML) / JSON for simulator
   2. persona model decides action                  │
   3. POST /account/cancel/action ─────────────────►│ keep | accept_pause | accept_discount | cancel
                                                    │   → trackEvent('subscription_retained', uid) if still subscribed
   4. maybe POST /account/complaint ───────────────►│ trackEvent('complaint_submitted', uid)
                                                    │
   5. at end: flush events ────────────────────────►│ close()/flush
                                                    ▼
Results reader (script) ──────────────────────► Flagsmith (local Docker or Cloud)
  refresh + fetch results via API                   • flag cancel_flow (+ keys)
  compare to ground truth                           • metrics, experiment, warehouse
                                                    • Bayesian results + dashboard
```

**Stack:** Node.js 20+, TypeScript, `@flagsmith/nodejs` (lockfile currently resolves 9.5.0), Fastify 4, and Vitest. Phase 1 delivered the backend and accessible HTML experience; Phase 2 adds the seeded persona model and HTTP simulator. React is acceptable for a later frontend if needed; it is not part of the current MVP. `[DECISION]`

**Two faces of the same app:**
- **Human-clickable UI** at `/account/cancel` so judges/video viewers can try all three flows by changing `?uid=` (the arm follows the user).
- **Machine interface** (JSON) used by the simulator — much faster than driving a browser, which makes 6,000+ users cheap.

### 7.1 Repo layout

The tree below is the intended later layout, not the exact current tree. Current files include `config/personas.ts`, `src/config.ts`, `src/experiment.ts`, `src/model.ts`, `src/cancel-page.ts`, `src/flagsmith.ts`, `src/server.ts`, `src/index.ts`, `scripts/simulate.ts`, and tests for config, server, model, and simulator, plus the package and TypeScript/Vitest configuration files. Not yet present: results reader, rollout/bootstrap scripts, generated `results/` data, and demo/results documents.

```
cancel-flow-experiment/
├─ README.md                    # problem, method, honest limits, results, how to reproduce
├─ docs/
│  ├─ experiment-design.md      # hypothesis, arms, metric definitions, decision rule (commit FIRST)
│  ├─ results.md                # numbers + Flagsmith screenshots
│  └─ demo-script.md
├─ config/
│  └─ personas.ts               # persona mix + probability tables (Section 6.4)
├─ .env.example
├─ docker-compose.yml           # local Flagsmith (+ experimentation services)
├─ scripts/
│  ├─ bootstrap-flagsmith.sh    # flag, variants, metrics, experiment via CLI/API (idempotent)
│  ├─ simulate.ts               # runs N users through the app
│  ├─ results.ts                # refresh + fetch results, compare with ground truth
│  └─ rollout.ts                # end experiment, set winner, (demo) rollback
├─ src/
│  ├─ server.ts                 # routes
│  ├─ flagsmith.ts              # SDK init, getArm(), track(), flush()
│  ├─ views/                    # control / pause / discount templates
│  └─ model.ts                  # persona decision logic (pure, testable)
├─ results/                     # raw per-user outcomes + exported Flagsmith results JSON
└─ tests/
```

---

## 8. Component specs

### 8.1 Server routes

| Route | Purpose |
|---|---|
| `GET /account/cancel?uid=` | Implemented. Calls async `getExperimentFlag('cancel_flow', uid)` once per in-memory flow. Only an enabled, non-default flag with `experiment.inExperiment === true` can serve a treatment; otherwise it logs the fallback and renders control. Returns accessible HTML or JSON when `Accept: application/json` is requested. |
| `POST /account/cancel/action` | Implemented. Validates `{uid, action}`, enforces actions appropriate to the served arm, and tracks `subscription_retained` once only for enrolled identities who finish subscribed. |
| `POST /account/complaint` | Implemented. Only accepts a complaint after cancellation and tracks `complaint_submitted` at most once only for enrolled identities. |
| `GET /healthz` | Implemented liveness route. |

Notes:
- Identity: `u_<runId>_<n>`, never reused across runs.
- State: in-memory user state per process is enough for this MVP (no database); state resets on restart.
- Order matters: **identify/evaluate before the user acts**, and use the same `uid` everywhere.
- SDK events close/flush through the Fastify shutdown hook. There is no `/admin/flush` route.

### 8.2 Simulator

Parameters: `--users 6000 --seed 42 --run-id <unique-id> --timeout-ms 10000`. The run ID is generated uniquely if omitted; explicit IDs are exclusive and may never be reused.

For each user (interleave randomly; don't run one arm first):
1. Draw persona from the mix (seeded).
2. `GET` the cancel page (JSON) → learn the arm/offer.
3. Decide using `P(retained | persona, arm)` → action.
4. `POST` the action.
5. If cancelled, draw `P(complaint | persona, arm)` → maybe `POST` complaint.
6. Log the raw outcome row to `results/<run-id>.csv` (uid, persona, arm, enrolled, retained, complaint, `simulated=true`).

At the end: flush events, wait ~1 minute, refresh results (≤ once per 5 min), fetch results.

**Rule:** the persona model **must not know the arm in advance** — the arm is whatever Flagsmith served. Otherwise the experiment is theatre.

### 8.3 Results script

- Refresh and fetch results; print per-arm retained/complaint rates, win probabilities, credible intervals.
- Compare against the expected ground-truth table computed from `config/personas.ts`; flag mismatches > tolerance.
- Export JSON to `results/`.

### 8.4 Bootstrap script

Not implemented and intentionally excluded from Phase 1. Any future setup automation must inspect and reuse the existing project, flag, and variants; experiment creation is an immediate start and requires explicit approval.

---

## 9. Demo video plan (scored — plan from day one)

Target ≤ 3 minutes (confirm length limit on the Rules page `[TODO-CHECK]`).

1. **Problem (20 s):** "Everyone has fought a cancel flow. Companies tune it by gut feel. Retention numbers can hide the damage."
2. **The experiment (30 s):** show the flag `cancel_flow` with its three arms and the hypothesis in Flagsmith. Click through the three UIs; point out Cancel is equally visible.
3. **The traffic (20 s):** simulator running; say clearly "users are simulated; here is our model" and show the persona table.
4. **Results in Flagsmith (60 s):** exposures split with no SRM; retained rates and win probability; complaint rates; apply the decision rule on screen.
5. **Ship and roll back (25 s):** end experiment, flag now serves `pause` to everyone; flip back to control to show the instant rollback.
6. **Takeaway (15 s):** "A save offer that raises retention but also complaints isn't a win. Flagsmith let us measure both and decide with data. Repo link."

Capture screenshots/GIFs of the Flagsmith pages **while running**, so no re-runs are needed for the video.

---

## 10. Step-by-step build plan (solo, ~84 h)

> Smaller than a browser-automation project, so we have slack. Use it for validation and polish, not extra features.

### Phase 0 — Before kickoff (before 26 Nov 8 AM IST)
- [ ] Register on WeMakeDevs; read **Rules** and **Schedule** pages (submission format, video length, "fresh code" rules).
- [x] Node.js 20+ is installed and local Flagsmith setup is reported complete.
- [ ] Confirm Flagsmith CLI installation and verify the Warehouse tab/connection in the dashboard during the next manual setup check.
- [x] Verify the experiment, metrics, and run docs; inspect the installed Node SDK declarations. See Section 4.2 and the status caveat on the docs' Node event signature.
- [ ] Star `github.com/Flagsmith/flagsmith`.
- ⚠ Don't write project code before the event starts if the rules prohibit pre-existing code. Prepare environment and notes only. `[TODO-CHECK rules]`

**Phase 0 status:** local Flagsmith setup is reported complete. We have not re-verified the current dashboard state in this coding session. CLI installation, hackathon Rules/Schedule, and repository pre-event rules remain unchecked.

### Phase 1 — Vertical slice (hours 0–6)
- [ ] Create repo; commit `docs/experiment-design.md` (hypothesis, metrics, decision rule) as **commit #1**.
- [x] Create the project foundation: `package.json`/lockfile, TypeScript and Vitest configuration, environment validation.
- [x] Implement the mockable Flagsmith adapter with async flag evaluation, occurrence event tracking, and `close()` on server shutdown.
- [x] Implement `/healthz`, `/account/cancel`, `/account/cancel/action`, and `/account/complaint`, including JSON and accessible HTML, validation, same-identity use, and in-memory duplicate prevention.
- [x] Run `npm run typecheck` and `npm test`: typecheck passes; 13 unit tests pass with Flagsmith mocked, including enrollment suppression and identity checks.
- [ ] Commit the project files. Current worktree has uncommitted changes; the design document is not yet a commit.
- [ ] Run a 5–10 identity live pilot and verify events in Flagsmith. This is approval-gated because the experiment must be created and starts immediately; no experiment has been created or started.
- [ ] Create the experiment setup script. **Do not implement this as part of Phase 1**: existing project/flag/variants must be reused, and no setup script may create an experiment without explicit approval.

**Phase 1 status (27 Nov 2026):** backend and mocked verification, including enrollment protection, are complete. Live Flagsmith exposure/conversion verification remains outstanding and must not be claimed yet.

### Phase 2 — Persona model and simulator (hours 6–20)
- [x] Accessible HTML for control/pause/discount with equal cancellation button styling and one-click cancellation.
- [x] Complaint route and `complaint_submitted` event tracking are implemented. Flagsmith metric setup remains unconfigured and approval-gated.
- [x] `src/model.ts` + `config/personas.ts` with deterministic sampling and probability convergence tests.
- [x] `scripts/simulate.ts` with seeded RNG, shuffled request order, synthetic identities, and labeled CSV outcomes.
- [x] Simulator requests the served arm from the server and records enrollment separately; fallback identities are excluded from outcome rates.
- [ ] Pilot run (~300 users): check split, event counts, flushing. Depends on approval to start the experiment.

**Phase 2 status (27 Nov 2026):** the model and simulator are implemented and covered by unit tests. They have not been run against the local server or Flagsmith. A live pilot remains approval-gated; no experiment has been created or started.

### Phase 3 — Real run (hours 20–36)
- [ ] Start the experiment; run 2,000–3,000 users per arm.
- [ ] Wait ≥ 1 min, refresh results (≥ 5 min between refreshes); confirm split ≈ 33/33/34, no SRM.
- [ ] `results.ts` compares with ground truth; fix any bug (most likely: identity mismatch, event naming, flushing).

### Phase 4 — Trust evidence (hours 36–54)
- [ ] Apply the pre-registered decision rule and record the outcome in `docs/results.md`.
- [ ] A/A test (stretch).
- [ ] Optional `retained_revenue` metric (stretch).

### Phase 5 — Ship and roll back (hours 54–62)
- [ ] End experiment; set `cancel_flow` to the winner for 100%; clean up losing variations.
- [ ] Record the rollback demo.

### Phase 6 — Packaging (hours 62–80)
- [ ] README (problem, method, honest limits, results, reproduce steps).
- [ ] Record and edit the demo video.
- [ ] **Fresh-clone test:** on a clean machine/folder, follow the README and reproduce a small run.

### Phase 7 — Submit (hours 80–84)
- [ ] Submit at least **4 hours before** 8:00 PM IST on 29 Nov. Leave buffer for upload problems.

---

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| "It's all fake data" | Judges discount the result | Disclose loudly; publish the model; ground-truth check; A/A run; frame the project as a **method + pipeline** |
| Experimentation is **beta**; local warehouse setup friction | Lose hours | Do local setup before kickoff; keep Cloud as fallback; ask in Discord early |
| SDK docs' Node event example differs from installed SDK typings | Events missing | Implementation follows the locked package declaration (`trackEvent(event, { identifier })` for occurrence); recheck when SDK version changes |
| Dependencies have unresolved npm audit advisories | Dependency risk | `npm install` reported 6 advisories (1 moderate, 3 high, 2 critical); triage before any production use |
| Effects too small to detect | Inconclusive result | Increase users (cheap); tune config after the pilot; remember Flagsmith shows "Collecting data" below 50 identities/5 conversions |
| Flagsmith experiment supports only one primary metric in the documented wizard | Guardrail may not appear in experiment results | Keep `subscription_retained` as the sole Flagsmith primary; calculate `complaint_submitted` independently from per-user simulation outcomes |
| Dark-pattern optics | Credibility hit | Equal button prominence; inline offers; ethics rule (Section 0) |
| Regulatory claims quoted wrongly | Credibility hit | Treat as `[UNVERIFIED]`; verify against primary sources or omit |
| Identity mismatch between exposure and event | No conversions counted | One `uid` generated once per user and used everywhere; unit test |
| Pre-existing code rules | Disqualification | Read Rules page; start repo at kickoff |

---

## 12. Scope tiers

**MVP (must ship):**
- `cancel_flow` flag with three arms; primary metric `subscription_retained`; guardrail `complaint_submitted`.
- Simulator with personas, ~6,000 users; real events in Flagsmith.
- Pre-registered decision rule applied; winner rolled out with the flag.
- README with honest limits; demo video.

**Should have:**
- Ground-truth comparison; raw CSV export; exposures/SRM shown in the demo; rollback demo; clickable UI for all three arms.

**Stretch (only if ahead):**
- A/A sanity experiment; `retained_revenue` sum metric; `resumed_after_pause` follow-up event to model delayed churn; a simple results page.

**Out of scope:** auth, payments, databases, real customer data, polished design, any feature that doesn't sharpen the experiment.

---

## 13. Submission checklist

- [ ] Registered on WeMakeDevs
- [ ] Rules page read; submission format confirmed
- [ ] Public GitHub repo with visible commit history from the start
- [ ] README: problem, hypothesis, method, **honest limits**, results, reproduce steps
- [ ] Flagsmith demonstrably core (flag assigns arm; experiment decides; same flag ships winner and rolls back)
- [ ] Screenshots from the Flagsmith experiment page (exposures, win probability, credible intervals, no SRM)
- [ ] Demo video recorded; shows problem, build, Flagsmith's role, and states that users are simulated
- [ ] Starred `github.com/Flagsmith/flagsmith` (AirPods draw)
- [ ] Submitted ≥ 4 hours before 8:00 PM IST 29 Nov

---

## 14. Links

**Hackathon**
- Overview: https://www.wemakedevs.org/hackathons/flagsmith
- Resources: https://www.wemakedevs.org/hackathons/flagsmith/resources
- Rules (read this): https://www.wemakedevs.org/hackathons/flagsmith/rules
- Schedule: https://www.wemakedevs.org/hackathons/flagsmith/schedule
- Flagsmith Discord (help): https://discord.gg/hFhxNtXzgm

**Flagsmith — product and code**
- GitHub (star it): https://github.com/Flagsmith/flagsmith
- Try Flagsmith (Cloud): https://dub.sh/flagsmith
- Docs home: https://docs.flagsmith.com/
- Experimentation overview: https://docs.flagsmith.com/experimentation
- Set up with a coding agent (official prompt): https://docs.flagsmith.com/experimentation/set-up-with-a-coding-agent
- Connect a warehouse: https://docs.flagsmith.com/experimentation/connect-a-warehouse
- Self-hosting and open source: https://docs.flagsmith.com/experimentation/self-hosting
- Create metrics: https://docs.flagsmith.com/experimentation/create-metrics
- Create an experiment: https://docs.flagsmith.com/experimentation/create-an-experiment
- Run an experiment (per-SDK code): https://docs.flagsmith.com/experimentation/run-an-experiment
- Analyse an experiment: https://docs.flagsmith.com/experimentation/analyse-an-experiment
- Statistics glossary: https://docs.flagsmith.com/experimentation/statistics
- Example — PayPal button (full walk-through): https://docs.flagsmith.com/experimentation/example-paypal-button
- Getting started with feature flags: https://docs.flagsmith.com/getting-started/feature-flags
- Docker Compose self-hosting: https://docs.flagsmith.com/deployment-self-hosting/hosting-guides/docker#experimentation
- Demo app from the demo video: https://github.com/Flagsmith/experimentation-demo-app
- Node SDK: https://github.com/Flagsmith/flagsmith-nodejs-client `[TODO-CHECK link]`

**A/B testing learning**
- How to run a real A/B test with Flagsmith Experimentation: https://www.wemakedevs.org/blogs/how-to-run-a-real-ab-test-with-flagsmith-experimentation
- Bayesian A/B testing: https://www.flagsmith.com/blog/bayesian-a-b-testing
- A/B testing in product management: https://www.flagsmith.com/blog/ab-testing-product-management
- How Flagsmith tests its own sign-up page: https://www.flagsmith.com/blog/dogfooding-experimentation
- A/B testing guide (SRM, client vs server-side): https://www.flagsmith.com/blog/ab-testing

**Cancel-flow regulatory context (secondary sources; verify before quoting)**
- BCLP via JD Supra, "I'm Not Dead Yet": https://www.jdsupra.com/legalnews/i-m-not-dead-yet-is-the-demise-of-the-1032323/
- Goodwin, Feb 2026: https://www.goodwinlaw.com/insights/publications/2026/02/alerts-practices-ba-ftcs-click-to-cancel-rule-gets-new-life
- Sidley, Feb 2026: https://www.sidley.com/en/insights/newsupdates/2026/02/us-ftc-signals-renewed-interest-in-click-to-cancel-rulemaking
- Jones Day, May 2026: https://www.jonesday.com/en/insights/2026/05/ftc-revives-clicktocancel-rule-new-risks-for-subscription-businesses
- Arnold & Porter, Feb 2026: https://arnoldporter.com/en/perspectives/advisories/2026/02/ftc-and-state-ags-continue-to-scrutinize-subscription-practices

---

## 15. Claim status register

| Claim | Status |
|---|---|
| Event dates, tracks, prizes, scorecard, FAQ (simulated traffic OK, solo OK) | `[VERIFIED]` |
| Experiment lifecycle and results semantics (50 identities / 5 conversions, SRM, quarantine, 5-min refresh, 95% banner) | `[VERIFIED]` |
| SDK minimum versions; exposure identity behavior; documented flush lifecycle; common failure causes | `[VERIFIED]` |
| Installed Node SDK 9.5.0 types for initialization, async `getExperimentFlag`, `trackEvent` options, and `close()` | `[VERIFIED AGAINST INSTALLED TYPES; see Section 4.2]` |
| CLI/API commands and payload examples in Section 4.3 | `[UNVERIFIED HISTORICAL NOTES; DO NOT RUN]` |
| Self-hosting: `EXPERIMENTATION_ENABLED=true`, DB vs warehouse modes, Docker Compose includes experimentation | `[VERIFIED]` |
| FTC/ROSCA regulatory summary in Section 5.1 | `[UNVERIFIED]` (law-firm commentary; not legal advice) |
| Persona probabilities and expected rates in Section 6.4 | **Our own assumptions**, not data |
| Whether a second metric can be reported in one experiment | Not assumed; guardrail is independently analyzed |
| Guardrail direction, sum/mean event values, and remainder allocation | `[VERIFIED]` in official Create Metrics/Create an Experiment docs |
| Rules page requirements (video length, submission format, code-before-event) | `[TODO-CHECK]` |

---

## 16. Reusable prompt for AI coding agents

> You are helping me build **the Cancel-Flow Experiment** for the Flagsmith Toggle Wars hackathon (Track 01, solo). Read `cancel-flow-experiment-brief.md` fully first. Follow the Section 0 rules: never invent Flagsmith APIs; confirm every `[TODO-CHECK]` in the official docs for the exact SDK version; stay within the MVP in Section 12; keep user behaviour clearly labelled as **simulated**; keep "Cancel" equally visible in every arm. The stack is Node.js + TypeScript with `@flagsmith/nodejs` ≥ 9.1.0. The experiment: flag `cancel_flow` (control/pause/discount) assigned per user with `getExperimentFlag`; primary metric `subscription_retained`; guardrail `complaint_submitted`; simulated personas from `config/personas.ts`; events must use the same identity as the exposure; flush events before the process exits. Current task: **<describe the task>**. Before coding, list your assumptions and which doc pages confirm them.
