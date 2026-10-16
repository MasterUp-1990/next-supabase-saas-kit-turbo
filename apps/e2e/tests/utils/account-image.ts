import { SUPABASE_URL, getSupabaseAdminClient } from './supabase-admin-client';

const BUCKET = 'account_image';

// 1x1 transparent PNG
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/**
 * Upload an image the way the settings forms do: to the public
 * `account_image` bucket, named by the bare account id. Pass `fileName` to
 * seed the `{id}.{ext}` naming used by older kit versions.
 */
export async function seedAccountImage(
  accountId: string,
  fileName = accountId,
) {
  const { error } = await getSupabaseAdminClient()
    .storage.from(BUCKET)
    .upload(fileName, PIXEL, { contentType: 'image/png', upsert: true });

  if (error) {
    throw new Error(`Failed to seed image for ${accountId}: ${error.message}`);
  }
}

/** Status of an anonymous fetch of the image's public URL. */
export async function getAccountImageStatus(fileName: string) {
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`,
  );

  return response.status;
}

/** Create a team account owned by the given user, bypassing the UI. */
export async function createOwnedTeam(userId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from('accounts')
    .insert({
      name: `Team ${Date.now()}`,
      is_personal_account: false,
      primary_owner_user_id: userId,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create team: ${error.message}`);
  }

  return data.id as string;
}

export async function getAccountIdByName(name: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from('accounts')
    .select('id')
    .eq('name', name)
    .single();

  if (error) {
    throw new Error(`Failed to find account "${name}": ${error.message}`);
  }

  return data.id as string;
}

/** The team an invitation for `email` was stored on, or null if none. */
export async function getInvitationAccountId(email: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from('invitations')
    .select('account_id')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read invitation for ${email}: ${error.message}`);
  }

  return (data?.account_id as string | undefined) ?? null;
}

export async function getAccountById(id: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from('accounts')
    .select('name, slug')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Failed to find account ${id}: ${error.message}`);
  }

  return data as { name: string; slug: string | null };
}
