import * as z from 'zod';

import {
  SlugSchema,
  TeamNameSchema,
  containsNonLatinCharacters,
} from './create-team.schema';

export const TeamNameFormSchema = z
  .object({
    name: TeamNameSchema,
    // Transform empty strings to undefined before validation
    newSlug: z.preprocess(
      (val) => (val === '' ? undefined : val),
      SlugSchema.optional(),
    ),
  })
  .refine(
    (data) => {
      if (containsNonLatinCharacters(data.name)) {
        return !!data.newSlug;
      }

      return true;
    },
    {
      message: 'teams.slugRequiredForNonLatinName',
      path: ['newSlug'],
    },
  );

export const UpdateTeamNameSchema = TeamNameFormSchema.and(
  z.object({
    accountId: z.string().uuid(),
    path: z.string().min(1).max(255),
  }),
);
