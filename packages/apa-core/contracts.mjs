import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const HERE = dirname(fileURLToPath(import.meta.url));

const registry = JSON.parse(readFileSync(join(HERE, "schemas", "contract-registry.json"), "utf8"));
if (
  registry.schema !== "apa-contract-registry-v1"
  || !Array.isArray(registry.contracts)
  || registry.contracts.some((item) => !item?.id || !item?.file)
) {
  throw new Error("invalid APA core contract registry");
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: false,
});
addFormats(ajv);

const validators = new Map();
for (const item of registry.contracts) {
  const schema = JSON.parse(readFileSync(join(HERE, "schemas", item.file), "utf8"));
  if (schema?.properties?.schema?.const !== item.id) {
    throw new Error(`contract registry id '${item.id}' does not match ${item.file}`);
  }
  validators.set(item.id, ajv.compile(schema));
}

export function contractRegistry() {
  return structuredClone(registry);
}

export function contractNames() {
  return [...validators.keys()];
}

export function validateContract(name, value) {
  const validate = validators.get(name);
  if (!validate) throw new Error(`unknown APA contract '${name}'`);
  const ok = Boolean(validate(value));
  return {
    ok,
    errors: ok
      ? []
      : (validate.errors || []).map((error) => ({
          path: error.instancePath || "/",
          keyword: error.keyword,
          message: error.message || "invalid value",
        })),
  };
}

export function assertContract(name, value) {
  const result = validateContract(name, value);
  if (!result.ok) {
    const detail = result.errors
      .map((error) => `${error.path}: ${error.message}`)
      .join("; ");
    throw new Error(`${name} validation failed: ${detail}`);
  }
  return value;
}
