// Post-build helper for @shieldfont/core.
//
// The core package's `exports` map exposes each mapping at a subpath —
// `@shieldfont/core/mappings/<variant>` → `./dist/mappings/<variant>.js`
// (with a matching `.d.ts`). tsc doesn't emit those (the mappings are JSON,
// not TS), so this script generates them after the build:
//   - dist/mappings/<name>.json  — the raw mapping (the MAIN export's
//                                  `import ... with { type: "json" }` needs this)
//   - dist/mappings/<name>.js    — an ESM module: `export default <mapping>`
//   - dist/mappings/<name>.d.ts  — its type declaration
import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const pkgDir = process.cwd();
const srcMappings = join(pkgDir, 'src/mappings');
const distMappings = join(pkgDir, 'dist/mappings');

await mkdir(distMappings, { recursive: true });
const files = await readdir(srcMappings);
for (const f of files) {
  if (!f.endsWith('.json')) continue;
  const name = f.replace(/\.json$/, '');
  const json = (await readFile(join(srcMappings, f), 'utf8')).trim();

  // Keep the raw JSON (the main entry imports it with { type: "json" }).
  await copyFile(join(srcMappings, f), join(distMappings, f));

  // ESM module + types so the `./mappings/<name>` subpath export resolves.
  await writeFile(join(distMappings, `${name}.js`), `export default ${json};\n`);
  await writeFile(
    join(distMappings, `${name}.d.ts`),
    `declare const mapping: Record<string, string>;\nexport default mapping;\n`,
  );
  console.log(`emitted ${name}.{json,js,d.ts} → dist/mappings/`);
}
