import path from 'path';

const APP = 'navigate';
const root = process.env.SUITE_DATA_ROOT;

// When SUITE_DATA_ROOT is set, every suite app shares "$SUITE_DATA_ROOT/<app>".
// When unset, fall back to the original in-repo location, copied verbatim from
// the previous definitions in database.ts and pdf.ts. This file sits at the same
// directory depth (server/src/services) as those files, so __dirname matches and
// the fallback is byte-for-byte identical.
export const DATA_DIR = root
  ? path.join(root, APP)
  : path.join(__dirname, '..', '..', 'data');

console.log(`[navigate] data dir: ${DATA_DIR}`);
