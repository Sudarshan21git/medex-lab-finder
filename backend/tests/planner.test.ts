import { describe, it, expect } from 'vitest';
import { cleanCatalog, readRawCatalog } from '../src/catalog';
import { buildPlan, PlanError } from '../src/planner';
import { RawCatalog, Test } from '../src/types';

const raw = readRawCatalog();
const catalog = cleanCatalog(raw);

function getError(fn: () => unknown): PlanError {
  try {
    fn();
  } catch (e) {
    return e as PlanError;
  }
  throw new Error('Expected an error but none was thrown');
}

const mk = (id: string, price: number | null): Test => ({
  id,
  code: id,
  name: id,
  price,
  status: true,
});

describe('examples from the catalog file', () => {
  raw.examples!.forEach((ex, i) => {
    it(`example ${i + 1}: ${ex.request.testIds.join(', ')}`, () => {
      expect(buildPlan(catalog, ex.request.testIds)).toEqual(ex.expected);
    });
  });
});

describe('selection rules', () => {
  it('counts a test selected twice only once', () => {
    const plan = buildPlan(catalog, ['T02', 'T02', 'T03']);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].id).toBe('P01');
    expect(plan.items[0].covers).toEqual(['T02', 'T03']);
    expect(plan.individualTotal).toBe(570);
    expect(plan.savings).toBe(70);
  });

  it('lists covers in selection order', () => {
    const plan = buildPlan(catalog, ['T06', 'T04', 'T03', 'T02']);
    expect(plan.items[0].id).toBe('P02');
    expect(plan.items[0].covers).toEqual(['T06', 'T04', 'T03', 'T02']);
  });

  it('buys a single test on its own when that is cheapest', () => {
    const plan = buildPlan(catalog, ['T01']);
    expect(plan.items).toEqual([
      { type: 'test', id: 'T01', name: 'Complete Blood Count', price: 250, covers: ['T01'] },
    ]);
    expect(plan.savings).toBe(0);
  });
});

describe('errors', () => {
  it('EMPTY_SELECTION for nothing selected', () => {
    const err = getError(() => buildPlan(catalog, []));
    expect(err).toBeInstanceOf(PlanError);
    expect(err.code).toBe('EMPTY_SELECTION');
  });

  it('INVALID_TESTS for unknown and inactive tests, in selection order', () => {
    const err = getError(() => buildPlan(catalog, ['T01', 'T99', 'T19']));
    expect(err.code).toBe('INVALID_TESTS');
    expect(err.testIds).toEqual(['T99', 'T19']);
  });

  it('NOT_AVAILABLE when a no-price test has no usable package', () => {
    const noP08 = cleanCatalog({
      tests: raw.tests,
      packages: raw.packages.filter((p) => p.id !== 'P08'),
    });
    const err = getError(() => buildPlan(noP08, ['T01', 'T15']));
    expect(err.code).toBe('NOT_AVAILABLE');
    expect(err.testIds).toEqual(['T15']);
  });
});

describe('catalog mistakes', () => {
  it('removes a duplicate test inside a package (P06)', () => {
    const p06 = catalog.packages.find((p) => p.id === 'P06')!;
    expect(p06.testIds).toHaveLength(7);
    expect(new Set(p06.testIds).size).toBe(7);
  });

  it('ignores an unknown test ID inside a package (P12)', () => {
    const p12 = catalog.packages.find((p) => p.id === 'P12')!;
    expect(p12.testIds).toEqual(['T13', 'T17']);
  });

  it('never uses an inactive package (P10)', () => {
    expect(catalog.packages.find((p) => p.id === 'P10')).toBeUndefined();
  });
});

describe('tie-breaks', () => {
  it('prefers fewer items (P13 vs T06 + T12, both 850)', () => {
    const plan = buildPlan(catalog, ['T06', 'T12']);
    expect(plan.total).toBe(850);
    expect(plan.items.map((i) => i.id)).toEqual(['P13']);
    expect(plan.savings).toBe(0);
  });

  it('prefers fewer extra tests over alphabetical order', () => {
    const c = cleanCatalog({
      tests: [mk('T01', 100), mk('T02', 50)],
      packages: [
        { id: 'P1', name: 'P1', price: 100, testIds: ['T01', 'T02'], status: true },
      ],
    });
    const plan = buildPlan(c, ['T01']);
    expect(plan.items.map((i) => i.id)).toEqual(['T01']);
    expect(plan.extraTests).toEqual([]);
  });

  it('then takes the alphabetically first item IDs', () => {
    const c = cleanCatalog({
      tests: [mk('T01', null), mk('T02', 50), mk('T03', 50)],
      packages: [
        { id: 'P2', name: 'Two', price: 100, testIds: ['T01', 'T02'], status: true },
        { id: 'P1', name: 'One', price: 100, testIds: ['T01', 'T03'], status: true },
      ],
    });
    const plan = buildPlan(c, ['T01']);
    expect(plan.items.map((i) => i.id)).toEqual(['P1']);
    expect(plan.extraTests).toEqual(['T03']);
  });
});

describe('performance', () => {
  it('plans all 19 selectable tests in under 300 ms', () => {
    const all = raw.tests.filter((t) => t.status).map((t) => t.id);
    const start = performance.now();
    buildPlan(catalog, all);
    expect(performance.now() - start).toBeLessThan(300);
  });
});