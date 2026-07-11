import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Box, CalendarDays, Check, ChevronRight,
  CalendarRange, ChartGantt, CircleAlert, CircleDot, Clock3, Factory, GripVertical,
  Download, FlaskConical, Link2, LockKeyhole, PackageCheck, PanelLeftClose,
  PanelLeftOpen, Pause, Pencil, Plus, RefreshCw, Search, Trash2, Truck,
  UnlockKeyhole, Upload, Users, Wrench, X,
} from 'lucide-react';
import type { ItemType, PlanItem, Project, Status } from './types';

const DAY = 86_400_000;
const today = new Date().toISOString().slice(0, 10);
const colors = ['#e8a83e', '#6ca6a1', '#d7795f', '#778cba', '#87a767'];
const statusLabels: Record<Status, string> = { open: 'Offen', active: 'Läuft', done: 'Erledigt' };
const changeLabels: Record<PlanItem['change_type'], string> = { none: 'Keine Abweichung', delay: 'Verspätung', early: 'Früher', pause: 'Unterbrechung', info: 'Hinweis' };

function parseDate(value: string) { return new Date(`${value}T12:00:00`); }
function formatDate(value?: string, withYear = false) {
  if (!value) return '–';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).format(parseDate(value));
}
function formatWeekday(value: string) { return new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(parseDate(value)); }
function formatCompactDate(value: string) { return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(parseDate(value)); }
function daysBetween(a: string, b: string) { return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY); }
function addDays(date: string, days: number) { const result = parseDate(date); result.setDate(result.getDate() + days); return result.toISOString().slice(0, 10); }
function isBusinessDay(date: string) { const day = parseDate(date).getDay(); return day !== 0 && day !== 6; }
function nextBusinessDay(date: string, includeCurrent = false) { let cursor = includeCurrent ? date : addDays(date, 1); while (!isBusinessDay(cursor)) cursor = addDays(cursor, 1); return cursor; }
function addBusinessDays(date: string, days: number) { let cursor = isBusinessDay(date) ? date : nextBusinessDay(date, true); const direction = days < 0 ? -1 : 1; let remaining = Math.abs(days); while (remaining > 0) { cursor = addDays(cursor, direction); if (isBusinessDay(cursor)) remaining -= 1; } return cursor; }
function businessDaysBetween(start: string, end: string) { let cursor = start; let count = 0; while (cursor <= end) { if (isBusinessDay(cursor)) count += 1; cursor = addDays(cursor, 1); } return Math.max(1, count); }
function businessDayDistance(start: string, end: string) { if (start === end) return 0; const direction = end > start ? 1 : -1; let cursor = start; let count = 0; while (cursor !== end) { cursor = addDays(cursor, direction); if (isBusinessDay(cursor)) count += direction; } return count; }
function mondayOf(date: string) { const day = parseDate(date).getDay() || 7; return addDays(date, 1 - day); }
function fridayOf(date: string) { return addDays(mondayOf(date), 4); }
function getWorkdays(start: string, end: string) { const days: string[] = []; for (let cursor = mondayOf(start); cursor <= fridayOf(end); cursor = addDays(cursor, 1)) if (isBusinessDay(cursor)) days.push(cursor); return days; }
function isoWeek(date: string) { const value = parseDate(date); value.setHours(0, 0, 0, 0); value.setDate(value.getDate() + 3 - ((value.getDay() + 6) % 7)); const weekOne = new Date(value.getFullYear(), 0, 4); return 1 + Math.round(((value.getTime() - weekOne.getTime()) / DAY - 3 + ((weekOne.getDay() + 6) % 7)) / 7); }

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }));
    throw new Error(body.error || 'Die Änderung konnte nicht gespeichert werden.');
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

type ItemDraft = Omit<PlanItem, 'id' | 'project_id' | 'sort_order'>;
const emptyItem = (date = today): ItemDraft => {
  const start = nextBusinessDay(date, true);
  const end = addBusinessDays(start, 4);
  return { type: 'work', title: '', partner: '', start_date: start, end_date: end, status: 'open', previous_status: 'open', schedule_mode: 'auto', extension_days: 0, extension_reason: '', baseline_start_date: start, baseline_end_date: end, actual_end_date: '', pull_forward: 0, change_type: 'none', change_reason: '', notes: '', dependency_ids: [] };
};

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [projectModal, setProjectModal] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem('takt-sidebar') === 'collapsed');
  const importInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      setProjects(await api<Project[]>('/api/projects'));
    } catch (err) { setError(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const selected = projects.find((project) => project.id === selectedId);
  const selectProject = (id: number) => { setSelectedId(id); setSidebarCollapsed(true); window.localStorage.setItem('takt-sidebar', 'collapsed'); };
  const importPayload = async (payload: unknown, label: string) => {
    try {
      setError('');
      const result = await api<{ imported: number }>('/api/import', { method: 'POST', body: JSON.stringify(payload) });
      await load();
      setNotice(`${result.imported} ${result.imported === 1 ? 'Projekt' : 'Projekte'} aus ${label} hinzugefügt.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Import fehlgeschlagen.'); }
  };
  const handleImportFile = async (file?: File) => {
    if (!file) return;
    try { await importPayload(JSON.parse(await file.text()), file.name); }
    catch { setError('Die ausgewählte Datei ist kein gültiges TAKT-JSON.'); }
  };
  const loadTestScenarios = async () => {
    if (!window.confirm('Drei zusätzliche Testszenarien mit komplexen Abhängigkeiten laden?')) return;
    try { await importPayload(await fetch('/test-scenarios.json').then((response) => response.json()), 'Testszenarien'); }
    catch { setError('Die Testszenarien konnten nicht geladen werden.'); }
  };
  const exportProjects = async () => {
    try {
      const payload = await api<unknown>('/api/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `takt-export-${today}.json`; link.click(); URL.revokeObjectURL(url);
      setNotice('JSON-Export wurde erstellt.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Export fehlgeschlagen.'); }
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => setSelectedId(null)} aria-label="Zur Übersicht">
          <span className="brand-mark"><Factory size={20} strokeWidth={2.4} /></span>
          <span><strong>TAKT</strong><small>Produktionsplan</small></span>
        </button>
        <button className="sidebar-toggle" onClick={() => setSidebarCollapsed((current) => { const next = !current; window.localStorage.setItem('takt-sidebar', next ? 'collapsed' : 'open'); return next; })} aria-label={sidebarCollapsed ? 'Navigation ausklappen' : 'Navigation einklappen'}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
        <nav>
          <button className={!selected ? 'active' : ''} onClick={() => setSelectedId(null)}><CircleDot size={18} /> Übersicht</button>
          <div className="nav-label">Laufende Aufträge</div>
          {projects.map((project) => (
            <button className={selectedId === project.id ? 'active project-nav' : 'project-nav'} key={project.id} onClick={() => selectProject(project.id)}>
              <i style={{ background: project.color }} /> <span>{project.name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot"><Users size={16} /><span>Team-Board<br /><small>Gemeinsamer Stand</small></span></div>
      </aside>

      <main>
        {error ? <div className="error-banner"><AlertTriangle size={18} /> {error}<button onClick={() => void load()}><RefreshCw size={16} /> Neu laden</button></div> : null}
        {notice ? <div className="notice-banner"><Check /> {notice}<button onClick={() => setNotice('')} aria-label="Hinweis schließen"><X /></button></div> : null}
        {loading ? <Loading /> : selected ? <ProjectDetail project={selected} onBack={() => setSelectedId(null)} onChange={load} /> : (
          <Dashboard projects={projects} search={search} setSearch={setSearch} onSelect={selectProject} onAdd={() => setProjectModal(true)} onImport={() => importInput.current?.click()} onExport={exportProjects} onLoadTests={loadTestScenarios} />
        )}
      </main>
      <input ref={importInput} hidden type="file" accept="application/json,.json" onChange={(event) => { void handleImportFile(event.target.files?.[0]); event.target.value = ''; }} />
      {projectModal ? <ProjectModal projects={projects} onClose={() => setProjectModal(false)} onSaved={async (id) => { await load(); setProjectModal(false); selectProject(id); }} /> : null}
    </div>
  );
}

function Loading() {
  return <div className="loading"><RefreshCw className="spin" /><span>Produktionsplan wird geladen …</span></div>;
}

function Dashboard({ projects, search, setSearch, onSelect, onAdd, onImport, onExport, onLoadTests }: {
  projects: Project[]; search: string; setSearch: (value: string) => void; onSelect: (id: number) => void; onAdd: () => void; onImport: () => void; onExport: () => void; onLoadTests: () => void;
}) {
  const filtered = projects.filter((project) => `${project.name} ${project.customer}`.toLowerCase().includes(search.toLowerCase()));
  const delayed = projects.filter((project) => project.forecast.completion > project.target_date).length;
  const openDeliveries = projects.flatMap((project) => project.items).filter((item) => item.type === 'delivery' && item.status !== 'done').length;
  const nextCompletion = projects.map((project) => project.forecast.completion).filter(Boolean).sort()[0];

  return <div className="page dashboard-page">
    <header className="page-header">
      <div><span className="eyebrow">{formatWeekday(today)} · {formatDate(today, true)}</span><h1>Was steht an?</h1><p>Der gemeinsame Blick auf Lieferungen, Arbeiten und mögliche Auslieferungen.</p></div>
      <div className="dashboard-actions"><button className="tool-button" onClick={onLoadTests}><FlaskConical /> Testszenarien</button><button className="tool-button" onClick={onImport}><Upload /> Import</button><button className="tool-button" onClick={onExport}><Download /> Export</button><button className="primary" onClick={onAdd}><Plus size={18} /> Neuer Auftrag</button></div>
    </header>

    <section className="pulse-strip">
      <div><span className="pulse-icon safe"><Factory /></span><p><strong>{projects.length}</strong><small>Laufende Aufträge</small></p></div>
      <div><span className={`pulse-icon ${delayed ? 'danger' : 'safe'}`}><AlertTriangle /></span><p><strong>{delayed}</strong><small>Termin gefährdet</small></p></div>
      <div><span className="pulse-icon warm"><Truck /></span><p><strong>{openDeliveries}</strong><small>Lieferungen offen</small></p></div>
      <div><span className="pulse-icon cool"><CalendarDays /></span><p><strong>{formatDate(nextCompletion)}</strong><small>Nächste Fertigstellung</small></p></div>
    </section>

    <div className="section-heading"><div><h2>Aktive Aufträge</h2><span>{filtered.length} im Blick</span></div><label className="search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Auftrag oder Kunde suchen" /></label></div>
    <section className="project-grid">
      {filtered.map((project, index) => <ProjectCard key={project.id} project={project} index={index} onClick={() => onSelect(project.id)} />)}
      {filtered.length === 0 ? <div className="empty"><Box /><h3>Keine Aufträge gefunden</h3><p>Lege einen neuen Auftrag an oder ändere die Suche.</p></div> : null}
    </section>
  </div>;
}

function ProjectCard({ project, index, onClick }: { project: Project; index: number; onClick: () => void }) {
  const completion = project.forecast.completion;
  const delta = completion ? daysBetween(project.target_date, completion) : 0;
  const done = project.items.filter((item) => item.status === 'done').length;
  const progress = project.items.length ? Math.round(done / project.items.length * 100) : 0;
  const lateItems = project.items.filter((item) => item.status !== 'done' && item.end_date < today);
  const state = delta > 0 || lateItems.length ? 'danger' : delta >= -3 ? 'warning' : 'good';
  const next = project.items.filter((item) => item.status !== 'done').sort((a, b) => a.end_date.localeCompare(b.end_date))[0];

  return <button className="project-card" style={{ '--accent': project.color, '--delay': `${index * 70}ms` } as React.CSSProperties} onClick={onClick}>
    <div className="card-top"><span className="project-code">{project.customer || 'Eigener Auftrag'}</span><span className={`state-pill ${state}`}>{state === 'danger' ? 'Prüfen' : state === 'warning' ? 'Knapp' : 'Im Plan'}</span></div>
    <h3>{project.name}</h3>
    <div className="date-pair"><div><small>Prognose</small><strong>{formatDate(completion, true)}</strong></div><ArrowRight /><div><small>Zieltermin</small><strong>{formatDate(project.target_date, true)}</strong></div></div>
    <div className="progress"><div style={{ width: `${progress}%` }} /><span>{progress}% erledigt</span></div>
    <div className="card-next">{next ? <><span className={next.type}><ItemIcon type={next.type} /></span><p><small>{next.type === 'delivery' ? 'Nächste Lieferung' : 'Nächste Arbeit'}</small>{next.title}</p><time>{formatDate(next.end_date)}</time></> : <><PackageCheck /><p>Alles erledigt</p></>}</div>
    <span className="open-link">Zeitplan öffnen <ChevronRight size={17} /></span>
  </button>;
}

function ProjectDetail({ project, onBack, onChange }: { project: Project; onBack: () => void; onChange: () => Promise<void> }) {
  const [itemModal, setItemModal] = useState<{ item?: PlanItem; type?: ItemType } | null>(null);
  const [editProject, setEditProject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'timeline' | 'calendar'>('timeline');
  const [editMode, setEditMode] = useState(false);
  const completionDelta = project.forecast.completion ? businessDayDistance(project.target_date, project.forecast.completion) : 0;
  const available = project.items.filter((item) => item.type === 'work' && item.status !== 'done' && item.dependency_ids.every((id) => project.items.find((candidate) => candidate.id === id)?.status === 'done'));
  const autoShifted = project.items.filter((item) => item.schedule_mode === 'auto' && project.forecast.itemForecasts[item.id]?.shifted && item.status !== 'done');

  const toggleDone = async (item: PlanItem) => {
    setSaving(true);
    const done = item.status !== 'done';
    const actualDate = item.type === 'work' && !isBusinessDay(today) ? addBusinessDays(today, -1) : today;
    await api(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: done ? 'done' : item.previous_status || 'open', previous_status: done ? item.status : item.previous_status, actual_end_date: done ? actualDate : '' }) });
    await onChange();
    setSaving(false);
  };

  const moveItem = async (item: PlanItem, workdayDelta: number) => {
    if (!workdayDelta) return;
    setSaving(true);
    const startDate = addBusinessDays(item.start_date, workdayDelta);
    const endDate = addBusinessDays(item.end_date, workdayDelta);
    const changeType = endDate > item.baseline_end_date ? 'delay' : endDate < item.baseline_end_date ? 'early' : 'none';
    await api(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ start_date: startDate, end_date: endDate, change_type: changeType, change_reason: changeType === 'none' ? '' : item.change_reason }) });
    await onChange();
    setItemModal({ item: { ...item, start_date: startDate, end_date: endDate, change_type: changeType, change_reason: changeType === 'none' ? '' : item.change_reason } });
    setSaving(false);
  };

  return <div className="page detail-page">
    <header className="detail-header">
      <button className="back" onClick={onBack}><ArrowLeft size={18} /> Übersicht</button>
      <div className="detail-title"><i style={{ background: project.color }} /><div><span className="eyebrow">{project.customer || 'Interner Auftrag'}</span><h1>{project.name}</h1></div></div>
      <div className="header-actions"><button className="secondary" onClick={() => setEditProject(true)}><Pencil size={16} /> Auftrag</button><button className="primary" onClick={() => setItemModal({})}><Plus size={18} /> Eintrag hinzufügen</button></div>
    </header>

    <section className="detail-summary">
      <div><small>Mögliche Fertigstellung</small><strong>{formatDate(project.forecast.completion, true)}</strong><span className={completionDelta > 0 ? 'text-danger' : 'text-good'}>{completionDelta > 0 ? `${completionDelta} Arbeitstage nach Ziel` : `${Math.abs(completionDelta)} Arbeitstage Puffer`}</span></div>
      <div><small>Gewünschter Termin</small><strong>{formatDate(project.target_date, true)}</strong><span>manuell festgelegt</span></div>
      <div><small>Heute möglich</small><strong>{available.length} {available.length === 1 ? 'Arbeit' : 'Arbeiten'}</strong><span>{available[0]?.title || 'Abhängigkeiten prüfen'}</span></div>
      <div><small>Fortschritt</small><strong>{project.items.filter((item) => item.status === 'done').length} / {project.items.length}</strong><span>Einträge erledigt</span></div>
    </section>

    <section className="timeline-section">
      <div className="planning-toolbar">
        <div><h2>Produktionsplan</h2><span>Montag bis Freitag · alle Termine sind Arbeitstage</span></div>
        <div className={`today-context ${isBusinessDay(today) ? '' : 'weekend'}`}><CalendarDays /><div><strong>Heute · {formatWeekday(today)}, {formatCompactDate(today)}</strong><small>{isBusinessDay(today) ? 'Aktueller Arbeitstag' : `Außerhalb der Arbeitswoche · nächster Arbeitstag ${formatWeekday(nextBusinessDay(today))}, ${formatCompactDate(nextBusinessDay(today))}`}</small></div></div>
        <div className="toolbar-actions">
          <div className="view-switch"><button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}><ChartGantt /> Zeitstrahl</button><button className={view === 'calendar' ? 'active' : ''} onClick={() => { setView('calendar'); setEditMode(false); }}><CalendarRange /> Kalender</button></div>
          {view === 'timeline' ? <button className={`edit-toggle ${editMode ? 'active' : ''}`} onClick={() => setEditMode((current) => !current)}>{editMode ? <UnlockKeyhole /> : <LockKeyhole />}{editMode ? 'Verschieben aktiv' : 'Balken verschieben'}</button> : null}
        </div>
      </div>
      {project.forecast.conflicts.length ? <div className="planning-alert danger"><CircleAlert /><div><strong>{project.forecast.conflicts.length} Planungskonflikt{project.forecast.conflicts.length > 1 ? 'e' : ''}</strong><span>Ein festgehaltener Termin liegt vor seiner Voraussetzung. Rot markierte Arbeit prüfen.</span></div></div> : null}
      {autoShifted.length ? <div className="planning-alert info"><Link2 /><div><strong>{autoShifted.length} Arbeit{autoShifted.length > 1 ? 'en wurden' : ' wurde'} automatisch eingereiht</strong><span>Die Abhängigkeiten haben den tatsächlichen Start nach hinten verschoben.</span></div></div> : null}
      {view === 'timeline'
        ? <Timeline project={project} onEdit={(item) => setItemModal({ item })} onToggleDone={toggleDone} onMove={moveItem} saving={saving} editMode={editMode} />
        : <WorkCalendar project={project} onEdit={(item) => setItemModal({ item })} />}
    </section>

    {project.notes ? <aside className="project-note"><span>NOTIZ</span><p>{project.notes}</p></aside> : null}
    {editProject ? <EditProjectModal project={project} onClose={() => setEditProject(false)} onSaved={async () => { await onChange(); setEditProject(false); }} /> : null}
    {itemModal ? <ItemModal project={project} item={itemModal.item} defaultType={itemModal.type} onClose={() => setItemModal(null)} onSaved={async () => { await onChange(); setItemModal(null); }} /> : null}
  </div>;
}

const DAY_WIDTH = 34;
const INFO_WIDTH = 220;
const STATUS_WIDTH = 104;

function planningDays(project: Project) {
  const dates = project.items.flatMap((item) => [item.start_date, item.end_date, project.forecast.itemForecasts[item.id]?.end || item.end_date]);
  dates.push(today, project.target_date);
  const sorted = dates.sort();
  return getWorkdays(addBusinessDays(sorted[0] || today, -2), addBusinessDays(sorted.at(-1) || addDays(today, 30), 3));
}

function Timeline({ project, onEdit, onToggleDone, onMove, saving, editMode }: { project: Project; onEdit: (item: PlanItem) => void; onToggleDone: (item: PlanItem) => void; onMove: (item: PlanItem, days: number) => void; saving: boolean; editMode: boolean }) {
  const workdays = useMemo(() => planningDays(project), [project]);
  const index = useMemo(() => new Map(workdays.map((date, position) => [date, position])), [workdays]);
  const drag = useRef<{ itemId: number; x: number } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ item: PlanItem; forecast: Project['forecast']['itemForecasts'][number]; dependencies: string[]; x: number; y: number; placement: 'top' | 'bottom' } | null>(null);
  const gridWidth = workdays.length * DAY_WIDTH;
  const fullWidth = INFO_WIDTH + gridWidth + STATUS_WIDTH;
  const positionOf = (date: string) => index.get(isBusinessDay(date) ? date : nextBusinessDay(date, true)) ?? 0;
  const todayIndex = positionOf(today);
  const dependencyPaths = project.items.flatMap((item, itemIndex) => item.dependency_ids.flatMap((dependencyId) => {
    const dependencyIndex = project.items.findIndex((candidate) => candidate.id === dependencyId);
    const dependencyForecast = project.forecast.itemForecasts[dependencyId];
    const itemForecast = project.forecast.itemForecasts[item.id];
    if (dependencyIndex < 0 || !dependencyForecast || !itemForecast) return [];
    const x1 = (positionOf(dependencyForecast.end) + 1) * DAY_WIDTH - 5;
    const x2 = positionOf(itemForecast.start) * DAY_WIDTH + 4;
    const y1 = dependencyIndex * 74 + 37;
    const y2 = itemIndex * 74 + 37;
    const elbow = Math.max(x1, x2) + 12;
    return [{ id: `${dependencyId}-${item.id}`, path: `M ${x1} ${y1} H ${elbow} V ${y2} H ${x2}`, conflict: itemForecast.conflict }];
  }));

  return <><div className={`timeline-scroll dense ${editMode ? 'edit-mode' : ''}`}><div className="timeline dense-timeline" style={{ width: fullWidth }}>
    <div className="timeline-head dense-head" style={{ gridTemplateColumns: `${INFO_WIDTH}px ${gridWidth}px ${STATUS_WIDTH}px` }}>
      <div>Vorgang / Abhängigkeit</div>
      <div className="day-axis" style={{ gridTemplateColumns: `repeat(${workdays.length}, ${DAY_WIDTH}px)` }}>{workdays.map((date) => <span className={`${date === today ? 'today' : ''} ${parseDate(date).getDay() === 1 ? 'monday' : ''}`} key={date}><small>{new Intl.DateTimeFormat('de-DE', { weekday: 'short' }).format(parseDate(date)).slice(0, 2)}</small><strong>{formatCompactDate(date)}</strong>{parseDate(date).getDay() === 1 ? <i>KW {isoWeek(date)}</i> : null}</span>)}</div>
      <div>Status</div>
    </div>
    {isBusinessDay(today) ? <div className="today-line dense-today" style={{ left: INFO_WIDTH + todayIndex * DAY_WIDTH + DAY_WIDTH / 2 }}><span>Heute</span></div> : null}
    <svg className="dependency-lines" aria-hidden="true" style={{ left: INFO_WIDTH, top: 64, width: gridWidth, height: project.items.length * 74 }}>
      <defs><marker id="dependency-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" /></marker></defs>
      {dependencyPaths.map((connection) => <path key={connection.id} d={connection.path} className={connection.conflict ? 'conflict' : ''} markerEnd="url(#dependency-arrow)" />)}
    </svg>
    {project.items.map((item) => {
      const forecast = project.forecast.itemForecasts[item.id];
      if (!forecast) return null;
      const dependencies = item.dependency_ids.map((id) => project.items.find((candidate) => candidate.id === id)?.title).filter((value): value is string => Boolean(value));
      const plannedStart = positionOf(item.start_date);
      const plannedEnd = positionOf(item.end_date);
      const baselineStart = positionOf(item.baseline_start_date || item.start_date);
      const baselineEnd = positionOf(item.baseline_end_date || item.end_date);
      const actualStart = positionOf(item.type === 'delivery' ? forecast.end : forecast.start);
      const baseEnd = positionOf(forecast.base_end);
      const actualEnd = positionOf(forecast.end);
      const baseWidth = Math.max(DAY_WIDTH, (baseEnd - actualStart + 1) * DAY_WIDTH);
      const extensionWidth = Math.max(0, (actualEnd - baseEnd) * DAY_WIDTH);
      const hasBaselineChange = item.baseline_start_date !== item.start_date || item.baseline_end_date !== item.end_date;
      const deviationTitle = item.change_type !== 'none' ? `${changeLabels[item.change_type]}: ${item.change_reason || 'Grund noch nicht eingetragen'}` : '';
      const dragStart = (event: React.DragEvent) => { drag.current = { itemId: item.id, x: event.clientX }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(item.id)); };
      const dragEnd = (event: React.DragEvent) => { if (!drag.current || drag.current.itemId !== item.id) return; const delta = Math.round((event.clientX - drag.current.x) / DAY_WIDTH); drag.current = null; if (delta) void onMove(item, delta); };
      return <div className={`timeline-row dense-row ${item.status === 'done' ? 'is-done' : ''} ${forecast.conflict ? 'has-conflict' : ''}`} style={{ gridTemplateColumns: `${INFO_WIDTH}px ${gridWidth}px ${STATUS_WIDTH}px` }} key={item.id}>
        <button className="task-info dense-info" onClick={() => onEdit(item)}><span className={item.type}><ItemIcon type={item.type} /></span><p><strong>{item.title}</strong><small>{dependencies.length ? `Nach: ${dependencies.join(', ')}` : item.partner || (item.type === 'delivery' ? 'Lieferant offen' : 'Frei einplanbar')}</small>{forecast.conflict ? <em><CircleAlert /> Erst ab {formatDate(forecast.required_start)} möglich</em> : forecast.pulled_forward ? <em className="pulled"><ArrowLeft /> Nachgezogen auf {formatDate(forecast.start)}</em> : forecast.shifted && item.schedule_mode === 'auto' ? <em className="auto"><Link2 /> Automatisch ab {formatDate(forecast.start)}</em> : null}</p>{item.change_type !== 'none' ? <i className={`deviation-badge ${item.change_type}`} title={deviationTitle}><CircleAlert /></i> : null}</button>
        <div className="track dense-track" style={{ backgroundSize: `${DAY_WIDTH}px 100%` }}>
          {item.type === 'delivery' ? <>
            <i className="delivery-lead-line" title={`Bestellt am ${formatDate(item.start_date, true)} · erwartet am ${formatDate(forecast.end, true)}`} style={{ left: plannedStart * DAY_WIDTH + DAY_WIDTH / 2, width: Math.max(2, (actualStart - plannedStart) * DAY_WIDTH) }} />
            <i className="delivery-order-dot" style={{ left: plannedStart * DAY_WIDTH + DAY_WIDTH / 2 - 3 }} />
            {hasBaselineChange ? <i className="baseline-delivery-marker" title={`Ursprünglich erwartet: ${formatDate(item.baseline_end_date, true)}`} style={{ left: baselineEnd * DAY_WIDTH + DAY_WIDTH / 2 }} /> : null}
            {hasBaselineChange ? <i className={`delivery-deviation-line ${actualStart > baselineEnd ? 'delay' : 'early'}`} title={deviationTitle} style={{ left: Math.min(actualStart, baselineEnd) * DAY_WIDTH + DAY_WIDTH / 2, width: Math.abs(actualStart - baselineEnd) * DAY_WIDTH }} /> : null}
          </> : null}
          {(forecast.shifted || hasBaselineChange) && item.type === 'work' ? <i className="planned-ghost" title={`Basisplan ${formatDate(item.baseline_start_date)}–${formatDate(item.baseline_end_date)}`} style={{ left: baselineStart * DAY_WIDTH + 4, width: Math.max(DAY_WIDTH - 8, (baselineEnd - baselineStart + 1) * DAY_WIDTH - 8) }} /> : null}
          <div draggable={editMode} onDragStart={dragStart} onDragEnd={dragEnd} onMouseEnter={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const placement = rect.top < 230 ? 'bottom' : 'top'; setHoverInfo({ item, forecast, dependencies, x: Math.max(190, Math.min(window.innerWidth - 190, rect.left + rect.width / 2)), y: placement === 'bottom' ? rect.bottom : rect.top, placement }); }} onMouseLeave={() => setHoverInfo(null)} onClick={() => !editMode && onEdit(item)} className={`task-bar dense-bar ${item.type} ${forecast.conflict ? 'conflict' : ''} ${editMode ? 'movable' : ''} ${item.change_type}`} aria-label={`${item.title}: ${deviationTitle || `${formatDate(forecast.start)} bis ${formatDate(forecast.end)}`}`} style={{ left: actualStart * DAY_WIDTH + 4, width: item.type === 'delivery' ? DAY_WIDTH - 8 : baseWidth - 4 }}>
            {editMode ? <GripVertical /> : <ItemIcon type={item.type} />}<span>{item.type === 'delivery' ? formatDate(forecast.end) : `${formatDate(forecast.start)} – ${formatDate(forecast.base_end)}`}</span>
          </div>
          {extensionWidth ? <button className="extension-bar" onClick={() => onEdit(item)} title={`${item.extension_days} zusätzliche Arbeitstage: ${item.extension_reason || 'ohne Begründung'}`} style={{ left: (baseEnd + 1) * DAY_WIDTH, width: extensionWidth }}><Pause /><span>+{item.extension_days} AT</span></button> : null}
        </div>
        <div className="row-status">{forecast.conflict ? <span className="conflict-state"><CircleAlert /> Blockiert</span> : null}<button title={item.status === 'done' ? `Zurück zu ${statusLabels[item.previous_status]}` : 'Als erledigt markieren'} disabled={saving} className={`status-button ${item.status}`} onClick={() => void onToggleDone(item)}>{item.status === 'done' ? <Check /> : item.status === 'active' ? <Clock3 /> : <CircleDot />}<span>{statusLabels[item.status]}</span></button></div>
      </div>;
    })}
    {project.items.length === 0 ? <div className="empty-timeline">Noch keine Lieferungen oder Arbeiten. Füge den ersten Eintrag hinzu.</div> : null}
  </div></div>{hoverInfo ? createPortal(<div role="tooltip" className={`floating-info-card ${hoverInfo.placement} ${hoverInfo.item.change_type}`} style={{ left: hoverInfo.x, top: hoverInfo.y }}><div className="floating-card-head"><span className={hoverInfo.item.type}><ItemIcon type={hoverInfo.item.type} /></span><div><small>{hoverInfo.item.type === 'delivery' ? 'Lieferung' : 'Arbeit'} · {statusLabels[hoverInfo.item.status]}</small><strong>{hoverInfo.item.title}</strong></div></div><div className="floating-meta"><span>{hoverInfo.item.type === 'delivery' ? 'Lieferant' : 'Verantwortlich'}<b>{hoverInfo.item.partner || 'Nicht eingetragen'}</b></span><span>Aktuell<b>{formatDate(hoverInfo.forecast.start)} – {formatDate(hoverInfo.forecast.end)}</b></span></div>{hoverInfo.item.change_type !== 'none' ? <div className="floating-deviation"><CircleAlert /><div><small>{changeLabels[hoverInfo.item.change_type]}</small><strong>{hoverInfo.item.change_reason || 'Grund noch nicht eingetragen'}</strong></div></div> : null}<div className="floating-plan"><span>Basisplan <b>{formatDate(hoverInfo.item.baseline_start_date)} – {formatDate(hoverInfo.item.baseline_end_date)}</b></span>{hoverInfo.dependencies.length ? <span><Link2 /> Nach: <b>{hoverInfo.dependencies.join(', ')}</b></span> : null}{hoverInfo.item.notes ? <p>{hoverInfo.item.notes}</p> : null}</div></div>, document.body) : null}</>;
}

function WorkCalendar({ project, onEdit }: { project: Project; onEdit: (item: PlanItem) => void }) {
  const workdays = useMemo(() => planningDays(project), [project]);
  const weeks = useMemo(() => { const result: string[][] = []; for (let i = 0; i < workdays.length; i += 5) result.push(workdays.slice(i, i + 5)); return result; }, [workdays]);
  const dependencyChains = useMemo(() => project.items.flatMap((item) => item.dependency_ids.flatMap((dependencyId) => { const dependency = project.items.find((candidate) => candidate.id === dependencyId); return dependency ? [{ dependency, item }] : []; })), [project]);
  const calendarBodyRef = useRef<HTMLDivElement>(null);
  const [calendarConnections, setCalendarConnections] = useState<{ id: string; path: string; conflict: boolean }[]>([]);
  useLayoutEffect(() => {
    const root = calendarBodyRef.current;
    if (!root) return;
    const updateConnections = () => {
      const rootRect = root.getBoundingClientRect();
      const paths = dependencyChains.flatMap(({ dependency, item }) => {
        const source = root.querySelector<HTMLElement>(`[data-calendar-end="${dependency.id}"]`);
        const target = root.querySelector<HTMLElement>(`[data-calendar-start="${item.id}"]`);
        if (!source || !target) return [];
        const sourceRect = source.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const x1 = sourceRect.right - rootRect.left - 5;
        const y1 = sourceRect.top - rootRect.top + sourceRect.height / 2;
        const x2 = targetRect.left - rootRect.left + 5;
        const y2 = targetRect.top - rootRect.top + targetRect.height / 2;
        const lane = Math.min(rootRect.width - 8, Math.max(x1, x2) + 16);
        return [{ id: `${dependency.id}-${item.id}`, path: `M ${x1} ${y1} H ${lane} V ${y2} H ${x2}`, conflict: project.forecast.itemForecasts[item.id]?.conflict || false }];
      });
      setCalendarConnections(paths);
    };
    updateConnections();
    const observer = new ResizeObserver(updateConnections);
    observer.observe(root);
    window.addEventListener('resize', updateConnections);
    return () => { observer.disconnect(); window.removeEventListener('resize', updateConnections); };
  }, [dependencyChains, project]);
  return <div className="work-calendar">
    {dependencyChains.length ? <div className="calendar-dependency-map"><header><Link2 /><div><strong>Abhängigkeiten</strong><small>Die gleiche Logik wie im Zeitstrahl</small></div></header><div>{dependencyChains.map(({ dependency, item }) => <button onClick={() => onEdit(item)} key={`${dependency.id}-${item.id}`}><span>{dependency.title}</span><ArrowRight /><strong>{item.title}</strong></button>)}</div></div> : null}
    <div className="calendar-weekdays">{['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-weeks-body" ref={calendarBodyRef}><svg className="calendar-dependency-overlay" aria-hidden="true"><defs><marker id="calendar-dependency-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L0,7 L7,3.5 z" /></marker></defs>{calendarConnections.map((connection) => <path key={connection.id} d={connection.path} className={connection.conflict ? 'conflict' : ''} markerEnd="url(#calendar-dependency-arrow)" />)}</svg>{weeks.map((week) => <section className="calendar-week" key={week[0]}><div className="calendar-week-label">KW {isoWeek(week[0])}</div><div className="calendar-days">{week.map((date) => {
      const entries = project.items.filter((item) => { const forecast = project.forecast.itemForecasts[item.id]; return item.type === 'delivery' ? forecast.end === date : forecast.start <= date && forecast.end >= date; });
      return <div className={`calendar-day ${date === today ? 'today' : ''}`} key={date}><header><strong>{formatDate(date)}</strong><small>{date === today ? 'Heute' : ''}</small></header><div className="calendar-entries">{entries.map((item) => { const forecast = project.forecast.itemForecasts[item.id]; const extension = item.type === 'work' && date > forecast.base_end; const deviationTitle = item.change_type !== 'none' ? `${changeLabels[item.change_type]}: ${item.change_reason || 'Grund noch nicht eingetragen'}` : ''; const dependencies = item.dependency_ids.map((id) => project.items.find((candidate) => candidate.id === id)?.title).filter(Boolean); return <button data-calendar-start={date === forecast.start ? item.id : undefined} data-calendar-end={date === forecast.end ? item.id : undefined} title={deviationTitle} onClick={() => onEdit(item)} className={`calendar-entry ${item.type} ${extension ? 'extension' : ''} ${forecast.conflict ? 'conflict' : ''} ${item.change_type} ${dependencies.length ? 'has-dependency' : ''}`} key={item.id}><ItemIcon type={item.type} /><span><strong>{item.title}</strong><small>{extension ? `Verlängerung · ${item.extension_reason || `+${item.extension_days} AT`}` : item.change_type !== 'none' ? deviationTitle : item.partner || statusLabels[item.status]}</small>{dependencies.length && date === forecast.start ? <small className="calendar-dependency"><Link2 /> Nach: {dependencies.join(', ')}</small> : null}</span>{forecast.conflict ? <CircleAlert /> : item.change_type !== 'none' ? <AlertTriangle /> : null}</button>; })}</div></div>;
    })}</div></section>)}</div>
  </div>;
}

function ItemIcon({ type }: { type: ItemType }) { return type === 'delivery' ? <Truck size={17} /> : <Wrench size={17} />; }

function ProjectModal({ projects, onClose, onSaved }: { projects: Project[]; onClose: () => void; onSaved: (id: number) => void }) {
  const [draft, setDraft] = useState({ name: '', customer: '', target_date: addDays(today, 42), color: colors[0], notes: '', source_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const project = await api<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ ...draft, source_id: draft.source_id ? Number(draft.source_id) : undefined }) });
      onSaved(project.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Fehler beim Speichern'); setSaving(false); }
  };
  return <Modal title="Neuer Auftrag" subtitle="Leer beginnen oder einen bestehenden Ablauf übernehmen." onClose={onClose}>
    <form onSubmit={save} className="form-grid">
      <label className="wide"><span>Auftragsname *</span><input autoFocus required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="z. B. Anlage P-105" /></label>
      <label><span>Kunde</span><input value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} placeholder="Firmenname" /></label>
      <label><span>Gewünschter Termin *</span><input required type="date" value={draft.target_date} onChange={(e) => setDraft({ ...draft, target_date: e.target.value })} /></label>
      <label className="wide"><span>Bestehenden Ablauf kopieren</span><select value={draft.source_id} onChange={(e) => setDraft({ ...draft, source_id: e.target.value })}><option value="">Leerer Auftrag</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name} · {project.customer}</option>)}</select><small>Alle Lieferungen, Arbeiten und Abhängigkeiten werden kopiert.</small></label>
      <fieldset className="wide color-field"><legend>Farbe</legend>{colors.map((color) => <button type="button" aria-label={`Farbe ${color}`} className={draft.color === color ? 'selected' : ''} style={{ background: color }} onClick={() => setDraft({ ...draft, color })} key={color}>{draft.color === color ? <Check /> : null}</button>)}</fieldset>
      <label className="wide"><span>Notiz</span><textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Besonderheiten, Zusagen, offene Fragen …" /></label>
      {error ? <p className="form-error wide">{error}</p> : null}
      <div className="form-actions wide"><button type="button" className="secondary" onClick={onClose}>Abbrechen</button><button className="primary" disabled={saving}>{saving ? 'Wird angelegt …' : 'Auftrag anlegen'}</button></div>
    </form>
  </Modal>;
}

function EditProjectModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState({ name: project.name, customer: project.customer, target_date: project.target_date, color: project.color, notes: project.notes });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await api(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify(draft) }); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Fehler beim Speichern'); setSaving(false); }
  };
  return <Modal title="Auftrag bearbeiten" subtitle="Rahmendaten und Zieltermin aktualisieren." onClose={onClose}>
    <form onSubmit={save} className="form-grid">
      <label className="wide"><span>Auftragsname *</span><input autoFocus required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label><span>Kunde</span><input value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} /></label>
      <label><span>Gewünschter Termin *</span><input required type="date" value={draft.target_date} onChange={(e) => setDraft({ ...draft, target_date: e.target.value })} /></label>
      <fieldset className="wide color-field"><legend>Farbe</legend>{colors.map((color) => <button type="button" aria-label={`Farbe ${color}`} className={draft.color === color ? 'selected' : ''} style={{ background: color }} onClick={() => setDraft({ ...draft, color })} key={color}>{draft.color === color ? <Check /> : null}</button>)}</fieldset>
      <label className="wide"><span>Notiz</span><textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      {error ? <p className="form-error wide">{error}</p> : null}
      <div className="form-actions wide"><span /><span /><button type="button" className="secondary" onClick={onClose}>Abbrechen</button><button className="primary" disabled={saving}>{saving ? 'Speichert …' : 'Speichern'}</button></div>
    </form>
  </Modal>;
}

function ItemModal({ project, item, defaultType, onClose, onSaved }: { project: Project; item?: PlanItem; defaultType?: ItemType; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<ItemDraft>(() => item ? { type: item.type, title: item.title, partner: item.partner, start_date: item.start_date, end_date: item.end_date, status: item.status, previous_status: item.previous_status, schedule_mode: item.schedule_mode, extension_days: item.extension_days, extension_reason: item.extension_reason, baseline_start_date: item.baseline_start_date, baseline_end_date: item.baseline_end_date, actual_end_date: item.actual_end_date, pull_forward: item.pull_forward, change_type: item.change_type, change_reason: item.change_reason, notes: item.notes, dependency_ids: item.dependency_ids } : { ...emptyItem(), type: defaultType || 'work' });
  const [resetBaseline, setResetBaseline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const comparisonDate = draft.actual_end_date || draft.end_date;
      const inferredChange = comparisonDate > draft.baseline_end_date ? 'delay' : comparisonDate < draft.baseline_end_date ? 'early' : 'none';
      const payload = resetBaseline
        ? { ...draft, baseline_start_date: draft.start_date, baseline_end_date: draft.end_date, change_type: 'none', change_reason: '' }
        : { ...draft, change_type: draft.change_type === 'none' ? inferredChange : draft.change_type };
      const statusAwarePayload = item && item.status !== 'done' && draft.status === 'done' ? { ...payload, previous_status: item.status } : payload;
      await api(item ? `/api/items/${item.id}` : `/api/projects/${project.id}/items`, { method: item ? 'PATCH' : 'POST', body: JSON.stringify(statusAwarePayload) });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Fehler beim Speichern'); setSaving(false); }
  };
  const remove = async () => {
    if (!item || !window.confirm(`„${item.title}“ wirklich löschen?`)) return;
    setSaving(true); await api(`/api/items/${item.id}`, { method: 'DELETE' }); onSaved();
  };
  const duration = businessDaysBetween(draft.start_date, draft.end_date);
  return <Modal title={item ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen'} subtitle="Lieferungen und Arbeiten bleiben jederzeit veränderbar." onClose={onClose}>
    <form onSubmit={save} className="form-grid">
      <div className="type-switch wide"><button type="button" className={draft.type === 'delivery' ? 'active' : ''} onClick={() => setDraft({ ...draft, type: 'delivery' })}><Truck /> Lieferung</button><button type="button" className={draft.type === 'work' ? 'active' : ''} onClick={() => setDraft({ ...draft, type: 'work' })}><Wrench /> Arbeit</button></div>
      <label className="wide"><span>Bezeichnung *</span><input autoFocus required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={draft.type === 'delivery' ? 'z. B. Frästeile Achse' : 'z. B. Achse montieren'} /></label>
      <label><span>{draft.type === 'delivery' ? 'Lieferant' : 'Verantwortlich'}</span><input value={draft.partner} onChange={(e) => setDraft({ ...draft, partner: e.target.value })} placeholder={draft.type === 'delivery' ? 'Firma / Ansprechpartner' : 'Name oder Team'} /></label>
      <label><span>Status</span><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>{draft.type === 'delivery' ? 'Bestellt / gestartet' : 'Geplanter Start'}</span><input required type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} /></label>
      <label><span>{draft.type === 'delivery' ? 'Voraussichtliche Lieferung' : 'Geplantes Ende'}</span><input required type="date" min={draft.start_date} value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} /><small>{draft.type === 'work' ? `${duration} Arbeitstage · Wochenende wird übersprungen` : formatWeekday(draft.end_date)}</small></label>
      {draft.status === 'done' ? <label className="wide"><span>{draft.type === 'delivery' ? 'Tatsächlich eingetroffen am' : 'Tatsächlich fertig am'}</span><input type="date" value={draft.actual_end_date} onChange={(e) => setDraft({ ...draft, actual_end_date: e.target.value })} /><small>Ein früheres Datum kann abhängige Arbeiten freigeben.</small></label> : null}
      <fieldset className="wide dependencies"><legend>Kann erst starten, wenn …</legend>{project.items.filter((candidate) => candidate.id !== item?.id).map((candidate) => <label key={candidate.id}><input type="checkbox" checked={draft.dependency_ids.includes(candidate.id)} onChange={(e) => setDraft({ ...draft, dependency_ids: e.target.checked ? [...draft.dependency_ids, candidate.id] : draft.dependency_ids.filter((id) => id !== candidate.id) })} /><span className={candidate.type}><ItemIcon type={candidate.type} /></span>{candidate.title}</label>)}{project.items.filter((candidate) => candidate.id !== item?.id).length === 0 ? <small>Noch keine anderen Einträge vorhanden.</small> : null}</fieldset>
      {draft.type === 'work' ? <>
        <label className="wide"><span>Abhängigkeiten behandeln</span><select value={draft.schedule_mode === 'fixed' ? 'fixed' : draft.pull_forward ? 'pull' : 'auto'} onChange={(e) => setDraft({ ...draft, schedule_mode: e.target.value === 'fixed' ? 'fixed' : 'auto', pull_forward: e.target.value === 'pull' ? 1 : 0 })}><option value="auto">Verzögerungen nachschieben, früheren Plan stehen lassen</option><option value="pull">Immer direkt anschließen – auch nach vorne aufrücken</option><option value="fixed">Meinen Termin festhalten und bei Konflikt warnen</option></select><small>{draft.schedule_mode === 'fixed' ? 'Der eingetragene Start bleibt stehen. Ist er unmöglich, erscheint eine rote Warnung.' : draft.pull_forward ? 'Wird eine Voraussetzung früher fertig, rückt diese Arbeit automatisch nach vorne.' : 'Verspätungen wirken sich aus. Frei gewordene Zeit bleibt bewusst als Puffer erhalten.'}</small></label>
        <label><span>Verlängerung</span><input type="number" min="0" max="260" value={draft.extension_days} onChange={(e) => setDraft({ ...draft, extension_days: Math.max(0, Number(e.target.value) || 0) })} /><small>zusätzliche Arbeitstage</small></label>
        <label><span>Grund der Verlängerung</span><input value={draft.extension_reason} onChange={(e) => setDraft({ ...draft, extension_reason: e.target.value })} placeholder="z. B. 3 Tage krank" /></label>
      </> : null}
      <fieldset className="wide deviation-fields"><legend>Abweichung vom ursprünglichen Plan</legend><div className="baseline-summary"><span>Basis: {formatDate(draft.baseline_start_date)} – {formatDate(draft.baseline_end_date)}</span><label><input type="checkbox" checked={resetBaseline} onChange={(e) => setResetBaseline(e.target.checked)} /> Aktuelle Termine als neue Basis übernehmen</label></div><div className="deviation-inputs"><label><span>Markierung</span><select value={draft.change_type} onChange={(e) => setDraft({ ...draft, change_type: e.target.value as PlanItem['change_type'] })}>{Object.entries(changeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>Grund / kurze Notiz</span><input value={draft.change_reason} onChange={(e) => setDraft({ ...draft, change_reason: e.target.value })} placeholder="z. B. Lieferant: Fräsmaschine defekt, +1 Woche" /></label></div><small>Die Markierung erscheint im Zeitstrahl; der Grund ist beim Darüberfahren sichtbar.</small></fieldset>
      <label className="wide"><span>Notiz</span><textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Termin bestätigt? Besonderheit? Grund für die Verschiebung?" /></label>
      {error ? <p className="form-error wide">{error}</p> : null}
      <div className="form-actions wide">{item ? <button type="button" className="delete" onClick={() => void remove()}><Trash2 /> Löschen</button> : null}<span /><button type="button" className="secondary" onClick={onClose}>Abbrechen</button><button className="primary" disabled={saving}>{saving ? 'Speichert …' : 'Speichern'}</button></div>
    </form>
  </Modal>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Schließen"><X /></button></header>{children}</section></div>;
}
