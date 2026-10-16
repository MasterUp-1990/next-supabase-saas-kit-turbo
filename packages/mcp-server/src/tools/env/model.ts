import { z } from 'zod/v3';

import type { EnvMode } from './types';

type ModelType =
  | 'string'
  | 'longString'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'url'
  | 'email';

type Values = Array<string | null>;

export type EnvVariableModel = {
  name: string;
  displayName: string;
  description: string;
  hint?: string;
  secret?: boolean;
  type?: ModelType;
  values?: Values;
  category: string;
  required?: boolean;
  deprecated?: {
    reason: string;
    alternative?: string;
  };
  validate?: ({
    value,
    variables,
    mode,
  }: {
    value: string;
    variables: Record<string, string>;
    mode: EnvMode;
  }) => z.SafeParseReturnType<unknown, unknown>;
  contextualValidation?: {
    dependencies: Array<{
      variable: string;
      condition: (value: string, variables: Record<string, string>) => boolean;
      message: string;
    }>;
    validate: ({
      value,
      variables,
      mode,
    }: {
      value: string;
      variables: Record<string, string>;
      mode: EnvMode;
    }) => z.SafeParseReturnType<unknown, unknown>;
  };
};

export const envVariables: EnvVariableModel[] = [
  {
    name: 'NEXT_PUBLIC_SITE_URL',
    displayName: 'Site URL',
    description:
      'The URL of your site, used for generating absolute URLs. Must include the protocol.',
    category: 'Site Configuration',
    required: true,
    type: 'url',
    hint: `Ex. https://example.com`,
    validate: ({ value, mode }) => {
      if (mode === 'development') {
        return z
          .string()
          .url({
            message: `The NEXT_PUBLIC_SITE_URL variable must be a valid URL`,
          })
          .safeParse(value);
      }

      return z
        .string()
        .url({
          message: `The NEXT_PUBLIC_SITE_URL variable must be a valid URL`,
        })
        .startsWith(
          'https',
          `The NEXT_PUBLIC_SITE_URL variable must start with https`,
        )
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_PRODUCT_NAME',
    displayName: 'Product Name',
    description:
      "Your product's name, used consistently across the application interface.",
    category: 'Site Configuration',
    hint: `Ex. "My Product"`,
    required: true,
    type: 'string',
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The NEXT_PUBLIC_PRODUCT_NAME variable must be at least 1 character`,
        )
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_SITE_TITLE',
    displayName: 'Site Title',
    description:
      "The site's title tag content, crucial for SEO and browser display.",
    category: 'Site Configuration',
    required: true,
    hint: `Ex. "My Product, the best product ever"`,
    type: 'string',
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The NEXT_PUBLIC_SITE_TITLE variable must be at least 1 character`,
        )
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_SITE_DESCRIPTION',
    displayName: 'Site Description',
    type: 'longString',
    description:
      "Your site's meta description, important for SEO optimization.",
    category: 'Site Configuration',
    required: true,
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The NEXT_PUBLIC_SITE_DESCRIPTION variable must be at least 1 character`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_DEFAULT_LOCALE',
    displayName: 'Default Locale',
    type: 'string',
    description: 'Sets the default language for your application.',
    category: 'Localization',
    hint: `Ex. "en"`,
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The NEXT_PUBLIC_DEFAULT_LOCALE variable must be at least 1 character`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_AUTH_PASSWORD',
    displayName: 'Enable Password Authentication',
    description: 'Enables or disables password-based authentication.',
    category: 'Authentication',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_AUTH_MAGIC_LINK',
    displayName: 'Enable Magic Link Authentication',
    description: 'Enables or disables magic link authentication.',
    category: 'Authentication',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_AUTH_IDENTITY_LINKING',
    displayName: 'Enable Identity Linking',
    description: 'Allows users to link multiple auth identities.',
    category: 'Authentication',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_AUTH_OTP',
    displayName: 'Enable OTP Authentication',
    description: 'Enables or disables one-time password authentication.',
    category: 'Authentication',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_CAPTCHA_SITE_KEY',
    displayName: 'Captcha Site Key',
    description: 'Your Cloudflare Captcha site key for form protection.',
    category: 'Security',
    type: 'string',
    validate: ({ value }) => {
      return z.string().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_CAPTCHA_WIDGET_SIZE',
    displayName: 'Captcha Widget Size',
    description:
      'Turnstile widget size. Use "invisible" (default) for Non-interactive/Invisible site keys, or "normal"/"compact" for Managed site keys.',
    category: 'Security',
    type: 'enum',
    values: ['invisible', 'normal', 'compact'],
    validate: ({ value }) => {
      return z
        .enum(['invisible', 'normal', 'compact'])
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'CAPTCHA_SECRET_TOKEN',
    displayName: 'Captcha Secret Token',
    description:
      'Your Cloudflare Captcha secret token for backend verification.',
    category: 'Security',
    secret: true,
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'NEXT_PUBLIC_CAPTCHA_SITE_KEY',
          condition: (value) => {
            return value !== '';
          },
          message:
            'CAPTCHA_SECRET_TOKEN is required when NEXT_PUBLIC_CAPTCHA_SITE_KEY is set',
        },
      ],
      validate: ({ value }) => {
        return z
          .string()
          .min(
            1,
            `The CAPTCHA_SECRET_TOKEN variable must be at least 1 character`,
          )
          .safeParse(value);
      },
    },
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The CAPTCHA_SECRET_TOKEN variable must be at least 1 character`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_USER_NAVIGATION_STYLE',
    displayName: 'User Navigation Style',
    description:
      'Controls user navigation layout. Options: sidebar, header, or custom.',
    category: 'Navigation',
    type: 'enum',
    values: ['sidebar', 'header', 'custom'],
    validate: ({ value }) => {
      return z
        .enum(['sidebar', 'header', 'custom'])
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_HOME_SIDEBAR_COLLAPSED',
    displayName: 'Home Sidebar Collapsed',
    description: 'Sets the default state of the home sidebar.',
    category: 'Navigation',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_TEAM_NAVIGATION_STYLE',
    displayName: 'Team Navigation Style',
    description:
      'Controls team navigation layout. Options: sidebar, header, or custom.',
    category: 'Navigation',
    type: 'enum',
    values: ['sidebar', 'header', 'custom'],
    validate: ({ value }) => {
      return z
        .enum(['sidebar', 'header', 'custom'])
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_TEAM_SIDEBAR_COLLAPSED',
    displayName: 'Team Sidebar Collapsed',
    description: 'Sets the default state of the team sidebar.',
    category: 'Navigation',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_SIDEBAR_COLLAPSIBLE_STYLE',
    displayName: 'Sidebar Collapsible Style',
    description:
      'Defines sidebar collapse behavior. Options: offcanvas, icon, or none.',
    category: 'Navigation',
    type: 'enum',
    values: ['offcanvas', 'icon', 'none'],
    validate: ({ value }) => {
      return z.enum(['offcanvas', 'icon', 'none']).optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_DEFAULT_THEME_MODE',
    displayName: 'Default Theme Mode',
    description:
      'Controls the default theme appearance. Options: light, dark, or system.',
    category: 'Theme',
    type: 'enum',
    values: ['light', 'dark', 'system'],
    validate: ({ value }) => {
      return z.enum(['light', 'dark', 'system']).optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_ENABLE_THEME_TOGGLE',
    displayName: 'Enable Theme Toggle',
    description: 'Controls visibility of the theme toggle feature.',
    category: 'Theme',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_ENABLE_SIDEBAR_TRIGGER',
    displayName: 'Enable Sidebar Trigger',
    description: 'Controls visibility of the sidebar trigger feature.',
    category: 'Navigation',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_DELETION',
    displayName: 'Enable Personal Account Deletion',
    description: 'Allows users to delete their personal accounts.',
    category: 'Features',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_BILLING',
    displayName: 'Enable Personal Account Billing',
    description: 'Enables billing features for personal accounts.',
    category: 'Features',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_ENABLE_TEAM_ACCOUNTS',
    displayName: 'Enable Team Accounts',
    description: 'Master switch for team account functionality.',
    category: 'Features',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_ENABLE_TEAM_ACCOUNTS_ONLY',
    displayName: 'Enable Team Accounts Only and disable persoanl accounts.',
    description: 'Force disable personal accounts for pure B2B SaaS',
    category: 'Features',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_ENABLE_TEAM_ACCOUNTS_CREATION',
    displayName: 'Enable Team Account Creation',
    description: 'Controls ability to create new team accounts.',
    category: 'Features',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_ENABLE_TEAM_ACCOUNTS_DELETION',
    displayName: 'Enable Team Account Deletion',
    description: 'Allows team account deletion.',
    category: 'Features',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_ENABLE_TEAM_ACCOUNTS_BILLING',
    displayName: 'Enable Team Account Billing',
    description: 'Enables billing features for team accounts.',
    category: 'Features',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_ENABLE_TEAM_ACCOUNTS_ONLY',
    displayName: 'Enable Teams Accounts Only',
    description:
      'When enabled, disables personal accounts and only allows team accounts.',
    category: 'Features',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_ENABLE_NOTIFICATIONS',
    displayName: 'Enable Notifications',
    description: 'Controls the notification system.',
    category: 'Notifications',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_REALTIME_NOTIFICATIONS',
    displayName: 'Enable Realtime Notifications',
    description: 'Enables real-time notifications using Supabase Realtime.',
    category: 'Notifications',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    displayName: 'Supabase URL',
    description: 'Your Supabase project URL.',
    category: 'Supabase',
    hint: `Ex. https://your-project.supabase.co`,
    required: true,
    type: 'url',
    validate: ({ value, mode }) => {
      if (mode === 'development') {
        return z
          .string()
          .url({
            message: `The NEXT_PUBLIC_SUPABASE_URL variable must be a valid URL`,
          })
          .safeParse(value);
      }

      return z
        .string()
        .url({
          message: `The NEXT_PUBLIC_SUPABASE_URL variable must be a valid URL`,
        })
        .startsWith(
          'https',
          `The NEXT_PUBLIC_SUPABASE_URL variable must start with https`,
        )
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    displayName: 'Supabase Anonymous Key',
    description: 'Your Supabase anonymous API key.',
    category: 'Supabase',
    type: 'string',
    deprecated: {
      reason: 'Replaced by new JWT signing key system',
      alternative: 'NEXT_PUBLIC_SUPABASE_PUBLIC_KEY',
    },
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The NEXT_PUBLIC_SUPABASE_ANON_KEY variable must be at least 1 character`,
        )
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_PUBLIC_KEY',
    displayName: 'Supabase Public Key',
    description: 'Your Supabase public API key.',
    category: 'Supabase',
    required: false,
    type: 'string',
    hint: 'Falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY if not provided',
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The NEXT_PUBLIC_SUPABASE_PUBLIC_KEY variable must be at least 1 character`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    displayName: 'Supabase Service Role Key',
    description: 'Your Supabase service role key (keep this secret!).',
    category: 'Supabase',
    secret: true,
    type: 'string',
    deprecated: {
      reason: 'Renamed for consistency with new JWT signing key system',
      alternative: 'SUPABASE_SECRET_KEY',
    },
    validate: ({ value, variables }) => {
      return z
        .string()
        .min(
          1,
          `The SUPABASE_SERVICE_ROLE_KEY variable must be at least 1 character`,
        )
        .refine(
          (value) => {
            return value !== variables['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
          },
          {
            message: `The SUPABASE_SERVICE_ROLE_KEY variable must be different from NEXT_PUBLIC_SUPABASE_ANON_KEY`,
          },
        )
        .safeParse(value);
    },
  },
  {
    name: 'SUPABASE_SECRET_KEY',
    displayName: 'Supabase Secret Key',
    description:
      'Your Supabase secret key (preferred over SUPABASE_SERVICE_ROLE_KEY).',
    category: 'Supabase',
    secret: true,
    required: false,
    type: 'string',
    hint: 'Falls back to SUPABASE_SERVICE_ROLE_KEY if not provided',
    validate: ({ value, variables }) => {
      return z
        .string()
        .min(1, `The SUPABASE_SECRET_KEY variable must be at least 1 character`)
        .refine(
          (value) => {
            const anonKey =
              variables['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ||
              variables['NEXT_PUBLIC_SUPABASE_PUBLIC_KEY'];
            return value !== anonKey;
          },
          {
            message: `The SUPABASE_SECRET_KEY variable must be different from public keys`,
          },
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'SUPABASE_DB_WEBHOOK_SECRET',
    displayName: 'Supabase Database Webhook Secret',
    description: 'Secret key for Supabase webhook verification.',
    category: 'Supabase',
    secret: true,
    required: true,
    type: 'string',
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The SUPABASE_DB_WEBHOOK_SECRET variable must be at least 1 character`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_BILLING_PROVIDER',
    displayName: 'Billing Provider',
    description:
      'Your chosen billing provider. Options: stripe or lemon-squeezy.',
    category: 'Billing',
    required: true,
    type: 'enum',
    values: ['stripe', 'lemon-squeezy'],
    validate: ({ value }) => {
      return z.enum(['stripe', 'lemon-squeezy']).optional().safeParse(value);
    },
  },
  {
    name: 'BILLING_MODE',
    displayName: 'Billing Mode',
    description: 'Billing mode configuration for the application.',
    category: 'Billing',
    required: false,
    secret: false,
    type: 'enum',
    values: ['subscription', 'one-time'],
    deprecated: {
      reason:
        'This configuration is no longer required and billing mode is now automatically determined',
      alternative: undefined,
    },
    validate: ({ value }) => {
      return z.enum(['subscription', 'one-time']).optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    displayName: 'Stripe Publishable Key',
    description:
      'Your Stripe publishable key. Required when using embedded checkout (default), optional when STRIPE_UI_MODE is set to hosted_page.',
    hint: `Ex. pk_test_123456789012345678901234`,
    category: 'Billing',
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'NEXT_PUBLIC_BILLING_PROVIDER',
          condition: (value) => value === 'stripe',
          message:
            'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required when NEXT_PUBLIC_BILLING_PROVIDER is set to "stripe" and STRIPE_UI_MODE is not "hosted_page"',
        },
        {
          variable: 'STRIPE_UI_MODE',
          condition: (value) => value !== 'hosted_page',
          message:
            'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required when STRIPE_UI_MODE is not set to "hosted_page"',
        },
      ],
      validate: ({ value }) => {
        return z
          .string()
          .min(
            1,
            `The NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY variable must be at least 1 character`,
          )
          .refine(
            (value) => {
              return value.startsWith('pk_');
            },
            {
              message: `The NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY variable must start with pk_`,
            },
          )
          .safeParse(value);
      },
    },
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY variable must be at least 1 character`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'STRIPE_SECRET_KEY',
    displayName: 'Stripe Secret Key',
    description: 'Your Stripe secret key.',
    category: 'Billing',
    hint: `Ex. sk_test_123456789012345678901234`,
    secret: true,
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'NEXT_PUBLIC_BILLING_PROVIDER',
          condition: (value) => value === 'stripe',
          message:
            'STRIPE_SECRET_KEY is required when NEXT_PUBLIC_BILLING_PROVIDER is set to "stripe"',
        },
      ],
      validate: ({ value }) => {
        return z
          .string()
          .min(1, `The STRIPE_SECRET_KEY variable must be at least 1 character`)
          .refine(
            (value) => {
              return value.startsWith('sk_') || value.startsWith('rk_');
            },
            {
              message: `The STRIPE_SECRET_KEY variable must start with sk_ or rk_`,
            },
          )
          .safeParse(value);
      },
    },
    validate: ({ value }) => {
      return z
        .string()
        .min(1, `The STRIPE_SECRET_KEY variable must be at least 1 character`)
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    displayName: 'Stripe Webhook Secret',
    description: 'Your Stripe webhook secret.',
    category: 'Billing',
    hint: `Ex. whsec_123456789012345678901234`,
    secret: true,
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'NEXT_PUBLIC_BILLING_PROVIDER',
          condition: (value) => value === 'stripe',
          message:
            'STRIPE_WEBHOOK_SECRET is required when NEXT_PUBLIC_BILLING_PROVIDER is set to "stripe"',
        },
      ],
      validate: ({ value }) => {
        return z
          .string()
          .min(
            1,
            `The STRIPE_WEBHOOK_SECRET variable must be at least 1 character`,
          )
          .refine(
            (value) => {
              return value.startsWith('whsec_');
            },
            {
              message: `The STRIPE_WEBHOOK_SECRET variable must start with whsec_`,
            },
          )
          .safeParse(value);
      },
    },
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The STRIPE_WEBHOOK_SECRET variable must be at least 1 character`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'LEMON_SQUEEZY_SECRET_KEY',
    displayName: 'Lemon Squeezy Secret Key',
    description: 'Your Lemon Squeezy secret key.',
    category: 'Billing',
    secret: true,
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'NEXT_PUBLIC_BILLING_PROVIDER',
          condition: (value) => value === 'lemon-squeezy',
          message:
            'LEMON_SQUEEZY_SECRET_KEY is required when NEXT_PUBLIC_BILLING_PROVIDER is set to "lemon-squeezy"',
        },
      ],
      validate: ({ value }) => {
        return z
          .string()
          .min(
            1,
            `The LEMON_SQUEEZY_SECRET_KEY variable must be at least 1 character`,
          )
          .safeParse(value);
      },
    },
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The LEMON_SQUEEZY_SECRET_KEY variable must be at least 1 character`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'LEMON_SQUEEZY_STORE_ID',
    displayName: 'Lemon Squeezy Store ID',
    description: 'Your Lemon Squeezy store ID.',
    category: 'Billing',
    secret: false,
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'NEXT_PUBLIC_BILLING_PROVIDER',
          condition: (value) => value === 'lemon-squeezy',
          message:
            'LEMON_SQUEEZY_STORE_ID is required when NEXT_PUBLIC_BILLING_PROVIDER is set to "lemon-squeezy"',
        },
      ],
      validate: ({ value }) => {
        return z
          .string()
          .min(
            1,
            `The LEMON_SQUEEZY_STORE_ID variable must be at least 1 character`,
          )
          .safeParse(value);
      },
    },
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The LEMON_SQUEEZY_STORE_ID variable must be at least 1 character`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'LEMON_SQUEEZY_SIGNING_SECRET',
    displayName: 'Lemon Squeezy Signing Secret',
    description: 'Your Lemon Squeezy signing secret.',
    category: 'Billing',
    secret: true,
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'NEXT_PUBLIC_BILLING_PROVIDER',
          condition: (value) => value === 'lemon-squeezy',
          message:
            'LEMON_SQUEEZY_SIGNING_SECRET is required when NEXT_PUBLIC_BILLING_PROVIDER is set to "lemon-squeezy"',
        },
      ],
      validate: ({ value }) => {
        return z
          .string()
          .min(
            1,
            `The LEMON_SQUEEZY_SIGNING_SECRET variable must be at least 1 character`,
          )
          .safeParse(value);
      },
    },
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The LEMON_SQUEEZY_SIGNING_SECRET variable must be at least 1 character`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'MAILER_PROVIDER',
    displayName: 'Mailer Provider',
    description: 'Your email service provider. Options: nodemailer or resend.',
    category: 'Email',
    required: true,
    secret: false,
    type: 'enum',
    values: ['nodemailer', 'resend'],
    validate: ({ value }) => {
      return z.enum(['nodemailer', 'resend']).safeParse(value);
    },
  },
  {
    name: 'EMAIL_SENDER',
    displayName: 'Email Sender',
    description: 'Default sender email address.',
    category: 'Email',
    hint: `Ex. "Makerkit <admin@makerkit.dev>"`,
    required: true,
    secret: false,
    type: 'string',
    validate: ({ value }) => {
      return z
        .string()
        .min(1, `The EMAIL_SENDER variable must be at least 1 character`)
        .safeParse(value);
    },
  },
  {
    name: 'CONTACT_EMAIL',
    displayName: 'Contact Email',
    description: 'Email address for contact form submissions.',
    category: 'Email',
    hint: `Ex. "Makerkit <admin@makerkit.dev>"`,
    required: true,
    secret: false,
    type: 'email',
    validate: ({ value }) => {
      return z
        .string()
        .email()
        .min(1, `The CONTACT_EMAIL variable must be at least 1 character`)
        .safeParse(value);
    },
  },
  {
    name: 'RESEND_API_KEY',
    displayName: 'Resend API Key',
    description: 'Your Resend API key.',
    category: 'Email',
    secret: true,
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'MAILER_PROVIDER',
          condition: (value) => value === 'resend',
          message:
            'RESEND_API_KEY is required when MAILER_PROVIDER is set to "resend"',
        },
      ],
      validate: ({ value, variables }) => {
        if (variables['MAILER_PROVIDER'] === 'resend') {
          return z
            .string()
            .min(1, `The RESEND_API_KEY variable must be at least 1 character`)
            .safeParse(value);
        }

        return z.string().optional().safeParse(value);
      },
    },
  },
  {
    name: 'EMAIL_HOST',
    displayName: 'Email Host',
    description: 'SMTP host for Nodemailer configuration.',
    category: 'Email',
    secret: false,
    type: 'string',
    hint: `Ex. "smtp.example.com"`,
    contextualValidation: {
      dependencies: [
        {
          variable: 'MAILER_PROVIDER',
          condition: (value) => value === 'nodemailer',
          message:
            'EMAIL_HOST is required when MAILER_PROVIDER is set to "nodemailer"',
        },
      ],
      validate: ({ value, variables }) => {
        if (variables['MAILER_PROVIDER'] === 'nodemailer') {
          return z
            .string()
            .min(1, 'The EMAIL_HOST variable must be at least 1 character')
            .safeParse(value);
        }
        return z.string().optional().safeParse(value);
      },
    },
  },
  {
    name: 'EMAIL_PORT',
    displayName: 'Email Port',
    description: 'SMTP port for Nodemailer configuration.',
    category: 'Email',
    secret: false,
    type: 'number',
    hint: `Ex. 587 or 465`,
    contextualValidation: {
      dependencies: [
        {
          variable: 'MAILER_PROVIDER',
          condition: (value) => value === 'nodemailer',
          message:
            'EMAIL_PORT is required when MAILER_PROVIDER is set to "nodemailer"',
        },
      ],
      validate: ({ value, variables }) => {
        if (variables['MAILER_PROVIDER'] === 'nodemailer') {
          return z.coerce
            .number()
            .min(1, 'The EMAIL_PORT variable must be at least 1')
            .max(65535, 'The EMAIL_PORT variable must be at most 65535')
            .safeParse(value);
        }
        return z.coerce.number().optional().safeParse(value);
      },
    },
  },
  {
    name: 'EMAIL_USER',
    displayName: 'Email User',
    description: 'SMTP user for Nodemailer configuration.',
    category: 'Email',
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'MAILER_PROVIDER',
          condition: (value) => value === 'nodemailer',
          message:
            'EMAIL_USER is required when MAILER_PROVIDER is set to "nodemailer"',
        },
      ],
      validate: ({ value, variables }) => {
        if (variables['MAILER_PROVIDER'] === 'nodemailer') {
          return z
            .string()
            .min(1, 'The EMAIL_USER variable must be at least 1 character')
            .safeParse(value);
        }

        return z.string().optional().safeParse(value);
      },
    },
  },
  {
    name: 'EMAIL_PASSWORD',
    displayName: 'Email Password',
    description: 'SMTP password for Nodemailer configuration.',
    category: 'Email',
    secret: true,
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'MAILER_PROVIDER',
          condition: (value) => value === 'nodemailer',
          message:
            'EMAIL_PASSWORD is required when MAILER_PROVIDER is set to "nodemailer"',
        },
      ],
      validate: ({ value, variables }) => {
        if (variables['MAILER_PROVIDER'] === 'nodemailer') {
          return z
            .string()
            .min(1, 'The EMAIL_PASSWORD variable must be at least 1 character')
            .safeParse(value);
        }
        return z.string().optional().safeParse(value);
      },
    },
  },
  {
    name: 'EMAIL_TLS',
    displayName: 'Email TLS',
    description:
      'Whether to use TLS for SMTP connection. Please check this in your SMTP provider settings.',
    category: 'Email',
    secret: false,
    type: 'boolean',
    contextualValidation: {
      dependencies: [
        {
          variable: 'MAILER_PROVIDER',
          condition: (value) => value === 'nodemailer',
          message:
            'EMAIL_TLS is required when MAILER_PROVIDER is set to "nodemailer"',
        },
      ],
      validate: ({ value, variables }) => {
        if (variables['MAILER_PROVIDER'] === 'nodemailer') {
          return z.coerce.boolean().optional().safeParse(value);
        }
        return z.coerce.boolean().optional().safeParse(value);
      },
    },
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'CMS_CLIENT',
    displayName: 'CMS Client',
    description: 'Your chosen CMS system. Options: wordpress or keystatic.',
    category: 'CMS',
    secret: false,
    type: 'enum',
    values: ['wordpress', 'keystatic'],
    validate: ({ value }) => {
      return z.enum(['wordpress', 'keystatic']).optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_KEYSTATIC_STORAGE_KIND',
    displayName: 'Keystatic Storage Kind',
    description: 'Your Keystatic storage kind. Options: local, cloud, github.',
    category: 'CMS',
    type: 'enum',
    values: ['local', 'cloud', 'github'],
    contextualValidation: {
      dependencies: [
        {
          variable: 'CMS_CLIENT',
          condition: (value) => value === 'keystatic',
          message:
            'NEXT_PUBLIC_KEYSTATIC_STORAGE_KIND is required when CMS_CLIENT is set to "keystatic"',
        },
      ],
      validate: ({ value, variables }) => {
        if (variables['CMS_CLIENT'] === 'keystatic') {
          return z
            .enum(['local', 'cloud', 'github'])
            .optional()
            .safeParse(value);
        }
        return z.enum(['local', 'cloud', 'github']).optional().safeParse(value);
      },
    },
  },
  {
    name: 'NEXT_PUBLIC_KEYSTATIC_STORAGE_REPO',
    displayName: 'Keystatic Storage Repository',
    description: 'Your Keystatic storage repo.',
    category: 'CMS',
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'CMS_CLIENT',
          condition: (value, variables) =>
            value === 'keystatic' &&
            variables['NEXT_PUBLIC_KEYSTATIC_STORAGE_KIND'] === 'github',
          message:
            'NEXT_PUBLIC_KEYSTATIC_STORAGE_REPO is required when CMS_CLIENT is set to "keystatic"',
        },
      ],
      validate: ({ value }) => {
        return z
          .string()
          .min(
            1,
            `The NEXT_PUBLIC_KEYSTATIC_STORAGE_REPO variable must be at least 1 character`,
          )
          .safeParse(value);
      },
    },
  },
  {
    name: 'KEYSTATIC_GITHUB_TOKEN',
    displayName: 'Keystatic GitHub Token',
    description: 'Your Keystatic GitHub token.',
    category: 'CMS',
    secret: true,
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'CMS_CLIENT',
          condition: (value, variables) =>
            value === 'keystatic' &&
            variables['NEXT_PUBLIC_KEYSTATIC_STORAGE_KIND'] === 'github',
          message:
            'KEYSTATIC_GITHUB_TOKEN is required when CMS_CLIENT is set to "keystatic"',
        },
      ],
      validate: ({ value }) => {
        return z
          .string()
          .min(
            1,
            `The KEYSTATIC_GITHUB_TOKEN variable must be at least 1 character`,
          )
          .safeParse(value);
      },
    },
  },
  {
    name: 'KEYSTATIC_PATH_PREFIX',
    displayName: 'Keystatic Path Prefix',
    description: 'Your Keystatic path prefix.',
    category: 'CMS',
    secret: false,
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'CMS_CLIENT',
          condition: (value) => value === 'keystatic',
          message:
            'KEYSTATIC_PATH_PREFIX is required when CMS_CLIENT is set to "keystatic"',
        },
      ],
      validate: ({ value }) => {
        return z.string().safeParse(value);
      },
    },
  },
  {
    name: 'NEXT_PUBLIC_KEYSTATIC_CONTENT_PATH',
    displayName: 'Keystatic Content Path',
    description: 'Your Keystatic content path.',
    category: 'CMS',
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'CMS_CLIENT',
          condition: (value) => value === 'keystatic',
          message:
            'NEXT_PUBLIC_KEYSTATIC_CONTENT_PATH is required when CMS_CLIENT is set to "keystatic"',
        },
      ],
      validate: ({ value }) => {
        return z
          .string()
          .min(
            1,
            `The NEXT_PUBLIC_KEYSTATIC_CONTENT_PATH variable must be at least 1 character`,
          )
          .optional()
          .safeParse(value);
      },
    },
  },
  {
    name: 'WORDPRESS_API_URL',
    displayName: 'WordPress API URL',
    description: 'WordPress API URL when using WordPress as CMS.',
    category: 'CMS',
    secret: false,
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'CMS_CLIENT',
          condition: (value) => value === 'wordpress',
          message:
            'WORDPRESS_API_URL is required when CMS_CLIENT is set to "wordpress"',
        },
      ],
      validate: ({ value }) => {
        return z
          .string()
          .url({
            message: `The WORDPRESS_API_URL variable must be a valid URL`,
          })
          .safeParse(value);
      },
    },
  },
  {
    name: 'NEXT_PUBLIC_LOCALES_PATH',
    displayName: 'Locales Path',
    description: 'The path to your locales folder.',
    category: 'Localization',
    type: 'string',
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The NEXT_PUBLIC_LOCALES_PATH variable must be at least 1 character`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_LANGUAGE_PRIORITY',
    displayName: 'Language Priority',
    description: 'The priority setting as to how infer the language.',
    category: 'Localization',
    type: 'enum',
    values: ['user', 'application'],
    validate: ({ value }) => {
      return z.enum(['user', 'application']).optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_ENABLE_VERSION_UPDATER',
    displayName: 'Enable Version Updater',
    description:
      'Enables the version updater to poll the latest version and notify the user.',
    category: 'Features',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_VERSION_UPDATER_REFETCH_INTERVAL_SECONDS',
    displayName: 'Version Updater Refetch Interval (seconds)',
    description: 'The interval in seconds to check for updates.',
    category: 'Features',
    type: 'number',
    validate: ({ value }) => {
      return z.coerce
        .number()
        .min(
          1,
          `The NEXT_PUBLIC_VERSION_UPDATER_REFETCH_INTERVAL_SECONDS variable must be at least 1 character`,
        )
        .max(
          86400,
          `The NEXT_PUBLIC_VERSION_UPDATER_REFETCH_INTERVAL_SECONDS variable must be at most 86400`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: `ENABLE_REACT_COMPILER`,
    displayName: 'Enable React Compiler',
    description: 'Enables the React compiler [experimental]',
    category: 'Build',
    secret: false,
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_MONITORING_PROVIDER',
    displayName: 'Monitoring Provider',
    description: 'The monitoring provider to use.',
    category: 'Monitoring',
    type: 'enum',
    values: ['baselime', 'sentry', 'none'],
    validate: ({ value }) => {
      return z.enum(['baselime', 'sentry', '']).optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_SENTRY_DSN',
    displayName: 'Sentry DSN',
    description: 'The Sentry DSN to use.',
    category: 'Monitoring',
    type: `string`,
    contextualValidation: {
      dependencies: [
        {
          variable: 'NEXT_PUBLIC_MONITORING_PROVIDER',
          condition: (value) => value === 'sentry',
          message:
            'NEXT_PUBLIC_SENTRY_DSN is required when NEXT_PUBLIC_MONITORING_PROVIDER is set to "sentry"',
        },
      ],
      validate: ({ value }) => {
        return z
          .string()
          .min(
            1,
            `The NEXT_PUBLIC_SENTRY_DSN variable must be at least 1 character`,
          )
          .safeParse(value);
      },
    },
  },
  {
    name: 'NEXT_PUBLIC_SENTRY_ENVIRONMENT',
    displayName: 'Sentry Environment',
    description: 'The Sentry environment to use.',
    category: 'Monitoring',
    type: 'string',
    validate: ({ value }) => {
      return z.string().optional().safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_BASELIME_KEY',
    displayName: 'Baselime Key',
    description: 'The Baselime key to use.',
    category: 'Monitoring',
    type: 'string',
    contextualValidation: {
      dependencies: [
        {
          variable: 'NEXT_PUBLIC_MONITORING_PROVIDER',
          condition: (value) => value === 'baselime',
          message:
            'NEXT_PUBLIC_BASELIME_KEY is required when NEXT_PUBLIC_MONITORING_PROVIDER is set to "baselime"',
        },
      ],
      validate: ({ value }) => {
        return z
          .string()
          .min(
            1,
            `The NEXT_PUBLIC_BASELIME_KEY variable must be at least 1 character`,
          )
          .optional()
          .safeParse(value);
      },
    },
  },
  {
    name: 'STRIPE_ENABLE_TRIAL_WITHOUT_CC',
    displayName: 'Enable Stripe Trial Without Credit Card',
    description: 'Enables trial plans without credit card.',
    category: 'Billing',
    secret: false,
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'STRIPE_UI_MODE',
    displayName: 'Stripe Checkout UI Mode',
    description:
      'Controls whether Stripe Checkout uses an embedded page or a hosted page. Defaults to embedded_page.',
    category: 'Billing',
    secret: false,
    type: 'enum',
    values: ['embedded_page', 'hosted_page'],
    validate: ({ value }) => {
      return z
        .enum(['embedded_page', 'hosted_page'])
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_THEME_COLOR',
    displayName: 'Theme Color',
    description: 'The default theme color.',
    category: 'Theme',
    type: 'string',
    required: true,
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The NEXT_PUBLIC_THEME_COLOR variable must be at least 1 character`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_THEME_COLOR_DARK',
    displayName: 'Theme Color (Dark Mode)',
    description: 'The default theme color for dark mode.',
    category: 'Theme',
    required: true,
    type: 'string',
    validate: ({ value }) => {
      return z
        .string()
        .min(
          1,
          `The NEXT_PUBLIC_THEME_COLOR_DARK variable must be at least 1 character`,
        )
        .optional()
        .safeParse(value);
    },
  },
  {
    name: 'NEXT_PUBLIC_DISPLAY_TERMS_AND_CONDITIONS_CHECKBOX',
    displayName: 'Display Terms and Conditions Checkbox',
    description: 'Whether to display the terms checkbox during sign-up.',
    category: 'Features',
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
  {
    name: 'ENABLE_STRICT_CSP',
    displayName: 'Enable Strict Content Security Policy',
    description: 'Enables strict Content Security Policy (CSP) headers.',
    category: 'Security',
    required: false,
    secret: false,
    type: 'boolean',
    validate: ({ value }) => {
      return z.coerce.boolean().optional().safeParse(value);
    },
  },
];
