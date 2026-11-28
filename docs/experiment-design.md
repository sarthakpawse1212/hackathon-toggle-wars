# Cancel-Flow Experiment Design

**Project:** WeMakeDevs × Flagsmith Toggle Wars, Track 01 — Test Something Real  
**Status (28 Nov 2026):** Phase 1 backend and Phase 2 seeded model/simulator are implemented. The user reports the local Flagsmith experiment is Running and a 40-identity synthetic pilot completed at `results/pilot_20261127_012.csv`. The reported dashboard count is 41 exposures versus 40 enrolled CSV identities; the source of the difference is unknown, and the dashboard was not independently queried here. The failed run `pilot_20261127_01` is permanently reserved and must never be reused. The 6,000-identity main simulation has not run. All user outcomes are simulated.

## Hypothesis

Offering a pause or a discount inside the cancellation flow will increase the share of cancelling users who remain subscribed, without raising the complaint rate by more than 2 percentage points over one-click cancel.

This project tests a modeled system. It does not estimate real customer behavior.

## Existing flag and variants

Use the already existing `cancel_flow` flag and `control`, `pause`, and `discount` variants. Never recreate them.

| Arm | Experience |
|---|---|
| `control` | One-click cancellation screen. |
| `pause` | Inline offer to pause for one month, with **Cancel anyway** equally visible and accessible on the same screen. |
| `discount` | Inline offer of 30% off for three months, with **Cancel anyway** equally visible and accessible on the same screen. |

Offers stay on one screen. Cancellation remains one click away, with the same size, prominence, and accessibility in every arm. Avoid guilt, friction, or misleading copy.

The reported running experiment uses the existing `cancel_flow` flag and `control`, `pause`, and `discount` variants. The planned allocation is 100%, with pause and discount allocated 33% each and the remainder assigned to control. Flagsmith's Create an Experiment documentation says variation weights sum to 100 and control takes the remainder. Do not create another experiment or alter the running configuration as part of this implementation.

## Metrics and fixed definitions

Both events are occurrence outcomes: emit only when the outcome happens and count at most once per identity. The event name must exactly match its metric's configured event. Use the same identity for exposure and event tracking.

| Metric | Role | Definition | Analysis |
|---|---|---|---|
| `subscription_retained` | **Single Flagsmith primary metric** | Emit when an exposed identity ends the flow subscribed: accepted pause, accepted discount, or chose to keep the subscription. Do not emit on cancellation. | Flagsmith experiment primary outcome; expected direction is increase. |
| `complaint_submitted` | Independently analyzed guardrail | Emit once only when a user ends the flow in cancellation and subsequently submits a complaint. | Calculate complaint rates independently from each per-user simulation outcome file; do not imply Flagsmith reports it as a second experiment metric. |

The guardrail threshold is an arm's complaint occurrence rate no more than 2 percentage points above control. If it is configured as a separate metric, its expected direction is “should not increase.” No revenue metric is in MVP scope.

## Pre-registered decision rule

After the planned sample is complete for every arm, identify treatment arms whose complaint rate is no more than **2 percentage points above control**. Among eligible treatment arms, select the arm with the highest `subscription_retained` rate only if Flagsmith reports at least **95% win probability** for that primary metric. Otherwise report **“no clear winner.”** If no treatment passes the guardrail, retain control and report that no treatment is eligible.

Apply this rule regardless of outcome. Do not stop early or change metric definitions, thresholds, personas, or probabilities after looking at results. The planning target is 2,000–3,000 simulated identities per arm (about 6,000–9,000 total), not a guarantee of statistical power.

## Simulated persona assumptions

Every persona, probability, and outcome below is a hand-authored illustrative assumption, not observed customer data or a claim about actual subscribers. The simulator draws a persona before the request, gets the arm served by Flagsmith, and only then draws behavior using the persona-and-arm probability. The model must not select or know the arm in advance.

Persona mix:

| Persona | Assumed share |
|---|---:|
| `price` — too expensive | 35% |
| `not_using` — not using the service | 30% |
| `competitor` — switching to a competitor | 20% |
| `accidental` — cancelled by accident | 15% |

Assumed probability of remaining subscribed:

| Persona | `control` | `pause` | `discount` |
|---|---:|---:|---:|
| `price` | 3% | 15% | 45% |
| `not_using` | 3% | 45% | 12% |
| `competitor` | 1% | 5% | 12% |
| `accidental` | 50% | 60% | 60% |

Assumed probability of a complaint, conditional on ending in cancellation:

| Persona | `control` | `pause` | `discount` |
|---|---:|---:|---:|
| `price` | 2% | 4% | 5% |
| `not_using` | 2% | 3% | 7% |
| `competitor` | 2% | 8% | 12% |
| `accidental` | 2% | 2% | 3% |

The brief's weighted expected rates are approximately:

| Arm | Retained | Complaints per exposed identity |
|---|---:|---:|
| `control` | 9.7% | 1.8% |
| `pause` | 28.8% | 3.3% |
| `discount` | 30.8% | 5.1% |

These expected values are arithmetic consequences of the assumptions. The intended modeled outcome is that pause passes the +2 percentage-point complaint threshold and discount fails it. This is not a result or prediction about real customers.

## Ethical and disclosure constraints

- Keep cancellation equally visible, accessible, and one click away in all three variants.
- Keep offers inline on the same screen. Do not add pages, guilt, deceptive urgency, or friction to cancellation.
- Use synthetic identities and simulated behaviors only; never use real customer data.
- Disclose prominently in the README, demo, and results that users and outcomes are simulated from stated assumptions. Present the Flagsmith measurement as a pipeline demonstration, not customer research.
- Use one stable identity for flag evaluation/exposure and every event for a user. Never reuse identities between simulation runs.
- Do not create or start an experiment or change existing Flagsmith configuration without explicit approval.

## Phase 1 implementation scope

Build a minimal TypeScript Fastify backend with the existing flag integration, in-memory per-user state, and a small accessible HTML experience plus JSON responses for a simulator. No database, authentication, payments, browser automation, simulator, results script, or rollout script in this phase.

The routes are `GET /healthz`, `GET /account/cancel?uid=...`, `POST /account/cancel/action`, and `POST /account/complaint`. Evaluate the flag at the point the experience is returned. For a response containing active-experiment metadata, serve a treatment only when `inExperiment === true`; active non-enrollees receive control and are logged. For an enabled, non-default response without running-experiment metadata, serve the recognized configured flag value as a normal rollout; it is not an experiment enrollment, so suppress conversion events. Disabled or SDK-default responses receive control. Accept only the action appropriate to the served arm; use the same `uid` throughout; record retention only for an enrolled identity whose ending state is still subscribed; permit complaints only after cancellation; prevent duplicate outcome events in process memory. Flush buffered SDK events with `close()` during graceful shutdown.

Phase 1 code and unit tests do not require a running experiment. When no experiment is running, the SDK may evaluate the normal flag configuration; only the user-reported running status and pilot are known here. Dashboard results were not independently verified as part of this code work.

## Phase 2 simulator behavior

`config/personas.ts` contains the hand-authored shares and conditional outcome probabilities above. `src/model.ts` uses a seeded PRNG for repeatable persona and behavior draws. The simulator draws each persona before requesting the API, asks the existing server for the arm, then simulates behavior for that served arm; it never chooses an arm itself. Synthetic identities are unique per run, requests are shuffled, and CSV output marks every row `simulated=true`. Non-enrolled identities are reported as fallback control and excluded from outcome rates. The simulator does not create or start an experiment.

## Simulator timeout policy

The simulator calls each identity serially. The installed `@flagsmith/nodejs` 9.5.0 implementation uses a 10-second timeout per attempt, up to three retries, and a 1-second delay between attempts: maximum 43 seconds for an SDK request. The application sets these options explicitly. The simulator caller timeout defaults to 50 seconds and rejects values below 45 seconds, retaining bounded SDK retry behavior with caller margin. This addresses the previous 10-second caller deadline; the underlying cause of that particular timeout remains unconfirmed. The failed request might have continued server-side after the caller aborted, so its possible exposure is not counted as confirmed.

## Pilot report and analysis limits

The user-reported pilot contains 40 enrolled identities: control 14 (2 retained, 0 complaints), pause 14 (2 retained, 1 complaint), discount 12 (5 retained, 0 complaints). These are synthetic modeled outcomes and descriptive rates. The results analyzer validates the completed-run marker and CSV, rejects malformed or duplicate identities, excludes non-enrolled rows, and emits a terminal summary plus `results/<run-id>.analysis.json`. It cannot calculate Flagsmith's Bayesian probability from CSV and reports that value as unavailable. Use the running experiment's Flagsmith results page for win probability, credible intervals, refresh timestamp, and SRM before applying the 95% pre-registered decision rule. Since the pilot sample is below the documented minimum evidence thresholds, do not infer a winner from the pilot. A 6,000-total run at 33% per treatment has only about 1,980 expected identities in each treatment arm; allocation randomness means this does not guarantee 2,000 per arm.

## Verified Flagsmith details

Checked against the official documentation:

- [Run an Experiment](https://docs.flagsmith.com/experimentation/run-an-experiment): the Node SDK minimum is `@flagsmith/nodejs` 9.1.0; `getExperimentFlag` records an exposure when called where the identity experiences the variation; the same identity joins exposure and conversion events; events are buffered and `close()` sends the remainder; local Flagsmith needs its API URL and, for the Flagsmith database warehouse, an events URL ending in `/api/`.
- [Create Metrics](https://docs.flagsmith.com/experimentation/create-metrics): occurrence measures whether an event occurred at least once per identity; event names must match exactly; metric direction can express that a metric should not increase; sum/mean use a numeric event value.
- [Create an Experiment](https://docs.flagsmith.com/experimentation/create-an-experiment): the wizard selects a primary metric; rollout controls enrollment; variation allocations total 100% and control receives the remainder; the Create Experiment action starts the experiment immediately; while running, the flag configuration and variations are locked.

## Installed Node SDK typing checked before implementation

The installed package resolved to `@flagsmith/nodejs` 9.5.0. Its published TypeScript declarations were inspected in `node_modules/@flagsmith/nodejs/build/esm/sdk/index.d.ts`, `types.d.ts`, and `models.d.ts`:

- `new Flagsmith({ environmentKey, enableEvents: true, apiUrl, eventProcessorConfig: { eventsApiUrl } })` is the declared configuration shape.
- `getExperimentFlag(featureName, identifier, traits?)` returns `Promise<Flag | DefaultFlag>`; `Flag.variant` is optional and its `value` may be a string, number, boolean, null, or undefined.
- This installed version declares `trackEvent(event, opts?)`, where `opts.identifier` and `opts.value` are optional. For an occurrence event, pass `{ identifier: uid }` and omit `value`.
- `close(timeoutMs?)` returns `Promise<void>` and stops polling while flushing buffered events.

The run-experiment documentation currently shows a positional Node event example, while the installed 9.5.0 declarations use an options object. Implementation follows the installed declarations and does not guess a numeric value for an occurrence event. Recheck the lockfile's exact SDK version if dependencies change.

## Lifecycle and remaining manual steps

Creating an experiment starts it immediately; the documentation does not describe a draft-only creation flow. No experiment creation/setup script is included. The running experiment status is user-reported and this project must not create another experiment or alter Flagsmith configuration. Manually review the existing dashboard results, verify metric availability, and resolve the hackathon Rules/Schedule requirements noted as unchecked in the brief. Never print or paste secret values. Do not change Docker Compose or credentials.
