import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { loadPRDPageData } from '../_lib/server/prd-page.loader';
import { PRDDetailView } from './_components/prd-detail-view';

interface PRDPageProps {
  params: Promise<{
    filename: string;
  }>;
}

export async function generateMetadata({
  params,
}: PRDPageProps): Promise<Metadata> {
  const { filename } = await params;
  const prd = await loadPRDPageData(filename);

  if (!prd) {
    notFound();
  }

  return {
    title: `${prd.introduction.title} - PRD`,
    description: prd.introduction.overview,
  };
}

export default async function PRDPage({ params }: PRDPageProps) {
  const { filename } = await params;
  const prd = await loadPRDPageData(filename);

  if (!prd) {
    notFound();
  }

  return <PRDDetailView filename={filename} prd={prd} />;
}
