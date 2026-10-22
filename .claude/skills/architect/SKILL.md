---
name: architect
description: Design the shape of a feature before writing code — data model, who may do what, which module owns which rule, entry points and test seams — by sketching two structurally different designs, screening them for red flags, and writing the chosen one down as the contract to build against. Use for /architect, "architect this", "design this before we build it", or when a PRD prompt (architect_prd) asks for the architect skill.
---

# Architect

Decide the shape of a feature before any of it is coded: which tables, who may do what, which module owns which rule, which entry points the tests hit. Without a shared shape, every piece of the work invents its own, and the shape that wins is whichever was copied first.

**Input:** what to build — a spec, a PRD, an issue, or a description — and optionally a path to write the design to. For a redesign, also the previous design and the departures from it. If the spec leaves behaviour undecided (what happens on bad input, who may do what), ask before designing: a design built around a guess bakes the guess in.

**Output:** one design document, shaped by [`references/architecture-template.md`](references/architecture-template.md), written to the given path, or into the conversation when none is given. No production code, no schema or migration files.

Track the four phases: Ground, Sketch, Choose, Write.

## Phase 1: Ground

Learn the system the design plugs into. Naming a file is not grounding; know how the nearest existing feature works end to end.

- **The rules.** The root `AGENTS.md` and the `AGENTS.md` of every package the design touches. They hold the conventions the design must follow; this skill does not repeat them.
- **What exists.** The schema (`get_database_summary` and related makerkit MCP tools, or the schema files directly) and the feature packages. Note what the kit already provides — accounts, memberships, roles, permissions, billing, notifications — so the design reuses it instead of rebuilding it.
- **The nearest exemplar.** The existing feature most like this one, traced from route to service to database. Use a read-only sub-agent if your tool has one, or read it yourself.

Write down, in a few bullets, what the design must honour: what to reuse, the exemplar's file paths, the conventions that bind, and anything the spec already decided. Include the file paths so the sketches do not explore again.

Skip this phase only when there is genuinely nothing to integrate with.

## Phase 2: Sketch twice

Produce at least **two structurally different** candidates, even when the first looks fine. Different means a different shape — where state lives, who owns which rule, how many modules — not the same shape with renamed files.

**Fast path.** When the feature is a couple of tables with plain create/read/update/delete, no outside service, no background work and no new permission, sketch both candidates yourself, one after the other. The second is still required and still goes in "Alternatives considered".

**Otherwise**, run two Plan agents in parallel. If your tool has only general-purpose sub-agents, use those and tell them the work is read-only. If it has none, write the two candidates yourself, one after the other, from the two briefs. Give each sketcher the spec itself (not a pointer to it: they may not have the same tools), the Phase 1 bullets, and the template as the required output shape. Give each a different brief, chosen to pull the designs apart, for example:

- **Extend** what exists (next to the closest existing feature, reusing its pieces) vs. **own module** (self-contained, one deep service, a narrow public API).
- **Database-heavy** (constraints, triggers, SQL functions and policies carry the rules) vs. **service-heavy** (thin tables, rules in a service, the database only enforcing tenancy).
- **Synchronous** (everything in the request) vs. **deferred** (a job, queue or webhook does the slow or external part).

Each candidate, in this order:

1. The **usage first**: the call sites that will be written — the page, the action a form calls, the component — in the kit's real idiom. The types are derived from this, not the reverse.
2. The **data model**: the entities, and who may read and change what.
3. The **interfaces**: the modules, their public signatures with `throw new Error('not implemented')` bodies, and the entry points.
4. The **test seams**: for each piece of the work, the public entry points its tests exercise and what each test proves.

Candidates live in the conversation, never in the repo.

## Phase 3: Choose

1. Screen every candidate against [`references/design-red-flags.md`](references/design-red-flags.md). A red flag means revise the candidate or drop it.
2. Judge as if the next contributor is an agent that opens one file, copies the nearest example and takes the shortest path that compiles. Prefer the design where the change that looks right from one file is right for the whole feature.
3. Compare the survivors on **interface depth**: how much rule and complexity sits behind how small a surface. Prefer one module that owns a rule over three call sites that each re-check it.
4. Pick a base and graft the best parts of the other. Name what you took, what you rejected and why.
5. If the user asked for a checkpoint ("with checkpoint", "show me first"), present the chosen design and its main alternative and wait. If the user pushes back on the shape at any point, treat it as new grounding and return to Phase 2.

## Phase 4: Write

Write the chosen design per the template, including the "Choice" and "Alternatives considered" sections. Keep it to what the people and agents building it need: one or two pages. Report the chosen shape, the rejected alternative, any open questions, and where the document is.

The document is the contract. Whoever implements it surfaces departures from it instead of absorbing them silently: a parameter the design did not anticipate means the design was wrong, a requirement was missed, or the implementation is overreaching.

## Redesign work already under way

When run on work already under way, read what was built and what departed from the design first. One departure is information; the same kind of departure in two or more places means the shape is wrong. Other tells:

- Escape hatches: `any`, casts, optional fields that are always set, a privileged client creeping in to get around a policy.
- Callers that must know a module's internal rules, or re-check a permission the module should own.
- Permissions or columns patched piece by piece to make the next one fit.
- Each new edge case needing its own special branch.

A few edge cases do not condemn a design; complexity in the domain is not complexity in the shape. If the shape still holds, say so and stop. When it is wrong: ground again on what is built (the code, not the old document), redesign as if today's constraints had been known from the start, and make the new design smaller than the old one before it grows. Then run Phases 2–4 again, and say in "Choice" what the new design replaces and which built parts must move.

## Credits

Adapted from the idea of the `architect` skill in Cursor's pstack plugin
