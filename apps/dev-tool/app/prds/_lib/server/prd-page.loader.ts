import 'server-only';
import type { StructuredPRD } from '@kit/mcp-server/prd-manager';

import { getPrdService } from './prd-loader';

/** The PRD document shape rendered by the PRD page components. */
export type PRDData = StructuredPRD;

export type CustomPhase = StructuredPRD['customPhases'][number];

export async function loadPRDPageData(filename: string) {
  try {
    // The service validates the file name at the filesystem boundary, so a
    // traversal attempt in the route segment is rejected here.
    return await getPrdService().load(filename);
  } catch (error) {
    console.error(`Failed to load PRD ${filename}:`, error);
  }
}
