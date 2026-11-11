import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { adminApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import PromptModal from '@/components/common/PromptModal';
import { fmtDateTime } from '@/utils/format';

const ROLES = ['admin', 'manager', 'cashier', 'waiter', 'kitchen'] as const;
const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 dark:bg-amber-900/40 dark:text-amber-200',
  allowed: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 dark:bg-green-900/40 dark:text-green-200',
  blocked: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 dark:bg-red-900/40 dark:text-red-200',
};
const card = 'bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 dark:border-gray-700 shadow-sm';
const btn = 'min-h-[44px] px-4 rounded-xl text-sm font-semibold disabled:opacity-50';

/** Turns the server's error code into a message in the user's language. */
function useErr() {
  const { t } = useTranslation();
  return (e: any) => {
    const code = e?.response?.data?.code;
    toast.error(code && t(`admin.err.${code}`, { defaultValue: '' }) || t('common.error'));
  };
}

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative w-14 h-8 rounded-full flex-shrink-0 transition-colors disabled:opacity-40 ${on ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
      <span className={`absolute top-1 w-6 h-6 rounded-full bg-white dark:bg-gray-800 shadow transition-all ${on ? 'start-7' : 'start-1'}`} />
    </button>
  );
}

// ── Users ────────────────────────────────────────────────────────────────────
function UsersTab() {
  const { t, i18n } = useTranslation();
  const me = useAuthStore((s) => s.employee);
  const qc = useQueryClient(); const err = useErr();
  const { data = [] } = useQuery<any[]>({ queryKey: ['admin-users'], queryFn: adminApi.users, refetchInterval: 10_000 });
  const [pinFor, setPinFor] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', role: 'waiter', pin: '' });
  const done = () => qc.invalidateQueries({ queryKey: ['admin-users'] });
  const update = useMutation({ mutationFn: ({ id, b }: { id: number; b: any }) => adminApi.updateUser(id, b), onSuccess: done, onError: err });
  const create = useMutation({
    mutationFn: () => adminApi.createUser(form),
    onSuccess: () => { done(); setAdding(false); setForm({ firstName: '', lastName: '', role: 'waiter', pin: '' }); toast.success(t('admin.userCreated')); },
    onError: err,
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-400">{t('admin.usersHelp')}</p>
        <button className={`${btn} bg-brand-500 text-white flex-shrink-0`} onClick={() => setAdding(true)}>+ {t('admin.addUser')}</button>
      </div>
      {data.map((u) => {
        const self = u.id === me?.id;
        return (
          <div key={u.id} className={`${card} p-4 flex flex-wrap items-center gap-4 ${u.isActive ? '' : 'opacity-60'}`}>
            <div className="w-11 h-11 rounded-full bg-brand-500 text-white font-bold flex items-center justify-center flex-shrink-0">
              {(u.firstName[0] || '') + (u.lastName?.[0] || '')}
            </div>
            <div className="flex-1 min-w-[10rem]">
              <p className="font-bold text-gray-900 dark:text-gray-100 dark:text-gray-100">{u.firstName} {u.lastName}{self && <span className="text-xs text-brand-600 dark:text-brand-400 dark:text-brand-400 font-medium"> · {t('orders.me')}</span>}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-400">
                {u.lastLoginAt ? <>{t('admin.lastLogin')}: <bdi>{fmtDateTime(u.lastLoginAt, i18n.language)}</bdi></> : t('admin.neverLoggedIn')}
              </p>
            </div>
            <select value={u.role} disabled={self || update.isPending}
              onChange={(e) => update.mutate({ id: u.id, b: { role: e.target.value } })}
              className="min-h-[44px] rounded-xl border border-gray-300 dark:border-gray-600 dark:border-gray-600 bg-white dark:bg-gray-800 dark:bg-gray-900 text-gray-900 dark:text-gray-100 dark:text-gray-100 px-3 text-sm disabled:opacity-60">
              {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </select>
            <button className={`${btn} bg-gray-100 dark:bg-gray-700 dark:bg-gray-700 text-gray-700 dark:text-gray-200 dark:text-gray-200`} onClick={() => setPinFor(u)}>🔑 {t('admin.setPin')}</button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-400 w-14 text-end">{u.isActive ? t('admin.enabled') : t('admin.disabled')}</span>
              <Switch on={u.isActive} disabled={self} label={t('admin.enabled')}
                onChange={(v) => update.mutate({ id: u.id, b: { isActive: v } })} />
            </div>
          </div>
        );
      })}

      {pinFor && (
        <PromptModal title={`${t('admin.setPin')}: ${pinFor.firstName}`} hint={t('admin.pinHint')} type="password" numeric
          onClose={() => setPinFor(null)}
          onSave={(pin) => update.mutate({ id: pinFor.id, b: { pin } }, { onSuccess: () => { toast.success(t('admin.pinChanged')); setPinFor(null); } })} />
      )}
      {adding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAdding(false)}>
          <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-3xl w-full max-w-sm p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 dark:text-gray-100">{t('admin.addUser')}</h2>
            {(['firstName', 'lastName'] as const).map((k) => (
              <input key={k} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={t(`admin.${k}`)}
                className="w-full min-h-[48px] rounded-xl border border-gray-300 dark:border-gray-600 dark:border-gray-600 bg-white dark:bg-gray-800 dark:bg-gray-900 text-gray-900 dark:text-gray-100 dark:text-gray-100 px-3" />
            ))}
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full min-h-[48px] rounded-xl border border-gray-300 dark:border-gray-600 dark:border-gray-600 bg-white dark:bg-gray-800 dark:bg-gray-900 text-gray-900 dark:text-gray-100 dark:text-gray-100 px-3">
              {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </select>
            <input dir="ltr" type="password" inputMode="numeric" value={form.pin} placeholder={t('admin.pinHint')}
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
              className="w-full min-h-[48px] rounded-xl border border-gray-300 dark:border-gray-600 dark:border-gray-600 bg-white dark:bg-gray-800 dark:bg-gray-900 text-gray-900 dark:text-gray-100 dark:text-gray-100 px-3 tracking-widest" />
            <div className="flex gap-3 pt-2">
              <button onClick={() => setAdding(false)} className="flex-1 min-h-[48px] rounded-xl bg-gray-100 dark:bg-gray-700 dark:bg-gray-700 text-gray-700 dark:text-gray-200 dark:text-gray-200 font-semibold">{t('common.cancel')}</button>
              <button onClick={() => create.mutate()} disabled={create.isPending} className="flex-1 min-h-[48px] rounded-xl bg-brand-500 text-white font-semibold disabled:opacity-50">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Devices ──────────────────────────────────────────────────────────────────
function DevicesTab() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient(); const err = useErr();
  const { data = [] } = useQuery<any[]>({ queryKey: ['admin-devices'], queryFn: adminApi.devices, refetchInterval: 5_000 });
  const [renaming, setRenaming] = useState<any | null>(null);
  const done = () => { qc.invalidateQueries({ queryKey: ['admin-devices'] }); qc.invalidateQueries({ queryKey: ['admin-summary'] }); };
  const update = useMutation({ mutationFn: ({ id, b }: { id: number; b: any }) => adminApi.updateDevice(id, b), onSuccess: done, onError: err });
  const remove = useMutation({ mutationFn: (id: number) => adminApi.deleteDevice(id), onSuccess: done, onError: err });

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-400">{t('admin.devicesHelp')}</p>
      {data.length === 0 && <p className="text-gray-400 py-8 text-center">{t('admin.noDevices')}</p>}
      {data.map((d) => (
        <div key={d.id} className={`${card} p-4 flex flex-wrap items-center gap-4`}>
          <div className="text-3xl">{d.platform === 'android-app' ? '📱' : '💻'}</div>
          <div className="flex-1 min-w-[12rem]">
            <p className="font-bold text-gray-900 dark:text-gray-100 dark:text-gray-100 flex flex-wrap items-center gap-2">
              {d.name}
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[d.status]}`}>{t(`admin.status.${d.status}`)}</span>
              {d.isThisDevice && <span className="text-xs font-medium text-brand-600 dark:text-brand-400 dark:text-brand-400">{t('admin.thisDevice')}</span>}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-400">
              <bdi dir="ltr">{d.lastIp || '-'}</bdi> · {d.lastUser || '-'} · <bdi>{fmtDateTime(d.lastSeenAt, i18n.language)}</bdi>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {d.status !== 'allowed' && <button className={`${btn} bg-green-600 text-white`} onClick={() => update.mutate({ id: d.id, b: { status: 'allowed' } })}>✓ {t('admin.allow')}</button>}
            {d.status !== 'blocked' && !d.isThisDevice && <button className={`${btn} bg-red-50 dark:bg-red-900/30 dark:bg-red-900/30 text-red-700 dark:text-red-300 dark:text-red-300`} onClick={() => update.mutate({ id: d.id, b: { status: 'blocked' } })}>⛔ {t('admin.block')}</button>}
            <button className={`${btn} bg-gray-100 dark:bg-gray-700 dark:bg-gray-700 text-gray-700 dark:text-gray-200 dark:text-gray-200`} onClick={() => setRenaming(d)}>✏️ {t('admin.rename')}</button>
            {!d.isThisDevice && <button className={`${btn} bg-gray-100 dark:bg-gray-700 dark:bg-gray-700 text-gray-700 dark:text-gray-200 dark:text-gray-200`}
              onClick={() => window.confirm(t('admin.forgetConfirm')) && remove.mutate(d.id)}>🗑</button>}
          </div>
        </div>
      ))}
      {renaming && (
        <PromptModal title={t('admin.rename')} initial={renaming.name} onClose={() => setRenaming(null)}
          onSave={(name) => update.mutate({ id: renaming.id, b: { name } }, { onSuccess: () => setRenaming(null) })} />
      )}
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────
function SettingsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient(); const err = useErr();
  const { data } = useQuery({ queryKey: ['admin-settings'], queryFn: adminApi.settings });
  const save = useMutation({
    mutationFn: (v: boolean) => adminApi.saveSettings({ requireDeviceApproval: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-settings'] }); qc.invalidateQueries({ queryKey: ['admin-devices'] }); qc.invalidateQueries({ queryKey: ['admin-summary'] }); },
    onError: err,
  });
  return (
    <div className={`${card} p-5 flex items-start gap-4`}>
      <Switch on={!!data?.requireDeviceApproval} disabled={!data || save.isPending} label={t('admin.requireApproval')} onChange={(v) => save.mutate(v)} />
      <div>
        <p className="font-bold text-gray-900 dark:text-gray-100 dark:text-gray-100">{t('admin.requireApproval')}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-400 mt-1">{t('admin.requireApprovalHelp')}</p>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'users' | 'devices' | 'settings'>('users');
  const { data: sum } = useQuery({ queryKey: ['admin-summary'], queryFn: adminApi.summary, refetchInterval: 10_000 });
  const tabs = [
    { key: 'users' as const, label: `👥 ${t('admin.users')}` },
    { key: 'devices' as const, label: `📱 ${t('admin.devices')}`, badge: sum?.pendingDevices },
    { key: 'settings' as const, label: `⚙️ ${t('admin.settings')}` },
  ];
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 dark:text-gray-100">{t('admin.title')}</h1>
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 dark:border-gray-700 overflow-x-auto">
        {tabs.map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`min-h-[48px] px-4 text-sm font-medium -mb-px border-b-2 whitespace-nowrap flex items-center gap-2 ${
              tab === tb.key ? 'border-brand-500 text-brand-600 dark:text-brand-400 dark:text-brand-400' : 'border-transparent text-gray-500 dark:text-gray-400 dark:text-gray-400'}`}>
            {tb.label}
            {!!tb.badge && <span className="bg-red-600 text-white text-xs rounded-full px-2 py-0.5">{tb.badge}</span>}
          </button>
        ))}
      </div>
      {tab === 'users' && <UsersTab />}
      {tab === 'devices' && <DevicesTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}
