export interface PackageUploadEntitlement {
  mode: 'disabled' | 'limited' | 'unlimited';
  dailyLimit?: number;
  maxFileSizeMb?: number;
}

export interface PackageEntitlements {
  version: 1;
  allowedModels?: string[];
  upload?: PackageUploadEntitlement;
}

const MAX_JSON_BYTES = 16 * 1024;
const MAX_MODELS = 128;
const MAX_MODEL_LENGTH = 128;
const MODEL_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

const invalid = (): never => {
  throw new Error('PACKAGE_ENTITLEMENTS_INVALID');
};

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !keys.includes(key))) return invalid();
  if (Object.values(descriptors).some(descriptor => descriptor.get || descriptor.set)) return invalid();
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum) return invalid();
  return value;
}

export function isCanonicalPackageModel(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_MODEL_LENGTH && MODEL_IDENTIFIER.test(value);
}

function normalize(value: unknown): PackageEntitlements | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    if (new TextEncoder().encode(value).byteLength > MAX_JSON_BYTES) return invalid();
    try {
      value = JSON.parse(value);
    } catch {
      return invalid();
    }
    if (value === null) return null;
  }

  const input = record(value, ['version', 'allowedModels', 'upload']);
  if (input.version !== 1) return invalid();
  const result: PackageEntitlements = { version: 1 };

  if (Object.prototype.hasOwnProperty.call(input, 'allowedModels')) {
    const models = input.allowedModels;
    if (!Array.isArray(models) || models.length > MAX_MODELS || !models.every(isCanonicalPackageModel)) return invalid();
    if (new Set(models).size !== models.length) return invalid();
    result.allowedModels = [...models];
  }

  if (Object.prototype.hasOwnProperty.call(input, 'upload')) {
    const upload = record(input.upload, ['mode', 'dailyLimit', 'maxFileSizeMb']);
    if (!['disabled', 'limited', 'unlimited'].includes(upload.mode as string)) return invalid();
    const normalized: PackageUploadEntitlement = { mode: upload.mode as PackageUploadEntitlement['mode'] };
    if (normalized.mode === 'limited') {
      normalized.dailyLimit = positiveInteger(upload.dailyLimit, 1_000_000);
    } else if (Object.prototype.hasOwnProperty.call(upload, 'dailyLimit')) {
      return invalid();
    }
    if (Object.prototype.hasOwnProperty.call(upload, 'maxFileSizeMb')) {
      if (normalized.mode === 'disabled') return invalid();
      normalized.maxFileSizeMb = positiveInteger(upload.maxFileSizeMb, 1024);
    }
    result.upload = normalized;
  }

  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_JSON_BYTES) return invalid();
  return result;
}

/** Invalid stored legacy values do not activate newly introduced rights. */
export function parsePackageEntitlements(value: unknown): PackageEntitlements | null {
  try {
    return normalize(value);
  } catch {
    return null;
  }
}

/** New writes use the strict validator and store only the fixed schema. */
export function normalizePackageEntitlementsInput(value: unknown): string | null {
  const parsed = normalize(value);
  return parsed === null ? null : JSON.stringify(parsed);
}

export function isPackageModelAllowed(value: unknown, model: unknown): boolean {
  const parsed = parsePackageEntitlements(value);
  if (!parsed || parsed.allowedModels === undefined) return true;
  const canonical = typeof model === 'string' ? model : model && typeof model === 'object' ? (model as { model?: unknown }).model : undefined;
  return isCanonicalPackageModel(canonical) && parsed.allowedModels.includes(canonical);
}

export function resolvePackageUploadEntitlement(value: unknown): PackageUploadEntitlement | null {
  return parsePackageEntitlements(value)?.upload ?? null;
}

export function isMissingPackageEntitlementsColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const outer = error as { message?: unknown; driverError?: { message?: unknown } };
  const message = typeof outer.driverError?.message === 'string' ? outer.driverError.message : outer.message;
  return typeof message === 'string' && /\bentitlements\b/i.test(message)
    && /unknown column|no such column|column[\s\S]*does not exist/i.test(message);
}
