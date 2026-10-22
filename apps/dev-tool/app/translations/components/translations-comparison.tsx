'use client';

import { useEffect, useMemo, useState } from 'react';

import { ChevronDownIcon } from 'lucide-react';
import { Subject, debounceTime } from 'rxjs';

import { Button } from '@kit/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { If } from '@kit/ui/if';
import { Input } from '@kit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { cn } from '@kit/ui/utils';

import { updateTranslationAction } from '../lib/server-actions';
import type { Translations } from '../lib/translations-loader';

export function TranslationsComparison({
  translations,
}: {
  translations: Translations;
}) {
  const [search, setSearch] = useState('');

  // Create RxJS Subject for handling translation updates
  const subject$ = useMemo(
    () =>
      new Subject<{
        locale: string;
        namespace: string;
        key: string;
        value: string;
      }>(),
    [],
  );

  const { base_locale, locales, namespaces } = translations;

  const [selectedLocales, setSelectedLocales] = useState<Set<string>>(
    new Set(locales),
  );

  const [selectedNamespace, setSelectedNamespace] = useState(
    namespaces[0] ?? '',
  );

  // Get all unique keys across all translations
  const allKeys = Array.from(
    new Set(
      locales.flatMap((locale) =>
        Object.keys(
          translations.translations[locale]?.[selectedNamespace] ?? {},
        ),
      ),
    ),
  ).sort();

  const filteredKeys = allKeys.filter((key) =>
    key.toLowerCase().includes(search.toLowerCase()),
  );

  const visibleLocales = locales.filter((locale) =>
    selectedLocales.has(locale),
  );

  const toggleLocale = (locale: string) => {
    const newSelectedLocales = new Set(selectedLocales);

    if (newSelectedLocales.has(locale)) {
      if (newSelectedLocales.size > 1) {
        newSelectedLocales.delete(locale);
      }
    } else {
      newSelectedLocales.add(locale);
    }

    setSelectedLocales(newSelectedLocales);
  };

  // Set up subscription to handle debounced updates
  useEffect(() => {
    const subscription = subject$.pipe(debounceTime(500)).subscribe((props) => {
      updateTranslationAction(props)
        .then(() => {
          toast.success(`Updated translation for ${props.key}`);
        })
        .catch((err) => {
          toast.error(`Failed to update translation: ${err.message}`);
        });
    });

    return () => subscription.unsubscribe();
  }, [subject$]);

  if (locales.length === 0 || !base_locale) {
    return <div>No translations found</div>;
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex w-full items-center">
        <div className="flex w-full items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <Input
              type="search"
              placeholder="Search translations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />

            <If condition={locales.length > 1}>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" className="ml-auto">
                      Select Languages
                      <ChevronDownIcon className="ml-2 h-4 w-4" />
                    </Button>
                  }
                />

                <DropdownMenuContent align="end" className="w-[200px]">
                  {locales.map((locale) => (
                    <DropdownMenuCheckboxItem
                      key={locale}
                      checked={selectedLocales.has(locale)}
                      onCheckedChange={() => toggleLocale(locale)}
                      disabled={
                        selectedLocales.size === 1 &&
                        selectedLocales.has(locale)
                      }
                    >
                      {locale}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </If>

            <Select
              value={selectedNamespace}
              onValueChange={(value) =>
                value !== null && setSelectedNamespace(value)
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select namespace" />
              </SelectTrigger>

              <SelectContent>
                {namespaces.map((namespace: string) => (
                  <SelectItem key={namespace} value={namespace}>
                    {namespace}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              {visibleLocales.map((locale) => (
                <TableHead key={locale}>{locale}</TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredKeys.map((key) => (
              <TableRow key={key}>
                <TableCell width={350} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span>{key}</span>
                  </div>
                </TableCell>

                {visibleLocales.map((locale) => {
                  const translationsForLocale =
                    translations.translations[locale]?.[selectedNamespace] ??
                    {};

                  const baseTranslations =
                    translations.translations[base_locale]?.[
                      selectedNamespace
                    ] ?? {};

                  const value = translationsForLocale[key];
                  const baseValue = baseTranslations[key];
                  const isMissing = !value;
                  const isDifferent = value !== baseValue;

                  return (
                    <TableCell
                      key={locale}
                      className={cn({
                        'bg-destructive/10': isMissing,
                        'bg-warning/10': !isMissing && isDifferent,
                      })}
                    >
                      <div className="flex items-center justify-between">
                        <Input
                          defaultValue={value || ''}
                          onChange={(e) => {
                            const value = e.target.value.trim();

                            if (value === '') {
                              toast.error('Translation cannot be empty');

                              return;
                            }

                            if (value === baseValue) {
                              toast.info('Translation is the same as base');

                              return;
                            }

                            subject$.next({
                              locale,
                              namespace: selectedNamespace,
                              key,
                              value,
                            });
                          }}
                          className="w-full font-mono text-sm"
                          placeholder={isMissing ? 'Missing translation' : ''}
                        />
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
