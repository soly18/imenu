import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Camera, Trash2 } from 'lucide-react';
import { menuApi } from '@/api';
import { mediaUrl } from '@/api/client';
import { localName } from '@/utils/localName';
import { resizeImage } from '@/utils/resizeImage';
import MenuThumb, { MENU_ICONS } from '@/components/common/MenuThumb';

type Mode = 'groups' | 'items';
const field = 'w-full min-h-[44px] rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3';
const label = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';

export default function MenuEditor({ mode }: { mode: Mode }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [groupFilter, setGroupFilter] = useState<number | 0>(0);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<any | null>(null);      // existing row, or {} for a new one

  const { data: groups = [] } = useQuery({ queryKey: ['menu-groups-all'], queryFn: () => menuApi.groups(true) });
  const { data: items = [] } = useQuery({ queryKey: ['menu-items-all'], queryFn: () => menuApi.items(undefined, true), enabled: mode === 'items' });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['menu-groups-all'] }); qc.invalidateQueries({ queryKey: ['menu-items-all'] }); qc.invalidateQueries({ queryKey: ['menu'] }); qc.invalidateQueries({ queryKey: ['groups'] }); qc.invalidateQueries({ queryKey: ['items'] }); };

  const rows: any[] = mode === 'groups'
    ? groups
    : items.filter((i: any) => (!groupFilter || i.groupId === groupFilter) &&
        (!q || [i.namePrimary, i.nameSecondary, i.nameAr, i.nameRu, i.barcode].some((v) => (v || '').toLowerCase().includes(q.toLowerCase()))));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setEditing({})} className="min-h-[44px] px-4 rounded-xl bg-brand-500 text-white font-semibold flex items-center gap-2">
          <Plus className="w-5 h-5" strokeWidth={2} /> {t(mode === 'groups' ? 'menuEditor.newGroup' : 'menuEditor.newItem')}
        </button>
        {mode === 'items' && <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('menuEditor.search')} className={`${field} !w-56`} />
          <select value={groupFilter} onChange={(e) => setGroupFilter(Number(e.target.value))} className={`${field} !w-auto`}>
            <option value={0}>{t('menuEditor.allGroups')}</option>
            {groups.map((g: any) => <option key={g.id} value={g.id}>{localName(g, i18n.language)}</option>)}
          </select>
        </>}
        <span className="text-sm text-gray-400">{rows.length}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r: any) => (
          <button key={r.id} onClick={() => setEditing(r)}
            className={`text-start rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 flex items-center gap-3 hover:border-brand-400 ${r.isActive === false || r.isActive === 0 ? 'opacity-50' : ''}`}>
            <MenuThumb imageUrl={r.imageUrl} icon={r.icon} className="w-14 h-14" iconClass="w-7 h-7" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-gray-900 dark:text-gray-100 truncate">{localName(r, i18n.language)}</span>
              <span className="block text-xs text-gray-400 truncate">
                {mode === 'items' ? `₪${Number(r.price).toFixed(2)} · ${localName(groups.find((g: any) => g.id === r.groupId), i18n.language)}` : (r.nameSecondary || '')}
              </span>
            </span>
            {(r.isActive === false || r.isActive === 0) && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{t('menuEditor.hidden')}</span>}
          </button>
        ))}
        {!rows.length && <p className="text-gray-400 col-span-full py-8 text-center">{t('menuEditor.empty')}</p>}
      </div>

      {editing && <EditDialog mode={mode} row={editing} groups={groups} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </div>
  );
}

function EditDialog({ mode, row, groups, onClose, onSaved }: { mode: Mode; row: any; groups: any[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const isNew = !row.id;
  const [f, setF] = useState({
    namePrimary: row.namePrimary || '', nameSecondary: row.nameSecondary || '', nameAr: row.nameAr || '', nameRu: row.nameRu || '',
    icon: row.icon || '', color: row.color || '', groupId: row.groupId || groups[0]?.id || 0,
    price: row.price ?? '', priceTakeaway: row.priceTakeaway ?? '', barcode: row.barcode || '', isActive: row.isActive !== false && row.isActive !== 0,
  });
  const [image, setImage] = useState<string | null>(row.imageUrl || null);       // saved picture (URL)
  const [pending, setPending] = useState<string | null>(null);                    // new picture (data URL), uploaded on save
  const [removeImg, setRemoveImg] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const kind = mode;
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const pick = async (file?: File) => {
    if (!file) return;
    try { setPending(await resizeImage(file)); setRemoveImg(false); } catch { toast.error(t('menuEditor.err.BAD_IMAGE')); }
  };

  const save = useMutation({
    mutationFn: async () => {
      const body: any = { ...f, color: f.color || null, icon: f.icon || null };
      let id = row.id as number;
      if (mode === 'groups') { if (isNew) id = (await menuApi.createGroup(body)).id; else await menuApi.updateGroup(id, body); }
      else { if (isNew) id = (await menuApi.createItem(body)).id; else await menuApi.updateItem(id, body); }
      if (pending) await menuApi.uploadImage(kind, id, pending);
      else if (removeImg && row.imageUrl) await menuApi.deleteImage(kind, id);
    },
    onMutate: () => setBusy(true),
    onSuccess: () => { toast.success(t('menuEditor.saved')); onSaved(); },
    onError: (e: any) => { setBusy(false); toast.error(t(`menuEditor.err.${e?.response?.data?.code}`, { defaultValue: t('menuEditor.err.generic') })); },
  });

  const preview = pending || (removeImg ? null : image);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 w-full sm:max-w-xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          {isNew ? t(mode === 'groups' ? 'menuEditor.newGroup' : 'menuEditor.newItem') : f.namePrimary}
        </h2>

        {/* picture */}
        <div className="flex items-center gap-4">
          {preview
            ? <img src={preview.startsWith('data:') ? preview : mediaUrl(preview)} alt="" className="w-24 h-24 object-cover rounded-2xl" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
            : <MenuThumb icon={f.icon} className="w-24 h-24" iconClass="w-10 h-10" />}
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()} className="min-h-[44px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <Camera className="w-5 h-5" strokeWidth={1.75} /> {t('menuEditor.photo')}
            </button>
            {preview && <button type="button" onClick={() => { setPending(null); setRemoveImg(true); }} className="min-h-[36px] px-3 text-sm text-red-600 flex items-center gap-1">
              <Trash2 className="w-4 h-4" strokeWidth={1.75} /> {t('menuEditor.removePhoto')}</button>}
          </div>
        </div>

        {/* icon picker */}
        <div>
          <span className={label}>{t('menuEditor.icon')}</span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => set('icon', '')} className={`h-11 px-3 rounded-lg text-xs border ${!f.icon ? 'border-brand-500 text-brand-600' : 'border-gray-200 dark:border-gray-600 text-gray-500'}`}>{t('menuEditor.noIcon')}</button>
            {Object.entries(MENU_ICONS).map(([k, Ic]) => (
              <button key={k} type="button" onClick={() => set('icon', k)} aria-label={k}
                className={`w-11 h-11 rounded-lg border flex items-center justify-center ${f.icon === k ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-600' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                <Ic className="w-5 h-5" strokeWidth={1.75} />
              </button>
            ))}
          </div>
        </div>

        {/* names */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div><span className={label}>{t('menuEditor.nameHe')}</span><input className={field} dir="rtl" value={f.namePrimary} onChange={(e) => set('namePrimary', e.target.value)} /></div>
          <div><span className={label}>{t('menuEditor.nameEn')}</span><input className={field} dir="ltr" value={f.nameSecondary} onChange={(e) => set('nameSecondary', e.target.value)} /></div>
          <div><span className={label}>{t('menuEditor.nameAr')}</span><input className={field} dir="rtl" value={f.nameAr} onChange={(e) => set('nameAr', e.target.value)} /></div>
          <div><span className={label}>{t('menuEditor.nameRu')}</span><input className={field} dir="ltr" value={f.nameRu} onChange={(e) => set('nameRu', e.target.value)} /></div>
        </div>

        {mode === 'items' ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <div><span className={label}>{t('menuEditor.group')}</span>
              <select className={field} value={f.groupId} onChange={(e) => set('groupId', Number(e.target.value))}>
                {groups.map((g: any) => <option key={g.id} value={g.id}>{g.namePrimary}</option>)}
              </select></div>
            <div><span className={label}>{t('menuEditor.barcode')}</span><input className={field} dir="ltr" value={f.barcode} onChange={(e) => set('barcode', e.target.value)} /></div>
            <div><span className={label}>{t('menuEditor.price')}</span><input className={field} dir="ltr" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} /></div>
            <div><span className={label}>{t('menuEditor.takeawayPrice')}</span><input className={field} dir="ltr" inputMode="decimal" value={f.priceTakeaway} onChange={(e) => set('priceTakeaway', e.target.value)} /></div>
          </div>
        ) : (
          <div><span className={label}>{t('menuEditor.color')}</span>
            <div className="flex items-center gap-3">
              <input type="color" value={f.color || '#cccccc'} onChange={(e) => set('color', e.target.value)} className="w-14 h-11 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent" />
              {f.color && <button type="button" onClick={() => set('color', '')} className="text-sm text-gray-500 underline">{t('menuEditor.noIcon')}</button>}
            </div></div>
        )}

        <label className="flex items-center gap-3 min-h-[44px] text-gray-800 dark:text-gray-100">
          <input type="checkbox" className="w-5 h-5" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} /> {t('menuEditor.visible')}
        </label>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 min-h-[48px] rounded-xl border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 font-semibold">{t('common.cancel')}</button>
          <button onClick={() => save.mutate()} disabled={busy} className="flex-1 min-h-[48px] rounded-xl bg-brand-500 text-white font-semibold disabled:opacity-50">{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
}
