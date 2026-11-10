import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { discoverMysql, localAddresses } from '../migration/discover';
import { getConfig, saveConfig, paramsFor, testConnection, runPipeline } from '../migration/service';
import type { LegacyParams } from '../migration/legacyDb';

const router = Router();
router.use(authenticate, requireRole('admin'));   // migration is an owner/admin task

const CHARSETS = ['utf8', 'latin1', 'cp1255'];
function cleanParams(b: any): { host: string; port: number; user: string; database: string; charset: string } | null {
  const host = String(b?.host ?? '').trim();
  const port = Number(b?.port) || 3306;
  const user = String(b?.user ?? '').trim();
  const database = String(b?.database ?? '').trim();
  const charset = CHARSETS.includes(b?.charset) ? b.charset : 'utf8';
  if (!host || !user || !database || port < 1 || port > 65535) return null;
  if (!/^[\w.\-]+$/.test(host)) return null;            // IP or host name only
  return { host, port, user, database, charset };
}

// GET /api/migration — saved connection (never the password), state, last profile and report
router.get('/', async (req: AuthRequest, res: Response) => {
  return res.json({ config: await getConfig(req.user!.branchId), thisDevice: localAddresses() });
});

// PUT /api/migration — save the connection parameters
router.put('/', async (req: AuthRequest, res: Response) => {
  const p = cleanParams(req.body);
  if (!p) return res.status(400).json({ error: 'Host, user and database are required' });
  const existing = await getConfig(req.user!.branchId);
  if (!req.body.password && !existing?.hasPassword && req.body.password !== '') return res.status(400).json({ error: 'Password is required' });
  await saveConfig(req.user!.branchId, { ...p, password: req.body.password || undefined, autoEnabled: !!req.body.autoEnabled });
  return res.json(await getConfig(req.user!.branchId));
});

// POST /api/migration/discover — find MySQL servers on the networks this device is connected to (Wi-Fi, USB network)
router.post('/discover', async (_req: AuthRequest, res: Response) => {
  const r = await discoverMysql(3306);
  return res.json({ ...r, thisDevice: localAddresses() });
});

// POST /api/migration/test — try the connection (form values, or the saved ones when a field is omitted)
router.post('/test', async (req: AuthRequest, res: Response) => {
  const saved = await paramsFor(req.user!.branchId);
  const p = cleanParams(req.body);
  if (!p && !saved) return res.status(400).json({ error: 'Host, user and database are required' });
  const params: LegacyParams = { ...(saved ?? { password: '' } as any), ...(p ?? {}), password: req.body?.password || saved?.password || '' } as LegacyParams;
  return res.json(await testConnection(params));
});

// POST /api/migration/sync { dryRun: true|false }
// dryRun true  → read everything and report what would happen (writes nothing)
// dryRun false → import, allowed only after a dry run of this exact schema
router.post('/sync', async (req: AuthRequest, res: Response) => {
  const dry = req.body?.dryRun !== false;
  const r = await runPipeline(req.user!.branchId, dry ? 'dry' : 'import', !dry);
  return res.status(r.ok ? 200 : 409).json({ ...r, config: await getConfig(req.user!.branchId) });
});

export default router;
