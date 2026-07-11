import type { ItemType } from './types';

export type TaskIconKey = 'delivery-box' | 'freight' | 'supplier' | 'assembly' | 'cable' | 'machining' | 'inspection';

export const TASK_ICON_OPTIONS: Array<{ key: TaskIconKey; label: string; type: ItemType }> = [
  { key: 'delivery-box', label: 'Bestellung', type: 'delivery' },
  { key: 'freight', label: 'Spedition', type: 'delivery' },
  { key: 'supplier', label: 'Lieferant', type: 'delivery' },
  { key: 'assembly', label: 'Montage', type: 'work' },
  { key: 'cable', label: 'Elektrik', type: 'work' },
  { key: 'machining', label: 'Fertigung', type: 'work' },
  { key: 'inspection', label: 'Prüfung', type: 'work' },
];

export function TaskIcon({ type, iconKey, size = 17 }: { type: ItemType; iconKey?: string; size?: number }) {
  const key = (iconKey || (type === 'delivery' ? 'delivery-box' : 'assembly')) as TaskIconKey;
  return <svg className="takt-task-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {key === 'delivery-box' ? <><path d="M4 8.2 12 4l8 4.2v8.6L12 21l-8-4.2Z"/><path d="m4.4 8.4 7.6 4 7.6-4M12 12.4V21"/><path d="M7.5 5.9v4.3l2 1"/><path d="M18.5 3v4M16.6 5l1.9 2 1.9-2"/></> : null}
    {key === 'freight' ? <><path d="M3 7h11v9H3zM14 10h3.5l3 3v3H14z"/><path d="M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3 20h18"/><path d="M5.5 10h6"/></> : null}
    {key === 'supplier' ? <><path d="M3 20V9l5 3V8l5 3V5l5 3v12Z"/><path d="M6 16h2M11 16h2M16 16h2"/><path d="M20 4v5M18 6l2-2 2 2"/></> : null}
    {key === 'assembly' ? <><path d="m8.2 7.2 3.8-2.1 3.8 2.1v4.4L12 13.7l-3.8-2.1Z"/><path d="M12 8.6v1.6M5 19l6.3-6.3M4.4 14.7a3.4 3.4 0 0 0 4.9 4.9l-2-2 2.3-2.3 2 2a3.4 3.4 0 0 0-4.9-4.9"/><path d="m15.3 15.3 4.2 4.2"/></> : null}
    {key === 'cable' ? <><path d="M5 5v5M3 7h4M3 10h4v2a3 3 0 0 0 3 3h4"/><path d="M19 19v-5M17 17h4M17 14h4v-2a3 3 0 0 0-3-3h-4"/><circle cx="12" cy="12" r="1.5"/></> : null}
    {key === 'machining' ? <><path d="M8 3h8l-1 5h-6Z"/><path d="M10 8v3l-2 2 2 2-2 2 2 2v2M14 8v3l2 2-2 2 2 2-2 2v2"/><path d="M4 21h16M5 5h14"/><path d="m18 9 2 1-2 1"/></> : null}
    {key === 'inspection' ? <><circle cx="11" cy="11" r="7"/><path d="m16.2 16.2 4.3 4.3M7.5 11l2.2 2.2 4.5-4.6"/><path d="M11 6v1M6 11h1"/></> : null}
    {!TASK_ICON_OPTIONS.some((option) => option.key === key) ? type === 'delivery' ? <><path d="M4 8.2 12 4l8 4.2v8.6L12 21l-8-4.2Z"/><path d="m4.4 8.4 7.6 4 7.6-4M12 12.4V21"/></> : <><path d="M5 19l6-6M7 12a4 4 0 0 0 5 5l7-7-5-5-7 7Z"/></> : null}
  </svg>;
}
