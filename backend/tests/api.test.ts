import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { cleanCatalog, readRawCatalog } from '../src/catalog';
import { createApp } from '../src/app';

const raw = readRawCatalog();
const app = createApp(cleanCatalog(raw));

describe('POST /api/plan: catalog examples', () => {
  raw.examples!.forEach((ex, i) => {
    it(`example ${i + 1}: returns exactly the expected response`, async () => {
      const res = await request(app).post('/api/plan').send(ex.request);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(ex.expected);
    });
  });
});

describe('POST /api/plan: errors', () => {
  it('400 EMPTY_SELECTION when testIds is missing', async () => {
    const res = await request(app).post('/api/plan').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'EMPTY_SELECTION', testIds: [] });
  });

  it('400 EMPTY_SELECTION when testIds is empty', async () => {
    const res = await request(app).post('/api/plan').send({ testIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('EMPTY_SELECTION');
  });

  it('400 INVALID_TESTS for unknown and inactive tests', async () => {
    const res = await request(app)
      .post('/api/plan')
      .send({ testIds: ['T01', 'T99', 'T19'] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'INVALID_TESTS', testIds: ['T99', 'T19'] });
  });

  it('422 NOT_AVAILABLE when no plan can cover the selection', async () => {
    const noP08 = createApp(
      cleanCatalog({
        tests: raw.tests,
        packages: raw.packages.filter((p) => p.id !== 'P08'),
      })
    );
    const res = await request(noP08).post('/api/plan').send({ testIds: ['T15'] });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'NOT_AVAILABLE', testIds: ['T15'] });
  });

  it('400 INVALID_REQUEST when testIds is not an array of strings', async () => {
    const res = await request(app).post('/api/plan').send({ testIds: 'T01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('400 INVALID_REQUEST for broken JSON', async () => {
    const res = await request(app)
      .post('/api/plan')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });
});

describe('GET endpoints', () => {
  it('GET /api/tests returns only selectable tests', async () => {
    const res = await request(app).get('/api/tests');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(19);
    expect(res.body.find((t: { id: string }) => t.id === 'T19')).toBeUndefined();
    expect(res.body.find((t: { id: string }) => t.id === 'T15')).toBeDefined();
  });

  it('GET /api/packages returns only usable packages', async () => {
    const res = await request(app).get('/api/packages');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(12);
    expect(res.body.find((p: { id: string }) => p.id === 'P10')).toBeUndefined();
  });
});