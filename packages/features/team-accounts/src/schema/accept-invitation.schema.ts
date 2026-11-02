import * as z from 'zod';

import { isSafeRedirectPath } from '@kit/shared/safe-redirect';

export const AcceptInvitationSchema = z.object({
  inviteToken: z.string().uuid(),
  nextPath: z.string().min(1).refine(isSafeRedirectPath, {
    message: 'Invalid redirect path',
  }),
});
