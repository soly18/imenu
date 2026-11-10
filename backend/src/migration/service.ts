import { pool } from '../db/connection';
import { encrypt, decrypt } from './secret';
import { withLegacy, explainError, type LegacyParams } from './legacyDb';
import { profileLegacy, type LegacyProfile } from './profile';
import { importMasters, type ImportReport } from './importer';

export type MigrationState = 'idle' | 'offline' | 'connected' | 'needs_approval' | 'synced' | 'error' | 'running';

export interface ConnectionConfig {
  host: string; port: number; user: string; database: string; charset: string;
  autoEnabled: boolean; hasPassword: boolean;
  state: MigrationState; lastError: string | null;
  lastSeenAt: string | null; lastSyncAt: string | null; approvedAt: string | null;
  approved: boolean;                 // approval matches the schema seen last
  profile: LegacyProfile | null; report: ImportReport | null;
}

const running = new Set<number>();

async function row(branchId: number) {
  const [r]: any = await pool.execute('SELECT * FROM legacy_connection WHERE branch_id = ?', [branchId]);
  return r[0] ?? null;
}
const parse = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

export async function getConfig(branchId: number): Promise<ConnectionConfig | null> {
  const r = await row(branchId);
  if (!r) return null;
  const profile: LegacyProfile | null = parse(r.profile_json);
  return {
    host: r.host, port: r.port, user: r.db_user, database: r.db_name, charset: r.charset,
    autoEnabled: !!r.auto_enabled, hasPassword: !!r.db_password_enc,
    state: running.has(branchId) ? 'running' : (r.last_state as MigrationState) || 'idle',
    lastError: r.last_error, lastSeenAt: r.last_seen_at, lastSyncAt: r.last_sync_at, approvedAt: r.approved_at,
    approved: !!profile && !!r.approved_signature && r.approved_signature === profile.signature,
    profile, report: parse(r.report_json),
  };
}

export async function saveConfig(branchId: number, c: { host: string; port: number; user: string; password?: string; database: string; charset: string; autoEnabled: boolean }) {
  const old = await row(branchId);
  const enc = c.password ? encrypt(c.password) : old?.db_password_enc ?? null;
  // connecting somewhere else invalidates everything learned from the previous source
  const sameSource = old && old.host === c.host && old.port === c.port && old.db_name === c.database;
  await pool.execute(
    `INSERT INTO legacy_connection (branch_id, host, port, db_user, db_password_enc, db_name, charset, auto_enabled)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE host=VALUES(host), port=VALUES(port), db_user=VALUES(db_user), db_password_enc=VALUES(db_password_enc),
       db_name=VALUES(db_name), charset=VALUES(charset), auto_enabled=VALUES(auto_enabled)`,
    [branchId, c.host, c.port, c.user, enc, c.database, c.charset, c.autoEnabled ? 1 : 0]
  );
  if (old && !sameSource) {
    await pool.execute('UPDATE legacy_connection SET approved_signature=NULL, approved_at=NULL, profile_json=NULL, report_json=NULL, last_state=NULL WHERE branch_id=?', [branchId]);
  }
}

export async function paramsFor(branchId: number): Promise<LegacyParams | null> {
  const r = await row(branchId);
  if (!r || !r.db_password_enc && r.db_password_enc !== '') return null;
  return { host: r.host, port: r.port, user: r.db_user, password: r.db_password_enc ? decrypt(r.db_password_enc) : '', database: r.db_name, charset: r.charset };
}

export async function testConnection(p: LegacyParams) {
  try {
    return await withLegacy(p, async (q) => {
      const [v] = await q('SELECT VERSION() AS v');
      const t = await q('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = \'BASE TABLE\'', [p.database]);
      return { ok: true as const, version: v.v as string, tables: Number(t[0].n) };
    });
  } catch (e) { return { ok: false as const, ...explainError(e) }; }
}

async function setState(branchId: number, state: MigrationState, error: string | null = null, seen = false) {
  await pool.execute(
    `UPDATE legacy_connection SET last_state=?, last_error=?${seen ? ', last_seen_at=UTC_TIMESTAMP()' : ''} WHERE branch_id=?`,
    [state, error, branchId]);
}

/**
 * One full pass: connect → profile the old database → dry-run → (if the schema was approved) import.
 *  - mode 'dry'    : never writes master data
 *  - mode 'import' : writes; only allowed when `approve` is true (admin pressed the button after a dry run on
 *                    this exact schema) or the stored approval already matches the schema
 *  - mode 'auto'   : used by the watcher; imports only when the stored approval matches the schema
 */
export async function runPipeline(branchId: number, mode: 'dry' | 'import' | 'auto', approve = false):
  Promise<{ ok: boolean; state: MigrationState; error?: string; report?: ImportReport }> {
  if (running.has(branchId)) return { ok: false, state: 'running', error: 'A run is already in progress' };
  const params = await paramsFor(branchId);
  if (!params) return { ok: false, state: 'idle', error: 'No connection saved' };
  running.add(branchId);
  try {
    const [[br]]: any = await pool.execute('SELECT vat_rate FROM branches WHERE id = ?', [branchId]);
    const defaultVat = Number(br?.vat_rate ?? 17);
    const result = await withLegacy(params, async (q) => {
      const profile = await profileLegacy(q, params.database);
      const r = await row(branchId);
      const approvedNow = approve || (r.approved_signature && r.approved_signature === profile.signature);
      const stored = parse(r.profile_json) as LegacyProfile | null;
      if (mode === 'import' && !approve && !approvedNow) throw Object.assign(new Error('Run a dry run first and approve it'), { code: 'NOT_APPROVED' });
      // a real import must be backed by a dry-run of this exact schema
      if (approve && (!stored || stored.signature !== profile.signature)) {
        // remember what the old database looks like now, so the screen shows the approval is no longer valid
        await pool.execute('UPDATE legacy_connection SET profile_json=?, last_state=?, last_seen_at=UTC_TIMESTAMP() WHERE branch_id=?', [JSON.stringify(profile), 'needs_approval', branchId]);
        throw Object.assign(new Error('The old database changed since the last dry run: run a dry run again'), { code: 'STALE' });
      }

      const doImport = (mode === 'import' || mode === 'auto') && approvedNow;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const report = await importMasters({ q, profile, db: conn as any, branchId, dryRun: !doImport, defaultVat });
        if (doImport) await conn.commit(); else await conn.rollback();
        return { profile, report, doImport };
      } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    });
    const approvedAfter = result.doImport || (await row(branchId))?.approved_signature === result.profile.signature;
    const state: MigrationState = result.doImport ? 'synced' : approvedAfter ? 'connected' : 'needs_approval';
    await pool.execute(
      `UPDATE legacy_connection SET profile_json=?, report_json=?, last_state=?, last_error=NULL, last_seen_at=UTC_TIMESTAMP()
         ${result.doImport ? ', last_sync_at=UTC_TIMESTAMP(), approved_signature=?, approved_at=COALESCE(approved_at, UTC_TIMESTAMP())' : ''}
       WHERE branch_id=?`,
      result.doImport
        ? [JSON.stringify(result.profile), JSON.stringify(result.report), state, result.profile.signature, branchId]
        : [JSON.stringify(result.profile), JSON.stringify(result.report), state, branchId]);
    return { ok: true, state, report: result.report };
  } catch (e: any) {
    const ex = e?.code === 'NOT_APPROVED' || e?.code === 'STALE' ? { code: e.code, message: e.message } : explainError(e);
    const offline = ['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST'].includes(ex.code);
    if (!['NOT_APPROVED', 'STALE'].includes(ex.code)) await setState(branchId, offline ? 'offline' : 'error', ex.message);
    return { ok: false, state: offline ? 'offline' : 'error', error: ex.message };
  } finally {
    running.delete(branchId);
  }
}

// ── automatic mode ───────────────────────────────────────────────────────────
const TICK_MS = 20_000;
const RESYNC_MS = 10 * 60_000;

/** Every 20 s: for each branch with auto mode on, see whether the old computer is reachable and sync when it is. */
export function startMigrationWatcher() {
  const tick = async () => {
    try {
      const [rows]: any = await pool.execute('SELECT branch_id, last_state, last_sync_at, last_seen_at FROM legacy_connection WHERE auto_enabled = 1');
      for (const r of rows) {
        const wasUp = ['connected', 'synced', 'needs_approval'].includes(r.last_state);
        const last = r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0;
        const due = !wasUp || Date.now() - last > RESYNC_MS;      // just (re)connected, or periodic refresh
        if (due && !running.has(r.branch_id)) {
          const res = await runPipeline(r.branch_id, 'auto');
          if (res.ok) console.log(`[migration] branch ${r.branch_id}: ${res.state}`);
        }
      }
    } catch (e) { console.error('[migration] watcher', e); }
  };
  setInterval(tick, TICK_MS);
  setTimeout(tick, 5_000);
}
