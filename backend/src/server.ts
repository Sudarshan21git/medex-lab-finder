import { loadCatalog } from './catalog';
import { createApp } from './app';

const catalog = loadCatalog();
catalog.warnings.forEach((w) => console.warn('[catalog]', w));

const port = Number(process.env.PORT) || 3000;
createApp(catalog).listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});