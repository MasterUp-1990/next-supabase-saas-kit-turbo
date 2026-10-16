'use client';

import { useRef } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Building, Link } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAction } from 'next-safe-action/hooks';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import { If } from '@kit/ui/if';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@kit/ui/input-group';
import { toast } from '@kit/ui/sonner';
import { Trans } from '@kit/ui/trans';

import { containsNonLatinCharacters } from '../../schema/create-team.schema';
import { TeamNameFormSchema } from '../../schema/update-team-name.schema';
import { updateTeamAccountName } from '../../server/actions/team-details-server-actions';

export const UpdateTeamAccountNameForm = (props: {
  account: {
    id: string;
    name: string;
    slug: string;
  };

  path: string;
}) => {
  const t = useTranslations('teams');
  // The action returns fully-qualified keys (`teams.duplicateSlugError`).
  const tError = useTranslations();

  const form = useForm({
    resolver: zodResolver(
      TeamNameFormSchema.refine(
        (values) => {
          return values.name !== props.account.name;
        },
        {
          message: 'teams.duplicateNameError',
          path: ['name'],
        },
      ),
    ),
    defaultValues: {
      name: props.account.name,
      newSlug: '',
    },
  });

  const toastId = useRef<string | number>('');

  const { execute, isPending } = useAction(updateTeamAccountName, {
    onExecute: () => {
      toastId.current = toast.loading(t('updateTeamLoadingMessage'));
    },
    onSuccess: ({ data }) => {
      if (data?.success) {
        toast.success(t('updateTeamSuccessMessage'), {
          id: toastId.current,
        });
      } else if (data?.error) {
        toast.error(tError(data.error), { id: toastId.current });
      } else {
        toast.error(t('updateTeamErrorMessage'), { id: toastId.current });
      }
    },
    onError: () => {
      toast.error(t('updateTeamErrorMessage'), { id: toastId.current });
    },
  });

  const nameValue = useWatch({ control: form.control, name: 'name' });
  const showSlugField = containsNonLatinCharacters(nameValue || '');

  return (
    <div className={'space-y-8'}>
      <Form {...form}>
        <form
          data-test={'update-team-account-name-form'}
          className={'flex flex-col space-y-4'}
          onSubmit={form.handleSubmit((data) => {
            execute({
              accountId: props.account.id,
              name: data.name,
              newSlug: data.newSlug || undefined,
              path: props.path,
            });
          })}
        >
          <FormField
            name={'name'}
            render={({ field }) => {
              return (
                <FormItem>
                  <FormLabel>
                    <Trans i18nKey={'teams.teamNameLabel'} />
                  </FormLabel>

                  <FormControl>
                    <InputGroup className="dark:bg-background">
                      <InputGroupAddon align="inline-start">
                        <Building className="h-4 w-4" />
                      </InputGroupAddon>

                      <InputGroupInput
                        data-test={'team-name-input'}
                        required
                        placeholder={t('teamNameInputLabel')}
                        {...field}
                      />
                    </InputGroup>
                  </FormControl>

                  <FormMessage />
                </FormItem>
              );
            }}
          />

          <If condition={showSlugField}>
            <FormField
              name={'newSlug'}
              render={({ field }) => {
                return (
                  <FormItem>
                    <FormLabel>
                      <Trans i18nKey={'teams.teamSlugLabel'} />
                    </FormLabel>

                    <FormControl>
                      <InputGroup className="dark:bg-background">
                        <InputGroupAddon align="inline-start">
                          <Link className="h-4 w-4" />
                        </InputGroupAddon>

                        <InputGroupInput
                          data-test={'team-slug-input'}
                          required
                          placeholder={'my-team'}
                          {...field}
                        />
                      </InputGroup>
                    </FormControl>

                    <FormDescription>
                      <Trans i18nKey={'teams.teamSlugDescription'} />
                    </FormDescription>

                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </If>

          <div>
            <Button
              type="submit"
              className={'w-full md:w-auto'}
              data-test={'update-team-submit-button'}
              disabled={isPending}
            >
              <Trans i18nKey={'teams.updateTeamSubmitLabel'} />
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
