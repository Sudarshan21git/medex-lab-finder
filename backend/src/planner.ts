import { Catalog, Package } from './types';

export type PlanErrorCode =
  | 'EMPTY_SELECTION'
  | 'INVALID_TESTS'
  | 'NOT_AVAILABLE';

export class PlanError extends Error {
  constructor(public code: PlanErrorCode, public testIds: string[] = []) {
    super(code);
  }
}

export interface PlanItem {
  type: 'package' | 'test';
  id: string;
  name: string;
  price: number;
  covers: string[];
}

export interface Plan {
  items: PlanItem[];
  total: number;
  extraTests: string[];
  individualTotal: number | null;
  savings: number | null;
}

interface Candidate {
  pkg: Package;
  mask: number; // which selected tests this package covers
  extras: string[]; // tests in the package that were not selected
}

interface Option {
  chosen: Candidate[];
  singles: number[]; // indexes of selected tests bought individually
  total: number;
  itemIds: string[]; // sorted
  extras: string[]; // sorted
}

// Rule 2 and 3: cheapest, then fewer items, then fewer extras, then item IDs
function isBetter(a: Option, b: Option): boolean {
  if (a.total !== b.total) return a.total < b.total;
  if (a.itemIds.length !== b.itemIds.length) {
    return a.itemIds.length < b.itemIds.length;
  }
  if (a.extras.length !== b.extras.length) {
    return a.extras.length < b.extras.length;
  }
  for (let i = 0; i < a.itemIds.length; i++) {
    if (a.itemIds[i] !== b.itemIds[i]) return a.itemIds[i] < b.itemIds[i];
  }
  return false;
}

export function buildPlan(catalog: Catalog, requested: string[]): Plan {
  if (!requested || requested.length === 0) {
    throw new PlanError('EMPTY_SELECTION');
  }

  // Rule 5: same test selected twice counts once (keep first position)
  const selected = [...new Set(requested)];

  // Rule 4: unknown or inactive tests can't be selected
  const invalid = selected.filter((id) => {
    const t = catalog.testById.get(id);
    return !t || !t.status;
  });
  if (invalid.length > 0) throw new PlanError('INVALID_TESTS', invalid);

  const index = new Map(selected.map((id, i) => [id, i]));
  const single = selected.map((id) => catalog.testById.get(id)!.price);

  // Only packages that cover at least one selected test matter
  const candidates: Candidate[] = [];
  for (const pkg of catalog.packages) {
    let mask = 0;
    const extras: string[] = [];
    for (const id of pkg.testIds) {
      const i = index.get(id);
      if (i === undefined) extras.push(id);
      else mask |= 1 << i;
    }
    if (mask !== 0) candidates.push({ pkg, mask, extras });
  }

  // Tests with no price that no package covers can't be obtained at all
  const coverable = candidates.reduce((m, c) => m | c.mask, 0);
  const unobtainable = selected.filter(
    (_, i) => single[i] === null && !(coverable & (1 << i))
  );
  if (unobtainable.length > 0) {
    throw new PlanError('NOT_AVAILABLE', unobtainable);
  }

  // Try every combination of the relevant packages
  let best: Option | null = null;
  const k = candidates.length;

  for (let subset = 0; subset < 1 << k; subset++) {
    const chosen: Candidate[] = [];
    let covered = 0;
    let total = 0;
    for (let j = 0; j < k; j++) {
      if (subset & (1 << j)) {
        chosen.push(candidates[j]);
        covered |= candidates[j].mask;
        total += candidates[j].pkg.price;
      }
    }

    const singles: number[] = [];
    let feasible = true;
    for (let i = 0; i < selected.length; i++) {
      if (covered & (1 << i)) continue;
      const price = single[i];
      if (price === null) {
        feasible = false;
        break;
      }
      total += price;
      singles.push(i);
    }
    if (!feasible) continue;
    if (best && total > best.total) continue; // can't win

    const itemIds = [
      ...chosen.map((c) => c.pkg.id),
      ...singles.map((i) => selected[i]),
    ].sort();
    const extras = [...new Set(chosen.flatMap((c) => c.extras))].sort();

    const option: Option = { chosen, singles, total, itemIds, extras };
    if (!best || isBetter(option, best)) best = option;
  }

  // best is never null here: the NOT_AVAILABLE check guarantees a valid plan
  const winner = best!;

  const items: PlanItem[] = [
    ...winner.chosen.map((c): PlanItem => {
      const inPkg = new Set(c.pkg.testIds);
      return {
        type: 'package',
        id: c.pkg.id,
        name: c.pkg.name,
        price: c.pkg.price,
        covers: selected.filter((id) => inPkg.has(id)),
      };
    }),
    ...winner.singles.map((i): PlanItem => {
      const t = catalog.testById.get(selected[i])!;
      return {
        type: 'test',
        id: t.id,
        name: t.name,
        price: t.price as number,
        covers: [t.id],
      };
    }),
  ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const individualTotal = single.some((p) => p === null)
    ? null
    : (single as number[]).reduce((sum, p) => sum + p, 0);

  return {
    items,
    total: winner.total,
    extraTests: winner.extras,
    individualTotal,
    savings: individualTotal === null ? null : individualTotal - winner.total,
  };
}