import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { Catalog } from './types';
import { buildPlan, PlanError } from './planner';

const STATUS_BY_CODE = {
  EMPTY_SELECTION: 400,
  INVALID_TESTS: 400,
  NOT_AVAILABLE: 422,
} as const;

export function createApp(catalog: Catalog) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/tests', (_req, res) => {
    res.json(catalog.tests.filter((t) => t.status));
  });

  app.get('/api/packages', (_req, res) => {
    res.json(catalog.packages);
  });

  app.post('/api/plan', (req: Request, res: Response) => {
    const testIds = req.body?.testIds;

    // No testIds at all, or an empty list: nothing selected
    if (testIds === undefined || testIds === null) {
      return res.status(400).json({ error: 'EMPTY_SELECTION', testIds: [] });
    }

    // Wrong shape: must be an array of strings
    if (
      !Array.isArray(testIds) ||
      !testIds.every((id) => typeof id === 'string')
    ) {
      return res.status(400).json({ error: 'INVALID_REQUEST', testIds: [] });
    }

    try {
      return res.status(200).json(buildPlan(catalog, testIds));
    } catch (err) {
      if (err instanceof PlanError) {
        return res
          .status(STATUS_BY_CODE[err.code])
          .json({ error: err.code, testIds: err.testIds });
      }
      throw err;
    }
  });

  // Broken JSON and unexpected errors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'INVALID_REQUEST', testIds: [] });
    }
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', testIds: [] });
  });

  return app;
}