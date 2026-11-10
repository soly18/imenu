import crypto from 'crypto';
import type { LegacyQuery } from './legacyDb';

export interface LegacyColumn { name: string; type: string; key: string }
export interface LegacyTable { name: string; rows: number; columns: LegacyColumn[] }
export interface LegacyProfile {
  version: string; database: string; takenAt: string;
  tables: LegacyTable[];
  signature: string;     // changes whenever a table/column/type changes: used to invalidate an approval
}

/** Same information as tools/legacy/inspect.sql, gathered automatically. */
export async function profileLegacy(q: LegacyQuery, database: string): Promise<LegacyProfile> {
  const [v] = await q('SELECT VERSION() AS v');
  const tabs = await q(
    `SELECT TABLE_NAME AS name, COALESCE(TABLE_ROWS, 0) AS approxRows
     FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`, [database]);
  const cols = await q(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS ty, COLUMN_KEY AS k
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`, [database]);
  const tables: LegacyTable[] = tabs.map((t: any) => ({
    name: t.name, rows: Number(t.approxRows),
    columns: cols.filter((c: any) => c.t === t.name).map((c: any) => ({ name: c.c, type: c.ty, key: c.k })),
  }));
  const sig = crypto.createHash('sha256')
    .update(tables.map((t) => `${t.name}(${t.columns.map((c) => `${c.name}:${c.type}`).join(',')})`).join('|'))
    .digest('hex');
  return { version: v.v, database, takenAt: new Date().toISOString(), tables, signature: sig };
}
