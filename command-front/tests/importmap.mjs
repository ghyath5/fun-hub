// Lets the tests import browser modules that use the page's bare names
// ("simplex-noise", "three", …): resolves them through index.html's import map.
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const json = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{"imports":{}}';
const imports = Object.fromEntries(Object.entries(JSON.parse(json).imports).map(([k, v]) => [k, pathToFileURL(path.join(ROOT, v)).href]));
const hook = `const imports = ${JSON.stringify(imports)};
export async function resolve(spec, ctx, next) {
  return imports[spec] ? { url: imports[spec], shortCircuit: true } : next(spec, ctx);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`);
