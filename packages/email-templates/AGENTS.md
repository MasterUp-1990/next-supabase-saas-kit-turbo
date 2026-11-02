# Email Templates Instructions

This package owns transactional email templates and renderers using React Email.

## Non-negotiables

1. New email must be added to `src/registry.ts` (`EMAIL_TEMPLATE_RENDERERS`) or dynamic inclusion/discovery will miss
   it.
2. New email renderer must be exported from `src/index.ts`.
3. Renderer contract: async function returning `{ html, subject }`.
4. i18n namespace must match locale filename in `src/locales/<lang>/<namespace>.json`.
   A key missing in a locale falls back per key to the default locale, then English; missing everywhere renders as `namespace.key` (same as the app). Translate through `initializeEmailI18n`, never `createTranslator` directly.
5. Reuse shared primitives in `src/components/*` for layout/style consistency.
6. Include one clear CTA and a plain URL fallback in body copy.
7. Keep subject/body concise, action-first, non-spammy.

## When adding a new email

1. Add template in `src/emails/*.email.tsx`.
2. Add locale file in `src/locales/en/*-email.json` if template uses i18n.
3. Export template renderer from `src/index.ts`.
4. Add renderer to `src/registry.ts` (`EMAIL_TEMPLATE_RENDERERS`).

`src/registry.ts` is required for dynamic inclusion/discovery. If not added there, dynamic template listing/rendering
will miss it.
