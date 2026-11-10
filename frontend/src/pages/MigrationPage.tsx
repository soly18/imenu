import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { migrationApi } from '@/api';
import { fmtDateTime } from '@/utils/format';

const BADGE: Record<string, string> = {
  idle: 'bg-gray-100 text-gray-700', offline: 'bg-red-100 text-red-800', error: 'bg-red-100 text-red-800',
  connected: 'bg-blue-100 text-blue-800', needs_approval: 'bg-amber-100 text-amber-800',
  synced: 'bg-green-100 text-green-800', running: 'bg-purple-100 text-purple-800',
};

const input = 'w-full min-h-[44px] rounded-xl border border-gray-300 px-3 text-sm bg-white';
const btn = 'min-h-[44px] px-5 rounded-xl font-semibold text-sm disabled:opacity-50';

export default function MigrationPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['migration'], queryFn: migrationApi.get, refetchInterval: 5000 });
  const cfg = data?.config;

  const [f, setF] = useState({ host: '', port: 3306, user: '', password: '', database: '', charset: 'utf8', autoEnabled: false });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (cfg && !loaded) { setF((p) => ({ ...p, host: cfg.host, port: cfg.port, user: cfg.user, database: cfg.database, charset: cfg.charset, autoEnabled: cfg.autoEnabled })); setLoaded(true); }
  }, [cfg, loaded]);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const [testResult, setTestResult] = useState<any>(null);
  const [found, setFound] = useState<any[] | null>(null);

  const test = useMutation({ mutationFn: () => migrationApi.test(f), onSuccess: setTestResult, onError: () => toast.error(t('common.error')) });
  const save = useMutation({
    mutationFn: () => migrationApi.save(f),
    onSuccess: () => { toast.success(t('migration.saved')); set('password', ''); qc.invalidateQueries({ queryKey: ['migration'] }); },
    onError: () => toast.error(t('migration.fillRequired')),
  });
  const scan = useMutation({ mutationFn: migrationApi.discover, onSuccess: (r) => setFound(r.found), onError: () => toast.error(t('common.error')) });
  const sync = useMutation({
    mutationFn: (dry: boolean) => migrationApi.sync(dry),
    onSuccess: (r, dry) => {
      if (r.ok) toast.success(dry ? t('migration.checkDone') : t('migration.importDone')); else toast.error(r.error || t('common.error'));
      qc.invalidateQueries({ queryKey: ['migration'] });
    },
  });

  const state: string = cfg?.state ?? 'idle';
  const report = cfg?.report;
  const busy = sync.isPending || state === 'running';
  const dl = () => {
    const blob = new Blob([JSON.stringify(cfg.profile, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'legacy-profile.json'; a.click();
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">{t('migration.title')}</h1>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${BADGE[state] ?? BADGE.idle}`}>{t(`migration.state.${state}`)}</span>
      </div>
      <p className="text-gray-600 text-sm">{t('migration.intro')}</p>

      {/* 1. connection */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="font-bold text-gray-900">1. {t('migration.connection')}</h2>
        <p className="text-sm text-gray-500">{t('migration.connectionHelp')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button className={`${btn} bg-gray-900 text-white`} disabled={scan.isPending} onClick={() => { setFound(null); scan.mutate(); }}>
            {scan.isPending ? t('migration.scanning') : `🔎 ${t('migration.find')}`}
          </button>
          {data?.thisDevice?.length > 0 && (
            <span className="text-xs text-gray-500">{t('migration.thisDevice')}: <bdi>{data.thisDevice.map((a: any) => a.address).join(', ')}</bdi></span>
          )}
        </div>
        {found && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 divide-y divide-gray-200 text-sm">
            {found.length === 0 && <p className="p-3 text-gray-500">{t('migration.noneFound')}</p>}
            {found.map((x) => (
              <button key={x.host} onClick={() => { set('host', x.host); set('port', x.port); }} className="w-full text-start p-3 min-h-[44px] hover:bg-white flex flex-wrap gap-x-3">
                <b dir="ltr">{x.host}</b>
                {x.version && <span className="text-green-700">MySQL {x.version}</span>}
                {x.blocked && <span className="text-amber-700">{t('migration.blocked')}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">{t('migration.host')}<input dir="ltr" className={input} value={f.host} onChange={(e) => set('host', e.target.value)} placeholder="192.168.1.20" /></label>
          <label className="text-sm">{t('migration.port')}<input dir="ltr" type="number" className={input} value={f.port} onChange={(e) => set('port', Number(e.target.value))} /></label>
          <label className="text-sm">{t('migration.user')}<input dir="ltr" className={input} value={f.user} onChange={(e) => set('user', e.target.value)} placeholder="imenu_reader" autoComplete="off" /></label>
          <label className="text-sm">{t('migration.password')}<input dir="ltr" type="password" className={input} value={f.password} onChange={(e) => set('password', e.target.value)} placeholder={cfg?.hasPassword ? t('migration.passwordSaved') : ''} autoComplete="new-password" /></label>
          <label className="text-sm">{t('migration.database')}<input dir="ltr" className={input} value={f.database} onChange={(e) => set('database', e.target.value)} /></label>
          <label className="text-sm">{t('migration.charset')}
            <select className={input} value={f.charset} onChange={(e) => set('charset', e.target.value)}>
              <option value="utf8">utf8</option><option value="latin1">latin1</option><option value="cp1255">cp1255 (Hebrew)</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <button className={`${btn} bg-white border border-gray-300 text-gray-800`} disabled={test.isPending} onClick={() => test.mutate()}>{t('migration.test')}</button>
          <button className={`${btn} bg-brand-500 text-white`} disabled={save.isPending} onClick={() => save.mutate()}>{t('migration.save')}</button>
          {testResult && (testResult.ok
            ? <span className="text-sm text-green-700">✅ MySQL <bdi>{testResult.version}</bdi> · {testResult.tables} {t('migration.tables')}</span>
            : <span className="text-sm text-red-700">❌ {testResult.message}</span>)}
        </div>
      </section>

      {/* 2. automatic */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h2 className="font-bold text-gray-900">2. {t('migration.auto')}</h2>
        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
          <input type="checkbox" className="w-6 h-6" checked={f.autoEnabled}
            onChange={(e) => { set('autoEnabled', e.target.checked); if (cfg) migrationApi.save({ ...f, password: '', autoEnabled: e.target.checked }).then(() => qc.invalidateQueries({ queryKey: ['migration'] })); }} />
          <span className="text-sm">{t('migration.autoHelp')}</span>
        </label>
        {cfg && (
          <p className="text-xs text-gray-500">
            {cfg.lastSeenAt && <>{t('migration.lastSeen')}: <bdi>{fmtDateTime(cfg.lastSeenAt, lng)}</bdi> · </>}
            {cfg.lastSyncAt && <>{t('migration.lastSync')}: <bdi>{fmtDateTime(cfg.lastSyncAt, lng)}</bdi></>}
          </p>
        )}
        {cfg?.lastError && state !== 'synced' && <p className="text-sm text-red-700">{cfg.lastError}</p>}
        {state === 'needs_approval' && <p className="text-sm text-amber-800 bg-amber-50 rounded-xl p-3">{t('migration.needsApproval')}</p>}
      </section>

      {/* 3. check & import */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="font-bold text-gray-900">3. {t('migration.review')}</h2>
        <div className="flex flex-wrap gap-3">
          <button className={`${btn} bg-white border border-gray-300 text-gray-800`} disabled={!cfg || busy} onClick={() => sync.mutate(true)}>🔍 {t('migration.checkNow')}</button>
          <button className={`${btn} bg-green-600 text-white`} disabled={!cfg || busy || !report}
            onClick={() => { if (window.confirm(t('migration.confirmImport'))) sync.mutate(false); }}>✅ {t('migration.approve')}</button>
          {cfg?.profile && <button className={`${btn} bg-gray-100 text-gray-700`} onClick={dl}>⬇ {t('migration.downloadProfile')}</button>}
        </div>
        {report && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">{report.dryRun ? t('migration.dryRunNote') : t('migration.importedNote')} · <bdi>{fmtDateTime(report.startedAt, lng)}</bdi></p>
            {report.entities.map((e: any) => (
              <div key={e.entity} className="border border-gray-200 rounded-xl p-3 text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-1 items-baseline">
                  <b>{e.entity}</b>
                  {e.source && <span className="text-xs text-gray-400" dir="ltr">{e.source}</span>}
                  <span>{t('migration.found')} {e.found}</span>
                  <span className="text-green-700">+{e.created}</span><span className="text-blue-700">↻{e.updated}</span>
                  {e.deactivated > 0 && <span className="text-gray-500">⏸{e.deactivated}</span>}
                  {e.skipped > 0 && <span className="text-red-700">✕{e.skipped}</span>}
                </div>
                {e.columns && Object.keys(e.columns).length > 0 && (
                  <p className="text-[11px] text-gray-400 mt-1" dir="ltr">
                    {Object.entries(e.columns).map(([k, v]) => `${k} ← ${v}`).join('   ·   ')}
                  </p>
                )}
                {e.notes.map((n: string, i: number) => <p key={i} className="text-xs text-amber-800 mt-1">⚠ {n}</p>)}
                {e.samples.length > 0 && (
                  <div className="mt-2 text-xs text-gray-600 flex flex-wrap gap-2">
                    {e.samples.map((s: any, i: number) => <span key={i} className="bg-gray-100 rounded-lg px-2 py-1">{Object.values(s).map((v: any) => v === true ? '✓' : v === false ? '✗' : v).join(' · ')}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
