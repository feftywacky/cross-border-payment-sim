// Generate TypeScript types from the FastAPI OpenAPI schema.
//   node scripts/generate.mjs          -> writes openapi.json + src/schema.d.ts
//   node scripts/generate.mjs --check  -> fails if committed files are out of date (CI contract check)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "..");
const api = resolve(pkg, "../../services/api");
const python = process.env.PYTHON ?? (existsSync(`${api}/.venv/bin/python`) ? `${api}/.venv/bin/python` : "python3");
const check = process.argv.includes("--check");

const json = execFileSync(python, ["-m", "scripts.export_openapi"], { cwd: api, encoding: "utf8" });
const ast = await openapiTS(JSON.parse(json));
const header = "// AUTO-GENERATED from services/api OpenAPI. Do not edit; run `npm run contracts`.\n";
const ts = header + astToString(ast);

const targets = [
  [resolve(pkg, "openapi.json"), json],
  [resolve(pkg, "src/schema.d.ts"), ts],
];
let stale = false;
for (const [path, content] of targets) {
  if (check) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      console.error(`contract out of date: ${path}`);
      stale = true;
    }
  } else {
    writeFileSync(path, content);
    console.log(`wrote ${path}`);
  }
}
if (stale) process.exit(1);
