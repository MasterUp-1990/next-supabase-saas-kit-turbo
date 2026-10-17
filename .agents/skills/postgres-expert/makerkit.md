# Makerkit Database Patterns

## Schema Location

All schemas are in `apps/web/supabase/schemas/` with numbered prefixes for dependency ordering.

## Existing Helper Functions - DO NOT Recreate

```sql
-- Account Access Control
public.has_role_on_account(account_id uuid, role_name? text)
public.has_permission(user_id uuid, account_id uuid, permission app_permissions)
public.is_account_owner(account_id uuid)
public.has_active_subscription(account_id uuid)
public.is_team_member(account_id uuid, user_id uuid)
public.can_action_account_member(target_account_id uuid, target_user_id uuid)

-- Administrative
public.is_super_admin()
public.is_aal2()
public.is_mfa_compliant()

-- Configuration
public.is_set(field_name text)
```

## RLS Policy Patterns

### Personal + Team Access

```sql
create policy "table_read" on public.table for select
  to authenticated using (
    account_id = (select auth.uid()) or
    public.has_role_on_account(account_id)
  );
```

### Permission-Based Access

```sql
create policy "table_manage" on public.table for all
  to authenticated using (
    public.has_permission(auth.uid(), account_id, 'feature.manage'::app_permissions)
  );
```

### Storage Bucket Policy

Reads require membership; writes require personal ownership or a permission. Mirrors
`apps/web/supabase/schemas/16-storage.sql`.

```sql
-- One policy per command. DELETE consults only USING, so a single FOR ALL
-- policy whose USING allows any member would let any member delete the file.
create policy bucket_name_select on storage.objects for select
  to authenticated using (
    bucket_id = 'bucket_name'
    and (
      kit.get_storage_filename_as_uuid(name) = auth.uid()
      or public.has_role_on_account(kit.get_storage_filename_as_uuid(name))
    )
  );

create policy bucket_name_insert on storage.objects for insert
  to authenticated with check (
    bucket_id = 'bucket_name'
    and (
      kit.get_storage_filename_as_uuid(name) = auth.uid()
      or public.has_permission(
        auth.uid(),
        kit.get_storage_filename_as_uuid(name),
        'settings.manage'
      )
    )
  );

-- UPDATE needs the same write check in both USING and WITH CHECK
create policy bucket_name_update on storage.objects for update
  to authenticated using (
    bucket_id = 'bucket_name'
    and (
      kit.get_storage_filename_as_uuid(name) = auth.uid()
      or public.has_permission(
        auth.uid(),
        kit.get_storage_filename_as_uuid(name),
        'settings.manage'
      )
    )
  )
  with check (
    bucket_id = 'bucket_name'
    and (
      kit.get_storage_filename_as_uuid(name) = auth.uid()
      or public.has_permission(
        auth.uid(),
        kit.get_storage_filename_as_uuid(name),
        'settings.manage'
      )
    )
  );

create policy bucket_name_delete on storage.objects for delete
  to authenticated using (
    bucket_id = 'bucket_name'
    and (
      kit.get_storage_filename_as_uuid(name) = auth.uid()
      or public.has_permission(
        auth.uid(),
        kit.get_storage_filename_as_uuid(name),
        'settings.manage'
      )
    )
  );
```

## Adding New Permissions

A permission nobody holds is useless: `has_permission()` reads `public.role_permissions`, so a new enum value with no
seed row makes every check on it fail — including for owners. Always add both.

1. **Declarative schema** (so a fresh `supabase:web:reset` is correct):
   - add the value to `app_permissions` in `schemas/01-enums.sql`
   - grant it in `schemas/17-roles-seed.sql`

   ```sql
   insert into public.role_permissions (role, permission)
   values ('owner', 'feature.manage');
   ```

2. **Migrations** (for existing databases). `db:diff` emits the enum change but not seed data, so write the grant by
   hand. Put it in a **separate, later migration**. Postgres rejects using an enum value in the same transaction that
   added it ("unsafe use of new value").

   ```sql
   -- <ts1>_add_feature_manage_permission.sql
   alter type public.app_permissions add value 'feature.manage';

   -- <ts2>_grant_feature_manage_permission.sql
   insert into public.role_permissions (role, permission)
   values ('owner', 'feature.manage')
   on conflict do nothing;
   ```

## Standard Table Template and Migration Workflow

Both live in `apps/web/supabase/AGENTS.md` (sections "Table Template" and
"Migration Workflow"). Read them there rather than from memory: that file is the
single source of truth for grants, `on delete` actions, triggers and the
`db:diff` flow, and it changes more often than this skill.

## Security Definer Function Pattern

```sql
create or replace function public.admin_function(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ALWAYS validate permissions first
  if not public.is_account_owner(target_id) then
    raise exception 'Access denied';
  end if;

  -- Safe to proceed
end;
$$;

grant execute on function public.admin_function(uuid) to authenticated;
```
