/** Modules that can be switched on/off per customer or per device. Add new ones here and in the app. */
export const FEATURES = [
  { key: 'pos',       label: 'POS / ordering' },
  { key: 'tables',    label: 'Tables map' },
  { key: 'orders',    label: 'Orders board' },
  { key: 'reports',   label: 'Reports (X / Z / declaration)' },
  { key: 'migration', label: 'Legacy data migration' },
  { key: 'admin',     label: 'In-app admin panel' },
  { key: 'backoffice', label: 'Back office' },
] as const;

export type FeatureMap = Record<string, boolean>;

const parse = (v: unknown): FeatureMap => {
  if (!v) return {};
  try { const o = typeof v === 'string' ? JSON.parse(v) : v; return o && typeof o === 'object' ? o as FeatureMap : {}; } catch { return {}; }
};

/** device override > customer setting > on */
export function effectiveFeatures(customerFeatures: unknown, deviceFeatures: unknown): FeatureMap {
  const c = parse(customerFeatures), d = parse(deviceFeatures), out: FeatureMap = {};
  for (const f of FEATURES) out[f.key] = d[f.key] ?? c[f.key] ?? true;
  return out;
}

/** Keep only known keys with boolean values (null/undefined = inherit). */
export function cleanFeatures(v: unknown): FeatureMap | null {
  const o = parse(v), out: FeatureMap = {};
  for (const f of FEATURES) if (typeof o[f.key] === 'boolean') out[f.key] = o[f.key];
  return Object.keys(out).length ? out : null;
}
