#!/usr/bin/env node
/**
 * Validate a single JSON file against the PictoNet NLU Schema (Draft 2020-12).
 * Usage:
 *   node scripts/validate-one.js path/to/file.json
 */
import fs from "fs";
import path from "path";
import url from "url";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/validate-one.js <json-file>");
  process.exit(1);
}

const base = process.cwd();
const schemaPath = path.join(base, "pictonet-nlu-1.0.1.schema.json");

if (!fs.existsSync(schemaPath)) {
  console.error("❌ Schema not found:", schemaPath);
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error("❌ Input JSON not found:", file);
  process.exit(1);
}

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const data = JSON.parse(fs.readFileSync(file, "utf8"));

const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);

try {
  const validate = ajv.compile(schema);
  const ok = validate(data);
  if (ok) {
    console.log("✅ Valid:", file);
    process.exit(0);
  } else {
    console.log("❌ Invalid:", file);
    console.log(
      validate.errors?.map(e => `${e.instancePath || "(root)"} ${e.message}`).join("\n")
    );
    process.exit(1);
  }
} catch (err) {
  // Fallback: if a meta-schema error ever appears, print a clearer hint.
  console.error("❌ Compile error:", err?.message || err);
  console.error("Hint: using Ajv 2020 build is required for Draft 2020-12.");
  process.exit(1);
}