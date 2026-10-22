# Design red flags

Screen every candidate before choosing. A red flag is a reason to revise the candidate or drop it. These are design mistakes, decided before any code exists; implementation mistakes are `/reviewer`'s job.

## Makerkit

Each is a mistake an agent working on one piece of the feature makes easily and a review catches late. The rules behind them are in the `AGENTS.md` files.

- **Mutable key in a mutation.** Routes address a team by slug; anything that changes data takes the immutable account id.
- **Authorization outside the database.** A rule enforced only in an action or service, while the table lets any member write directly. The database's grants and policies are the authorization layer; services may add checks, never replace them.
- **Privileged client as a shortcut.** The admin client used to get around an access rule the design should have written.
- **Team-only, or personal-only, by accident.** The design must say which accounts a feature serves, because the access helpers differ.
- **Rebuilt kit primitives.** New roles, members, permissions or subscriptions where the kit already has them.
- **Logic in the adapter.** Business rules in an action, route handler or component instead of a service.

## Shape

- **Shallow module.** A large interface hiding little. Callers call several methods in order to finish one operation, or pass options that expose internal stages. Prefer one method that does the whole job. A deep module is not a deep call chain: three layers of forwarding scatter the logic rather than hiding it.
- **Pass-through layer.** A function that forwards the same arguments to another of the same shape. Remove it unless it adds a rule, an adaptation or a real abstraction.
- **Leaked decision.** The same internal choice (a status string, a column layout, a provider's payload shape) appears in several modules, so changing it means coordinated edits. Parse outside data into domain types at the boundary.
- **Split ownership.** Two modules write the same state, or keep their own copy of it. Give each piece of state one owner.
- **Two ways to do one thing.** Two services, two actions or two policies that achieve the same result. Agents copy whichever they find first, and both keep growing.
- **Lists kept in sync by hand.** The same set of statuses, roles or event types listed in several places with nothing tying them. Derive the others from one, or make the build fail when they disagree.
- **Steps instead of knowledge.** Modules split by when they run (load, validate, transform, save) rather than by what they own, so one rule is re-checked at every step.
- **Reachable internals.** Helpers other code can import from outside the module. Agents take the shortest path that compiles, so internals become interface.
