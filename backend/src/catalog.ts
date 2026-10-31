import fs from 'node:fs';
import path from 'node:path';
import { Catalog, Package, RawCatalog } from './types';

export const DEFAULT_CATALOG_PATH = path.resolve(
  __dirname,
  '../../data/lab-catalog.json'
);

export function readRawCatalog(file = DEFAULT_CATALOG_PATH): RawCatalog {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as RawCatalog;
}

export function cleanCatalog(raw: RawCatalog): Catalog {
  const warnings: string[] = [];
  const testById = new Map(raw.tests.map((t) => [t.id, t]));
  const packages: Package[] = [];

  for (const pkg of raw.packages) {
    if (!pkg.status) continue; // inactive packages can't be used

    const seen = new Set<string>();
    const testIds: string[] = [];

    for (const id of pkg.testIds) {
      if (!testById.has(id)) {
        warnings.push(`Package ${pkg.id} lists unknown test ${id}; ignored`);
        continue;
      }
      if (seen.has(id)) {
        warnings.push(`Package ${pkg.id} lists test ${id} twice; duplicate removed`);
        continue;
      }
      seen.add(id);
      testIds.push(id);
    }

    if (testIds.length === 0) {
      warnings.push(`Package ${pkg.id} has no valid tests; skipped`);
      continue;
    }
    packages.push({ ...pkg, testIds });
  }

  return { tests: raw.tests, testById, packages, warnings };
}

export function loadCatalog(file = DEFAULT_CATALOG_PATH): Catalog {
  return cleanCatalog(readRawCatalog(file));
}