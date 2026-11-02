import { Cms, CmsClient } from '@kit/cms-types';

import { createKeystaticReader } from './create-reader';
import { DocumentationEntryProps, PostEntryProps } from './keystatic.config';
import { renderMarkdoc, toMarkdocNode } from './markdoc';
import { resolveParents } from './resolve-parents';
import { createContentItemComparator } from './sort-content-items';

export function createKeystaticClient() {
  return new KeystaticClient();
}

class KeystaticClient implements CmsClient {
  async getContentItems(options: Cms.GetContentItemsOptions) {
    const reader = await createKeystaticReader();

    const collection =
      options.collection as keyof (typeof reader)['collections'];

    if (!reader.collections[collection]) {
      throw new Error(`Collection ${collection} not found`);
    }

    const fetchContent = options.content ?? true;

    const startOffset = options?.offset ?? 0;
    const endOffset = startOffset + (options?.limit ?? 10);

    const docs = await reader.collections[collection].all();

    const filtered = docs
      .filter((item) => {
        const status = options?.status ?? 'published';

        if (item.entry.status !== status) {
          return false;
        }

        const categoryMatch = options?.categories?.length
          ? options.categories.find((category) =>
              item.entry.categories.includes(category),
            )
          : true;

        if (!categoryMatch) {
          return false;
        }

        if (options.language) {
          if (item.entry.language && item.entry.language !== options.language) {
            return false;
          }
        }

        const tagMatch = options?.tags?.length
          ? options.tags.find((tag) => item.entry.tags.includes(tag))
          : true;

        if (!tagMatch) {
          return false;
        }

        return true;
      })
      .sort(createContentItemComparator(options));

    const itemsWithParents = resolveParents(filtered);

    const items = await Promise.all(
      itemsWithParents.slice(startOffset, endOffset).map((item) => {
        if (collection === 'documentation') {
          return this.mapDocumentationPost(
            item as {
              entry: DocumentationEntryProps;
              slug: string;
            },
            { fetchContent },
          );
        }

        return this.mapPost(
          item as {
            entry: PostEntryProps;
            slug: string;
          },
          { fetchContent },
        );
      }),
    );

    return {
      total: filtered.length,
      items,
    };
  }

  async getContentItemBySlug(params: {
    slug: string;
    collection: string;
    status?: Cms.ContentItemStatus;
  }) {
    const reader = await createKeystaticReader();

    const collection =
      params.collection as keyof (typeof reader)['collections'];

    if (!reader.collections[collection]) {
      throw new Error(`Collection ${collection} not found`);
    }

    const doc = await reader.collections[collection].read(params.slug);
    const status = params.status ?? 'published';

    // verify that the document exists
    if (!doc) {
      return Promise.resolve(undefined);
    }

    // check the document matches the status provided in the params
    if (doc.status !== status) {
      return Promise.resolve(undefined);
    }

    return this.mapPost({ entry: doc as PostEntryProps, slug: params.slug });
  }

  async getCategories() {
    return Promise.resolve([]);
  }

  async getTags() {
    return Promise.resolve([]);
  }

  async getTagBySlug() {
    return Promise.resolve(undefined);
  }

  async getCategoryBySlug() {
    return Promise.resolve(undefined);
  }

  private async mapDocumentationPost<
    Type extends {
      entry: DocumentationEntryProps;
      slug: string;
    },
  >(
    item: Type,
    params: {
      fetchContent: boolean;
    } = {
      fetchContent: true,
    },
  ): Promise<Cms.ContentItem> {
    const publishedAt = item.entry.publishedAt
      ? new Date(item.entry.publishedAt)
      : new Date();

    const content = await item.entry.content();
    const html = params.fetchContent
      ? await renderMarkdoc(toMarkdocNode(content.node))
      : [];

    return {
      id: item.slug,
      title: item.entry.title,
      label: item.entry.label,
      url: item.slug,
      slug: item.slug,
      description: item.entry.description,
      publishedAt: publishedAt.toISOString(),
      content: html as string,
      image: item.entry.image ?? undefined,
      status: item.entry.status as Cms.ContentItemStatus,
      collapsible: item.entry.collapsible,
      collapsed: item.entry.collapsed,
      categories:
        (item.entry.categories ?? []).map((item) => {
          return {
            id: item,
            name: item,
            slug: item,
          };
        }) ?? [],
      tags: (item.entry.tags ?? []).map((item) => {
        return {
          id: item,
          name: item,
          slug: item,
        };
      }),
      parentId: item.entry.parent ?? undefined,
      order: item.entry.order ?? 1,
      children: [],
    };
  }

  private async mapPost<
    Type extends {
      entry: PostEntryProps;
      slug: string;
    },
  >(
    item: Type,
    params: {
      fetchContent: boolean;
    } = {
      fetchContent: true,
    },
  ): Promise<Cms.ContentItem> {
    const publishedAt = item.entry.publishedAt
      ? new Date(item.entry.publishedAt)
      : new Date();

    const content = await item.entry.content();
    const html = params.fetchContent
      ? await renderMarkdoc(toMarkdocNode(content.node))
      : [];

    return {
      id: item.slug,
      title: item.entry.title,
      label: item.entry.label,
      url: item.slug,
      slug: item.slug,
      description: item.entry.description,
      publishedAt: publishedAt.toISOString(),
      content: html as string,
      image: item.entry.image ?? undefined,
      status: item.entry.status as Cms.ContentItemStatus,
      categories:
        (item.entry.categories ?? []).map((item) => {
          return {
            id: item,
            name: item,
            slug: item,
          };
        }) ?? [],
      tags: (item.entry.tags ?? []).map((item) => {
        return {
          id: item,
          name: item,
          slug: item,
        };
      }),
      parentId: item.entry.parent ?? undefined,
      order: item.entry.order ?? 1,
      children: [],
    };
  }
}
