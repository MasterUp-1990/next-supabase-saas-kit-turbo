# Architecture template

The shape of each candidate in Phase 2 and of the design document written in Phase 4. Each section names the decisions a design must make; the rules for making them live in the `AGENTS.md` files read while grounding. Replace the italic notes; drop a section only when it truly has nothing in it, and say so in one line.

## Problem

*One paragraph: what the spec asks for, and what in the existing system or the spec's decisions makes the shape non-obvious. Name the constraints found while grounding: what to reuse, callers that must not break, invariants the design must keep.*

## Usage

*Written first. Two or three call sites the implementation will contain, in the kit's idiom: what reads the data, what a form calls, what renders it. What they import, what they pass, what comes back. Everything below is derived from this; if they disagree, fix the shape, not the usage.*

## Data model

*Decide, for each entity:*

- *What it holds and how it relates to the others, including which account owns it.*
- *Whether it belongs to team accounts, personal accounts, or both.*
- *Who may read, create, change and delete it, and which columns a user may change. Name any permission that does not exist yet.*
- *What needs a paid plan or a quota, and where that is checked.*
- *Rules the database itself enforces (constraints, triggers, functions), and any that must run with elevated privileges, with why.*

## Interfaces

*The modules and their public signatures, with `throw new Error('not implemented')` bodies and a one-line comment stating the rule each owns. The entry points (pages, actions, routes, webhooks) and what each accepts. Where each lives. What the public surface hides, and why it is no larger. What the feature must be wired into to be reachable (navigation, paths, translations, flags).*

## Work and test seams

*One line per piece of work, keyed by story id when the spec has them: what part of the shape it builds, and its test seams — the entry points its tests exercise and what each test proves (access rules, service rules, the flow a person tries). Put shared groundwork (the schema, a module skeleton) first, as its own piece.*

## Choice

*Which candidate is the base, what was taken from the other, and what was rejected and why. For a redesign, what the new design replaces and which built parts must move. (Only in the final document.)*

## Alternatives considered

*At least one other whole shape, with one line on why it lost, judged on interface depth: what complexity it pushed onto callers. If the constraints forced the answer, say "the only viable shape because...".*

## Tradeoffs accepted

*One bullet each: "we accept X in exchange for Y". Include anything a later reader might mistake for an oversight.*

## Open questions

*Anything the user must decide before the work it affects can start. Phrase each as a question with a recommended answer, and name the pieces of work (story ids, when there are any) it blocks.*
