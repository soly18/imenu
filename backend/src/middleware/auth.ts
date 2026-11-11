import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/connection';
import type { JwtPayload, UserRole } from '@imenu25/shared';

export interface AuthRequest extends Request {
  user?: JwtPayload;
  deviceUid?: string;
}

// ── live checks: a disabled user or a blocked device is locked out within seconds ──────────
// Tokens stay valid for hours, so each request re-checks the database (cached for a few seconds).
const TTL_MS = 5_000;
const userCache = new Map<number, { at: number; active: boolean; role: UserRole }>();
const deviceCache = new Map<string, { at: number; status: string | null }>();
const policyCache = new Map<number, { at: number; require: boolean }>();

/** Call after any admin change so it applies immediately. */
export function invalidateAuthCache() { userCache.clear(); deviceCache.clear(); policyCache.clear(); }

async function userState(id: number) {
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const [r]: any = await pool.execute('SELECT is_active, role FROM employees WHERE id = ?', [id]);
  const v = { at: Date.now(), active: !!r[0]?.is_active, role: r[0]?.role as UserRole };
  userCache.set(id, v);
  return v;
}
export async function deviceStatus(branchId: number, uid: string): Promise<string | null> {
  const key = `${branchId}:${uid}`;
  const hit = deviceCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.status;
  const [r]: any = await pool.execute('SELECT status FROM devices WHERE branch_id = ? AND device_uid = ?', [branchId, uid]);
  const v = { at: Date.now(), status: (r[0]?.status as string) ?? null };
  deviceCache.set(key, v);
  return v.status;
}
export async function requiresApproval(branchId: number): Promise<boolean> {
  const hit = policyCache.get(branchId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.require;
  const [r]: any = await pool.execute('SELECT require_device_approval AS r FROM branches WHERE id = ?', [branchId]);
  const v = { at: Date.now(), require: !!r[0]?.r };
  policyCache.set(branchId, v);
  return v.require;
}

export const deviceUidOf = (req: Request): string | undefined => {
  const v = req.headers['x-device-id'];
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^[\w-]{8,64}$/.test(s) ? s : undefined;
};

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  try {
    const u = await userState(payload.employeeId);
    if (!u.active) { res.status(401).json({ error: 'User disabled', code: 'USER_DISABLED' }); return; }
    payload.role = u.role;                       // role changes apply immediately, not at next login

    const uid = deviceUidOf(req);
    const st = uid ? await deviceStatus(payload.branchId, uid) : null;
    if (st === 'blocked') { res.status(403).json({ error: 'This device is blocked', code: 'DEVICE_BLOCKED' }); return; }
    // with approval switched on, only allowed devices work (admins are exempt so nobody can lock themselves out)
    if (payload.role !== 'admin' && (await requiresApproval(payload.branchId)) && st !== 'allowed') {
      res.status(403).json({ error: 'This device is waiting for approval', code: 'DEVICE_PENDING' });
      return;
    }
    req.user = payload;
    req.deviceUid = uid;
    next();
  } catch (e) {
    console.error('auth check failed', e);
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
