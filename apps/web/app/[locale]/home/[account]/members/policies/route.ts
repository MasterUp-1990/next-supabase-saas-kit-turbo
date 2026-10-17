import { NextResponse } from 'next/server';

import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getLogger } from '@kit/shared/logger';
import {
  createInvitationContextBuilder,
  createInvitationsPolicyEvaluator,
} from '@kit/team-accounts/policies';

export const GET = enhanceRouteHandler(
  async function ({ params, user, client }) {
    const { account } = z.object({ account: z.string() }).parse(params);

    try {
      // Evaluate with standard evaluator
      const evaluator = createInvitationsPolicyEvaluator();
      const hasPolicies = await evaluator.hasPoliciesForStage('preliminary');

      if (!hasPolicies) {
        return NextResponse.json({
          allowed: true,
          reasons: [],
          metadata: {
            policiesEvaluated: 0,
            timestamp: new Date().toISOString(),
            noPoliciesConfigured: true,
          },
        });
      }

      // Build context for policy evaluation (empty invitations for testing)
      const contextBuilder = createInvitationContextBuilder(client);

      const context = await contextBuilder.buildContext(
        {
          invitations: [],
          accountSlug: account,
        },
        user,
      );

      // validate against policies
      const result = await evaluator.canInvite(context, 'preliminary');

      return NextResponse.json(result);
    } catch (error) {
      // Log the detail server-side; the response carries only a stable key so
      // internal messages (DB errors, lookups) never reach the browser.
      const logger = await getLogger();

      logger.error(
        {
          name: 'invitation-policies',
          accountSlug: account,
          userId: user.id,
          error,
        },
        'Failed to evaluate invitation policies',
      );

      return NextResponse.json(
        {
          allowed: false,
          reasons: ['teams.policyCheckError'],
          metadata: { error: true },
        },
        { status: 500 },
      );
    }
  },
  {
    auth: true,
  },
);
