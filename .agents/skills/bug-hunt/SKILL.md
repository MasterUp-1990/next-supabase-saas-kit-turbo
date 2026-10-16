---
name: bug-hunt
description: Multi-stage vulnerability discovery. Use when asked to "hunt bugs", "find vulnerabilities", "security harness", "deep security audit", or to run a thorough proactive security sweep of a codebase or package (distinct from PR-scoped /security-review and PR-scoped /reviewer). Stack-agnostic — works on any repo and language. Supports quick / standard / deep scan modes.
---

# Bug-Hunt Harness

A proactive, multi-stage vulnerability discovery workflow. You — the orchestrator — coordinate narrowly-scoped sub-agents through eight stages. The design comes from Cloudflare's published harness; do not paraphrase it back to the user, just run it.

**Why this works (the principles to preserve, in priority order):**

1. **Narrow scope beats exhaustive analysis.** One attack class + one code region + the architecture context = a researcher-like search. Broad "find all bugs" prompts wander.
2. **Adversarial redundancy.** Findings are validated by a separate agent whose *only* job is to disprove them. Never let the same context that produced a finding also confirm it.
3. **Separation of concerns by stage.** Discovery, validation, dedup, reachability, reporting are distinct passes — never combined.
4. **Parallelism with bounded batches.** Many small hunts in parallel, not one mega-hunt.

If a tradeoff comes up, favor these principles over speed or completeness.

---

## Inputs

- **Scope** (positional 1, optional): a path, package, or "all". Default: entire working repo.
- **Attack class filter** (positional 2, optional): comma-separated names from the menu below, or "all". Default: orchestrator picks the top 6–10 for the stack.
- **Mode** (`--mode=quick|standard|deep`, optional): intensity dial. Default: `standard`.

If the user gives no scope, infer it from recent git activity (`git diff main...HEAD --stat` and `git log -20 --oneline`) and propose it in one line before recon — but only if there's genuine ambiguity. Otherwise just start.

## Scan modes

The mode controls task count, parallelism, and which optional stages run. Pick `standard` unless the user said otherwise or the repo is tiny/huge.

| Dimension | quick | standard | deep |
|---|---|---|---|
| Recon scope | git diff + entry points only | full attack-surface map | full map + dependency/config audit |
| Static triage | scoped to changed files | full repo | full repo + history |
| Tasks dispatched | 4–10, all `high` priority | 15–40, mixed priority | 30–80, all priorities, gapfill loops twice |
| Hunter batch size | 4–6 parallel | 6–8 parallel | 8–12 parallel |
| Trace stage (Stage 7) | only for `critical`/`high` confirmed | all confirmed | all confirmed |
| Chain stage (Stage 7.5) | skip | top 5 by severity | all confirmed |

Heuristic when the user didn't specify a mode: a single PR / "what just changed" → `quick`; a full package or "do a sweep" → `standard`; "audit before launch / before raising / pen-test prep" → `deep`.

## Companion skills (hunters can request)

When a hunter's scope happens to match a well-known technology (e.g., the repo uses Supabase, Next.js, GraphQL, FastAPI), the hunter should *name the technology* in its final message. The orchestrator then loads a matching skill (e.g., a `nextjs-security` or `graphql-security` companion) for the next batch in that area. This mirrors Strix's pattern of injecting specialized skills into agents at spawn time. If no companion skill is available, proceed with the generic attack-class playbook — never block on a missing skill.

## Working directory

Create `.bug-hunt/<run-id>/` under the repo root, where `<run-id>` is `YYYYMMDD-HHMM`. All artifacts live here: `recon.md`, `tasks.jsonl`, `findings/<id>.md`, `validations/<id>.md`, `report.md`. Mention adding `.bug-hunt/` to `.gitignore` if not already present, once, at the end.

---

## Stage 1 — Reconnaissance (single agent, sequential)

Goal: produce a shared **attack-surface map** that every later hunter reads. Without this, hunters re-derive context and drift.

Launch ONE Agent (subagent_type=general-purpose). Prompt it to produce `.bug-hunt/<run-id>/recon.md` with these sections:

- **Build / run commands** — how the code is compiled, served, deployed.
- **Trust boundaries** — every place data crosses from less-trusted to more-trusted (HTTP ingress, auth gates, authorization-gated DB calls, cross-tenant boundaries, server/client split, RPC, IPC).
- **Entry points** — every HTTP route, queue consumer, scheduled job, webhook, file upload, websocket, public RPC, auth callback. Include file:line.
- **Identity & permission model** — how authn/authz work in this codebase (helpers, middleware, policy functions, JWT shape).
- **Data layer** — ORM/query builder, raw SQL surfaces, dynamic identifier handling, migration patterns.
- **External surfaces** — outbound HTTP, third-party SDKs, file system writes, subprocess execution, deserialization.
- **Likely attack surface** — the agent's read on which areas look juiciest, with file:line citations.

Tell the recon agent: "Cite files with file:line. Do not flag bugs — that's a later stage. Output a map, not opinions."

Read `recon.md` yourself before Stage 2. You'll use it to pick attack-class × scope pairings.

### Stage 1 is a living document

`recon.md` is not frozen after the recon agent finishes. Subsequent stages may discover routes, sinks, or trust boundaries the recon agent missed. To avoid concurrent-write conflicts, hunters MUST NOT edit `recon.md` directly. Instead, hunters write any new discoveries to `.bug-hunt/<run-id>/wiki-deltas/<task-id>.md` (one short bullet list per finding-adjacent observation). Between batches, the orchestrator merges deltas into `recon.md` under a `## Discovered during hunting` section. Later batches read the merged map, so coverage compounds.

---

## Stage 2 — Task generation (you, the orchestrator)

From `recon.md`, build a task list. Each task is **one attack class × one narrow scope hint**. Write all tasks to `.bug-hunt/<run-id>/tasks.jsonl`, one JSON object per line:

```json
{"id":"T01","class":"sql-injection","scope":"packages/features/data-explorer/src/api","hint":"raw query construction in column-filter handler","priority":"high"}
```

### Attack-class menu

Pick from this menu based on what `recon.md` actually surfaces. Don't run classes that don't apply.

- **Authn bypass** — session validation gaps, anonymous-allowed routes, replay. **JWT-specific:** `alg:none` accepted, asymmetric→symmetric key confusion (RS256 verified with HMAC), `kid` parameter traversal/SQLi, weak HMAC secrets, missing `exp`/`nbf`/`iss`/`aud` checks, JWE/JWS confusion.
- **Authz bypass / IDOR / BFLA** — missing ownership checks on object IDs, cross-tenant data access, server-side filter relying on client-provided ID, function-level authz gap (admin endpoint reachable by a regular session).
- **Privilege escalation** — role/rank checks that compare wrong values, ban evasion, self-promotion via mass-assign, support/impersonation features without proper gating.
- **Row-level / tenant authorization bypass** — DB policies missing or disabled where the data model demands them, privileged DB roles used from request-handling code, stored procedures that skip the caller's authorization context.
- **SQL injection** — string-built SQL, dynamic identifiers without an allowlist or sanitizer, ORM escape hatches (raw SQL builders, template-tag SQL) carrying untrusted interpolation.
- **RCE (broad)** — distinct from plain command injection. Covers: `exec`/`spawn`/`eval`/`Function`/`vm`; server-side template injection (`{{7*7}}` reaches Jinja/Twig/Handlebars/Liquid/Pug); expression languages (SpEL, OGNL); insecure deserialization chains (pickle, Java, .NET, Ruby Marshal, Node `serialize-javascript`); media-pipeline gadgets (ImageMagick, Ghostscript, ExifTool, ffmpeg, LaTeX); SSRF→FastCGI/Redis as an RCE pivot.
- **SSRF** — fetch/HTTP to user-controlled URLs, no host allowlist, redirect following, DNS rebinding, cloud metadata service reachability (169.254.169.254, GCP/Azure equivalents).
- **Path traversal / arbitrary file** — `path.join` with user input, zip-slip, archive extraction without symlink/path checks, signed-URL key smuggling.
- **Insecure file uploads** — extension / Content-Type / magic-byte mismatch bypass; SVG/HTML rendered inline as `text/html` or `image/svg+xml` enabling stored XSS; archive uploads with zip-slip or embedded symlinks; ImageMagick/Ghostscript/ExifTool/PDF-engine command execution in image-processing pipelines; `.htaccess`/`.user.ini`/`web.config` overrides re-enabling execution; direct-to-cloud presigned URLs with attacker-controlled `key`/`Content-Type`/`x-amz-meta-*`; resumable-upload protocols (tus, S3 MPU) that allow late metadata mutation.
- **XXE / XML parser abuse** — external entity expansion → local file disclosure; SSRF via parameter entities / external DTDs; billion-laughs DoS; XInclude / XSLT `document()`; SVG / Office (docx/xlsx) / SOAP / SAML / XML-RPC / PDF generators / RSS-feed importers as injection surfaces.
- **Deserialization** — `JSON.parse` of signed-but-trusted data, prototype pollution, language-specific gadget chains (handled under RCE for code-execution outcomes; here for state-corruption and authz-bypass outcomes).
- **XSS** — `dangerouslySetInnerHTML`, unescaped server templating, sanitizer misuse, DOM clobbering, mutation-XSS in sanitizers that don't normalize.
- **CSRF** — state-changing GETs, missing same-site/origin/CSRF-token checks, `SameSite=None` cookies without origin check.
- **Race conditions / TOCTOU** — check-then-act on shared state, missing DB locks on counters/balances/rate limits, parallel requests bypassing single-use tokens (coupon redemption, password reset, MFA enrollment).
- **Business logic / workflow bypass** — domain-invariant violations that don't require a payload. Examples: skipping a step in a multi-step checkout, calling `finalize` before `verify`, replaying stale `confirm` requests, refund-before-capture, coupon stacking that violates mutual exclusivity, negative/zero quantities, currency/locale rounding exploits, idempotency-key reuse across users, trial-extension via clock manipulation, seat-count off-by-one. Requires modeling the business, not just the code.
- **Information disclosure (broad)** — distinct from "Secrets exposure" below. Covers: stack traces / SQL errors / framework versions in responses; `/.git/`, `/.svn/`, `/.env`, `.bak`/`.old`/`~`/`.swp`; webpack/Vite source maps shipping internal paths or embedded env; `__NEXT_DATA__` leaking server-only props; GraphQL introspection in prod; `/metrics`, `/actuator`, `/health`, `/_profiler`, `/debug/pprof`; directory autoindex; verbose `Server` / `X-Powered-By` / `Server-Timing` headers; admin/observability UIs (Jaeger, Kibana) reachable from the internet.
- **Secrets exposure** — credentials specifically: keys/tokens in client bundles, logged tokens, env vars leaked via error pages or source maps, hardcoded `sk_live_`/`ghp_`/`xoxb-` strings.
- **Audit-log evasion** — mutations without audit, audit writes that can fail silently, audit fields the actor controls.
- **Client/server boundary violation** — server-only modules imported from client bundles (and vice-versa); secrets reachable from browser; framework-specific leaks (e.g., `getServerSideProps` data, RR7 loader data) that ship more than they should.
- **Mass assignment / over-posting** — request bodies trusted whole-cloth into DB writes, role/admin fields settable by users.
- **Open redirect / phishing** — login redirects, OAuth `state` mishandling, post-auth-callback URL trusted from query string.
- **Rate limit / abuse** — endpoints with no quota, expensive operations without backoff, login/MFA/password-reset enumerable through timing or response shape.
- **Cryptography misuse** — homemade signing, weak randomness for tokens, missing constant-time compares, CBC-without-MAC, IV reuse, deprecated algorithms.
- **Subdomain takeover / dangling DNS** — *infra class; check only if scope includes DNS or IaC.* Dangling CNAME/A/ALIAS to providers (`github.io`, `*.amazonaws.com`, `cloudfront.net`, `azurewebsites.net`, `vercel.app`, `netlify.app`, `herokudns.com`), orphaned NS delegations, CDN alternate-domain mappings without ownership verification. Chains to OAuth-redirect abuse, cookie-domain pivot, CORS bypass, and phishing on a trusted origin.

### Stack-derived hints (build these from the repo, don't hardcode)

Before generating tasks, take 60 seconds to surface stack signals from the repo itself — they sharpen scope hints far more than a generic checklist would. Look at:

- **Dependency manifest** (`package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pom.xml`, `Gemfile`, etc.) — what frameworks, ORMs, auth libs, queue clients, template engines are in use?
- **Runtime / deploy config** (`Dockerfile`, `wrangler.toml`, `vercel.json`, `serverless.yml`, `*.yaml` for k8s/CI) — where is this code hosted and what are its trust assumptions?
- **Project instructions** (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `README.md`) — call out any permission helpers, escalation gates, prior incidents, or "do not do X" rules. Prioritize tasks targeting those.
- **Test fixtures / migration history** — recent migrations and security-related tests often point at known-fragile areas.

Translate signals into scope hints for tasks — e.g., "ORM `<name>` is used; its escape hatches are `<symbols>`; grep those" beats "look for SQL injection somewhere".

Aim for **15–40 tasks** for a full repo, fewer for a single package. Tag each `priority: high|med|low` based on blast radius × likelihood from recon.

---

## Stage 3 — Hunt (parallel batches)

Process tasks in **batches of 6–8 parallel Agents** (subagent_type=general-purpose). Run higher-priority batches first. The hunters need Write access to drop findings on disk — `general-purpose` has it, `Explore` does not.

**Hunter prompt template — use this verbatim, filling braces:**

```
You are hunting one specific vulnerability class in one narrow scope.

Attack class: {class}
Scope: {scope}
Hint: {hint}
Architecture map (read this first, then the scoped code): .bug-hunt/{run-id}/recon.md

What to do:
1. Read the recon map.
2. Read the scoped code carefully — entry points, control flow, every place the trust boundary is crossed.
3. Look ONLY for {class}. Ignore other bug classes.
4. For each candidate, write a finding to .bug-hunt/{run-id}/findings/{class}-{NN}.md using the schema below.
5. Stop after 3 strong candidates OR when you've exhaustively read the scope, whichever comes first.

Finding schema (markdown):
---
id: {class}-{NN}
class: {class}
severity: critical|high|medium|low
status: candidate
locations:
  - file: path/to/file.ts
    lines: 12-34
title: one-line problem statement
---

## What
2–4 sentences. The bug and why it's a bug.

## Where
file:line citations with the relevant code quoted (≤ 15 lines).

## Trigger
How an attacker reaches this code path. Reference recon.md entry points if relevant.

## Impact
Concrete: what an attacker gains. Avoid abstract "could be exploited".

## Hypothesized fix
One paragraph, no code unless trivial.

Rules:
- Cite file:line for every claim. No file:line, no finding.
- If you're <70% confident, mark severity "low" and add a "## Uncertainty" section.
- Do NOT claim to have validated reachability — that's a later stage.
- Read-only on SOURCE CODE — do not edit any file under the repo. You MUST use Write to create findings under `.bug-hunt/{run-id}/findings/`; findings returned only as message text will be discarded.
Report in your final message: count of findings written, paths, and "no findings" if none.
```

When agents return, do NOT summarize their findings into your context — just collect the file paths and move on. The findings live on disk; reading them all into your context defeats the parallelism.

---

## Stage 4 — Validate (parallel, adversarial)

For each finding, launch a separate Agent (subagent_type=general-purpose) whose job is to **disprove** it. The validator must not see the original finding's reasoning beyond the locations and the claim.

**Validator prompt template:**

```
A previous agent claimed a {class} vulnerability exists. Your job is to DISPROVE it.

Claim: {title from finding}
Locations: {file:line list}
Read the finding at: .bug-hunt/{run-id}/findings/{id}.md
Architecture map: .bug-hunt/{run-id}/recon.md

What to do:
1. Read the locations and surrounding code independently.
2. Trace whether the trigger path actually exists end-to-end from an external trust boundary.
3. Check for framework guarantees, middleware, RLS policies, type constraints, or upstream sanitization that the original agent may have missed.
4. Write your verdict to .bug-hunt/{run-id}/validations/{id}.md.

Verdict schema:
---
id: {id}
verdict: confirmed|refuted|needs-more-info
confidence: high|medium|low
---

## Reasoning
Bullet points of what you checked and what you found.

## Evidence
file:line citations supporting your verdict.

## If confirmed
Suggested severity (you may revise the original): critical|high|medium|low, with one-sentence justification.

## If refuted
The specific reason the original claim is wrong. Be concrete — "the middleware at X already blocks this" beats "this is fine".

Rules:
- Bias toward refutation. If you can't reach the bug from an external input, refute it.
- You may NOT introduce new findings. Stay focused on this claim.
- Read-only on SOURCE CODE — do not edit any file under the repo. You MUST use Write to create the verdict at `.bug-hunt/{run-id}/validations/{id}.md`; verdicts returned only as message text will be discarded.
```

Run validations in parallel batches matching hunter batches.

---

## Stage 5 — Gapfill (you + targeted hunters)

After Stage 4, scan tasks.jsonl for under-covered areas:

- Attack classes the recon map flagged but you didn't task.
- Scopes that produced zero findings AND zero refutations (might mean the hunter punted).
- Trust boundaries in `recon.md` that no task touched.

Dispatch 3–8 more targeted hunters to fill the gaps. Same prompt template.

---

## Stage 6 — Dedupe (you)

Read all `validations/*.md` with verdict `confirmed`. Collapse findings with the same root cause into a single record. Two findings share a root cause if fixing one would close the other. Write the deduped set to `.bug-hunt/<run-id>/confirmed.jsonl`.

Don't dedupe by file — dedupe by **cause**. Two SQLi's in two endpoints sharing a vulnerable helper = one finding. Two SQLi's in two endpoints with independent string-building = two findings.

---

## Stage 7 — Trace (parallel, for library/helper bugs)

For confirmed findings in shared helpers, libraries, or middleware, launch tracing Agents to determine whether attacker-controlled input actually reaches the bug from outside.

**Tracer prompt template:**

```
A {class} bug exists in a shared helper. Determine if attacker-controlled input reaches it from an external entry point.

Bug location: {file:line}
Helper signature: {fn or symbol}
Architecture map (especially entry points): .bug-hunt/{run-id}/recon.md
Original finding: .bug-hunt/{run-id}/findings/{id}.md

What to do:
1. Find every call site of the helper (grep + read).
2. For each call site, trace backward to the nearest external trust boundary.
3. Determine whether the argument reaching the bug is user-controlled, partially controlled, or fully internal.
4. Append to .bug-hunt/{run-id}/findings/{id}.md a "## Reachability" section listing each external path with file:line.

If no external path exists, mark reachability as "internal-only" and propose downgrading severity.

Read-only on SOURCE CODE — do not edit any file under the repo. You MUST use Edit to append the `## Reachability` section to the existing finding file; reachability returned only as message text will be discarded.
```

---

## Stage 7.5 — Chain (optional, gated by mode)

Skipped in `quick`. Runs on top 5 by severity in `standard`. Runs on all confirmed in `deep`.

Individual bugs are often starting points. The question every chain agent must answer: **"What does this unlock next?"**

For each confirmed finding (sorted by severity), launch ONE Agent (subagent_type=general-purpose):

```
A {class} bug has been confirmed at {file:line}. Determine whether it can be chained with any other confirmed finding in this run, OR with a known framework behavior, to produce a higher-impact end-to-end exploit path.

Confirmed finding under analysis: .bug-hunt/{run-id}/findings/{id}.md
All confirmed findings (one-line summaries): .bug-hunt/{run-id}/confirmed.jsonl
Architecture map: .bug-hunt/{run-id}/recon.md

What to do:
1. Read the seed finding fully and the recon map's entry-points + auth model.
2. Skim every other confirmed finding's title + locations.
3. Ask: starting from the seed bug as a primitive, can you reach a higher-impact outcome by composing with another confirmed bug, or by exploiting a known framework behavior? Examples: info-disclosure → IDOR target; SSRF → internal admin endpoint; CSRF → state-changing privileged action; weak rate limit → credential stuffing → account takeover.
4. If a chain exists, append a "## Chain" section to .bug-hunt/{run-id}/findings/{id}.md describing:
   - the primitives in order (with finding IDs or framework behavior)
   - the resulting end-state (what an attacker gains end-to-end)
   - whether the chain crosses a trust boundary that the individual bugs did not cross
   - proposed combined severity (often higher than the individual seed)
5. If no chain is found, do nothing and report "no chain".

Rules:
- Only compose with CONFIRMED findings, not refuted or candidate ones.
- A chain must reach a strictly higher-impact end-state than the seed alone. "Same bug retold" is not a chain.
- Read-only on SOURCE CODE. Use Edit to append the `## Chain` section; chain analysis returned only as message text will be discarded.
```

The orchestrator should not pre-compute chains — that's the agent's job. Just dispatch one agent per seed and collect the appended sections.

---

## Stage 8 — Report (you)

Write `.bug-hunt/<run-id>/report.md`. Schema:

```markdown
# Bug-Hunt Report — <run-id>

**Scope:** ...
**Attack classes run:** ...
**Tasks dispatched:** N (high: A, med: B, low: C)
**Confirmed findings:** N — critical: A, high: B, medium: C, low: D
**Refuted:** N
**Needs more info:** N

## Summary
3–5 bullets — top themes, e.g., "Three SQLi candidates all rooted in one column-filter builder."

## Confirmed findings
For each (sorted critical → low):

### [ID] Title
- **Class:** ...
- **Severity:** ...
- **Locations:** file:line, file:line
- **Trigger:** one sentence
- **Impact:** one sentence
- **Reachability:** external | internal-only | partial
- **Chain:** if present, one sentence describing the end-state and the combined severity (else omit)
- **Suggested fix:** one paragraph
- **Full finding:** [.bug-hunt/<run-id>/findings/<id>.md](...)

## Chains (if any)
For each chain discovered in Stage 7.5, one entry naming the seed finding ID, the composed finding IDs, and the end-state in one sentence.

## Refuted (one-liners only)
- [ID] Title — refuted because ...

## Coverage gaps
Anything you didn't get to and why — so the next run can pick up.
```

In your final user-facing message: link the report, give the count of confirmed by severity, and surface the top 1–3 by name. Do not paste full findings into chat.

---

## Operational rules

- **Never run hunts and validations against the same finding in the same agent.** Always separate calls.
- **Findings live on disk.** Don't let agents return findings as message text — they must write files.
- **Cap context blowup.** If you find yourself reading >10 finding files into your context, you're doing it wrong; aggregate from on-disk schemas.
- **Read-only by default.** No agent in this harness writes to source code. Fixing is a separate, human-gated step.
- **Stop conditions.** End the run when (a) all batches complete and the report is written, OR (b) the user interrupts. Don't loop forever in gapfill.
- **Resumability.** Each stage's outputs are on disk. If interrupted, re-running picks up by detecting which artifacts already exist.

## Anti-patterns (don't do these)

- **Letting one agent both discover and validate.** The same context that produced a hypothesis cannot adversarially refute it. Always separate the agents.
- **Wide-scope hunters.** "Find SQL injection in the whole repo" is the failure mode. One attack class × one narrow scope × one architecture map.
- **Collapsing findings into chat.** Findings live on disk. If you find yourself reading >10 finding files into your context, you've defeated the parallelism.
- **Editing the source code from any hunting agent.** No agent in this harness writes to source. Fixing is human-gated.
- **Skipping the trust-boundary check.** A bug nobody can reach from outside is a code-quality issue, not a security finding. Stage 4 + Stage 7 exist for this.
- **Looping gapfill forever.** Two passes max. Coverage gaps that survive two gapfills go into the report's "Coverage gaps" section for the next run.
- **Adding stack-specific advice into this skill.** Repo-specific patterns live in the project's `CLAUDE.md` / `AGENTS.md`, or as a companion skill loaded per-task. This skill is intentionally stack-agnostic.

## When NOT to use this skill

- Single-PR review → use `/security-review` or `/reviewer`.
- "Is this one function safe?" → just read it; this harness is overkill.
- Vague "make my app secure" → ask for scope first, then run.
