#!/usr/bin/env node
/**
 * PictoNet NLU Schema · Test Runner
 * ---------------------------------
 * Validates example JSON files against `pictonet-nlu-1.0.schema.json`.
 *
 * Usage:
 *   npm i -D ajv ajv-formats glob
 *   node test-runner.js
 *
 * Exit code:
 *   0  → all tests passed
 *   1  → one or more tests failed
 */

import fs from "fs";
import path from "path";
import { globSync } from "glob";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const base = path.resolve(process.cwd());
const schemaPath = path.join(base, "pictonet-nlu-1.0.1.schema.json");

if (!fs.existsSync(schemaPath)) {
  console.error("❌ Schema not found:", schemaPath);
  process.exit(1);
}

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const ajv = new Ajv({ strict: true, strictRequired: false, allErrors: true, verbose: false });

addFormats(ajv);

const validate = ajv.compile(schema);

/** Validate all JSON files in a directory pattern. */
function runSet(label, pattern, expectValid) {
  const files = globSync(pattern, { cwd: base, absolute: true });
  let passed = 0;

  console.log(`\n🔹 ${label} TESTS\n`);

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const ok = validate(data);

    if (ok === expectValid) {
      passed++;
      console.log(`  ✔ ${path.relative(base, file)}`);
    } else {
      console.log(`  ✖ ${path.relative(base, file)}`);
      if (validate.errors) {
        console.log(
          validate.errors.map(e => `    → ${e.instancePath || "(root)"} ${e.message}`).join("\n")
        );
      }
    }
  }

  console.log(`\n${label}: ${passed}/${files.length} correct\n`);
  return passed === files.length;
}

// Run both sets
const validOk = runSet("VALID", "tests/valid/**/*.json", true);
const invalidOk = runSet("INVALID", "tests/invalid/**/*.json", false);

if (validOk && invalidOk) {
  console.log("✅ All tests behaved as expected.");
  process.exit(0);
} else {
  console.log("❌ Some tests failed.");
  process.exit(1);
}