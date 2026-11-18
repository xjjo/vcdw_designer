import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Ajv from 'ajv';

const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), 'contract.schema.json');

/** The compiled-against contract schema, exported for the API `/api/contract/schema` route. */
export const contractSchema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(contractSchema as any);

export function validateGeneratorDoc(doc: unknown): { valid: boolean; errors: string[] } {
  const valid = validate(doc) as boolean;
  const errors = (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
  return { valid, errors };
}
