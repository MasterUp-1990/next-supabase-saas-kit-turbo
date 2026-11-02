'use server';

import { redirect } from 'next/navigation';

import { authActionClient } from '@kit/next/safe-action';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { UpdateTeamNameSchema } from '../../schema/update-team-name.schema';

/**
 * Mirrors `kit.slugify` (apps/web/supabase/schemas/03-accounts.sql). Only used
 * to tell when a rename would slugify to the team's current slug; if the two
 * drift, the team just keeps its current slug or gets a "-1" suffix.
 */
function slugifyLikeTrigger(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['"]+/g, '')
    .replace(/[^a-z0-9\-_]+/g, '-')
    .replace(/-+$/, '')
    .replace(/^-/, '');
}

export const updateTeamAccountName = authActionClient
  .inputSchema(UpdateTeamNameSchema)
  .action(async ({ parsedInput: params }) => {
    const client = getSupabaseServerClient();
    const logger = await getLogger();
    const { accountId, name, path, newSlug } = params;

    const ctx = {
      name: 'team-accounts.update',
      accountId,
      accountName: name,
    };

    logger.info(ctx, `Updating team name...`);

    const { data: current, error: readError } = await client
      .from('accounts')
      .select('slug')
      .eq('id', accountId)
      .single();

    if (readError || !current.slug) {
      logger.error({ ...ctx, error: readError }, `Failed to read team`);

      return { success: false };
    }

    // Any name change makes the `update_slug_from_account_name` trigger
    // regenerate the slug from the name, overwriting a slug written in the
    // same statement. A slug-only update leaves the name alone and skips it.

    // 1. Claim the custom slug before anything changes, so a taken slug fails
    //    cleanly instead of leaving a half-applied rename.
    if (newSlug && newSlug !== current.slug) {
      const { error } = await client
        .from('accounts')
        .update({ slug: newSlug })
        .eq('id', accountId);

      if (error) {
        if (error.code === '23505') {
          return { success: false, error: 'teams.duplicateSlugError' };
        }

        logger.error({ ...ctx, error }, `Failed to update team slug`);

        return { success: false };
      }
    }

    // 2. Rename. The trigger replaces the slug with one generated from the
    //    name ("team-<id>" for a name with nothing to transliterate),
    //    releasing the slug claimed above.
    const { data: renamed, error: renameError } = await client
      .from('accounts')
      .update({ name })
      .eq('id', accountId)
      .select('slug')
      .single();

    if (renameError) {
      logger.error(
        { ...ctx, error: renameError },
        `Failed to update team name`,
      );

      return { success: false };
    }

    // 3. Set the slug the team should end up with: the custom slug, or its
    //    current slug when the new name slugifies to it — before migration
    //    20261029000000 the trigger's uniqueness check counted the team's own
    //    row and added "-1".
    const targetSlug =
      newSlug ??
      (slugifyLikeTrigger(name) === current.slug ? current.slug : null);

    let updatedSlug = renamed.slug;

    if (targetSlug && targetSlug !== renamed.slug) {
      const { error } = await client
        .from('accounts')
        .update({ slug: targetSlug })
        .eq('id', accountId);

      if (error) {
        // Only possible if another team took the slug in the milliseconds
        // since step 2 released it. The team keeps the generated slug.
        logger.error({ ...ctx, error }, `Failed to set team slug`);
      } else {
        updatedSlug = targetSlug;
      }
    }

    logger.info(ctx, `Team name updated`);

    if (updatedSlug && updatedSlug !== current.slug) {
      redirect(path.replace('[account]', updatedSlug));
    }

    return { success: true };
  });
