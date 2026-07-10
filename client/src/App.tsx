import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Box, CalendarDays, Check, ChevronRight,
  CircleDot, Clock3, Factory, Link2, PackageCheck, Pencil, Plus, RefreshCw,
  Search, Trash2, Truck, Users, Wrench, X,
} from 'lucide-react';
import type { ItemType, PlanItem, Project, Status } from './types';

const DAY = 86_400_000;
const today = new Date().toISOString().slice(0, 10);
const colors = ['#e8a83e', '#6ca6a1', '#d7795f', '#778cba', '#87a767'];
const statusLabels: Record<Status, string> = { open: 'Offen', active: 'Läuft', done: 'Erledigt' };

function parseDate(value: string) { return new Date(`${value}T12:00:00`); }
function formatDate(value?: string, withYear = false) {
  if (!value) return '–';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).format(parseDate(value));
}
function formatWeekday(value: string) { return new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(parseDate(value)); }
function daysBetween(a: string, b: string) { return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY); }
function addDays(date: string, days: number) { const result = parseDate(date); result.setDate(result.getDate() + days); return result.toISOString().slice(0, 10); }

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }));
    throw new Error(body.error || 'Die Änderung konnte nicht gespeichert werden.');
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

type ItemDraft = Omit<PlanItem, 'id' | 'project_id' | 'sort_order'>;
const emptyItem = (date = today): ItemDraft => ({
  type: 'work', title: '', partner: '', start_date: date, end_date: addDays(date, 4), status: 'open', notes: '', dependency_ids: [],
});

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectModal, setProjectModal] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setProjects(await api<Project[]>('/api/projects'));
    } catch (err) { setError(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const selected = projects.find((project) => project.id === selectedId);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setSelectedId(null)} aria-label="Zur Übersicht">
          <span className="brand-mark"><Factory size={20} strokeWidth={2.4} /></span>
          <span><strong>TAKT</strong><small>Produktionsplan</small></span>
        </button>
        <nav>
          <button className={!selected ? 'active' : ''} onClick={() => setSelectedId(null)}><CircleDot size={18} /> Übersicht</button>
          <div className="nav-label">Laufende Aufträge</div>
          {projects.map((project) => (
            <button className={selectedId === project.id ? 'active project-nav' : 'project-nav'} key={project.id} onClick={() => setSelectedId(project.id)}>
              <i style={{ background: project.color }} /> <span>{project.name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot"><Users size={16} /><span>Team-Board<br /><small>Gemeinsamer Stand</small></span></div>
      </aside>

      <main>
        {error ? <div className="error-banner"><AlertTriangle size={18} /> {error}<button onClick={() => void load()}><RefreshCw size={16} /> Neu laden</button></div> : null}
        {loading ? <Loading /> : selected ? <ProjectDetail project={selected} onBack={() => setSelectedId(null)} onChange={load} /> : (
          <Dashboard projects={projects} search={search} setSearch={setSearch} onSelect={setSelectedId} onAdd={() => setProjectModal(true)} />
        )}
      </main>
      {projectModal ? <ProjectModal projects={projects} onClose={() => setProjectModal(false)} onSaved={async (id) => { await load(); setProjectModal(false); setSelectedId(id); }} /> : null}
    </div>
  );
}

function Loading() {
  return <div className="loading"><RefreshCw className="spin" /><span>Produktionsplan wird geladen …</span></div>;
}

function Dashboard({ projects, search, setSearch, onSelect, onAdd }: {
  projects: Project[]; search: string; setSearch: (value: string) => void; onSelect: (id: number) => void; onAdd: () => void;
}) {
  const filtered = projects.filter((project) => `${project.name} ${project.customer}`.toLowerCase().includes(search.toLowerCase()));
  const delayed = projects.filter((project) => project.forecast.completion > project.target_date).length;
  const openDeliveries = projects.flatMap((project) => project.items).filter((item) => item.type === 'delivery' && item.status !== 'done').length;
  const nextCompletion = projects.map((project) => project.forecast.completion).filter(Boolean).sort()[0];

  return <div className="page dashboard-page">
    <header className="page-header">
      <div><span className="eyebrow">{formatWeekday(today)} · {formatDate(today, true)}</span><h1>Was steht an?</h1><p>Der gemeinsame Blick auf Lieferungen, Arbeiten und mögliche Auslieferungen.</p></div>
      <button className="primary" onClick={onAdd}><Plus size={18} /> Neuer Auftrag</button>
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
  const completionDelta = project.forecast.completion ? daysBetween(project.target_date, project.forecast.completion) : 0;
  const available = project.items.filter((item) => item.type === 'work' && item.status !== 'done' && item.dependency_ids.every((id) => project.items.find((candidate) => candidate.id === id)?.status === 'done'));

  const toggleDone = async (item: PlanItem) => {
    setSaving(true);
    await api(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: item.status === 'done' ? 'open' : 'done' }) });
    await onChange();
    setSaving(false);
  };

  return <div className="page detail-page">
    <header className="detail-header">
      <button className="back" onClick={onBack}><ArrowLeft size={18} /> Übersicht</button>
      <div className="detail-title"><i style={{ background: project.color }} /><div><span className="eyebrow">{project.customer || 'Interner Auftrag'}</span><h1>{project.name}</h1></div></div>
      <div className="header-actions"><button className="secondary" onClick={() => setEditProject(true)}><Pencil size={16} /> Auftrag</button><button className="primary" onClick={() => setItemModal({})}><Plus size={18} /> Eintrag hinzufügen</button></div>
    </header>

    <section className="detail-summary">
      <div><small>Mögliche Fertigstellung</small><strong>{formatDate(project.forecast.completion, true)}</strong><span className={completionDelta > 0 ? 'text-danger' : 'text-good'}>{completionDelta > 0 ? `${completionDelta} Tage nach Ziel` : `${Math.abs(completionDelta)} Tage Puffer`}</span></div>
      <div><small>Gewünschter Termin</small><strong>{formatDate(project.target_date, true)}</strong><span>manuell festgelegt</span></div>
      <div><small>Heute möglich</small><strong>{available.length} {available.length === 1 ? 'Arbeit' : 'Arbeiten'}</strong><span>{available[0]?.title || 'Abhängigkeiten prüfen'}</span></div>
      <div><small>Fortschritt</small><strong>{project.items.filter((item) => item.status === 'done').length} / {project.items.length}</strong><span>Einträge erledigt</span></div>
    </section>

    <section className="timeline-section">
      <div className="section-heading"><div><h2>Zeitplan</h2><span>Termine anklicken, ändern, weiterarbeiten.</span></div><div className="legend"><span><i className="delivery" /> Lieferung</span><span><i className="work" /> Arbeit</span><span><i className="forecast" /> Verschiebung</span></div></div>
      <Timeline project={project} onEdit={(item) => setItemModal({ item })} onToggleDone={toggleDone} saving={saving} />
    </section>

    {project.notes ? <aside className="project-note"><span>NOTIZ</span><p>{project.notes}</p></aside> : null}
    {editProject ? <EditProjectModal project={project} onClose={() => setEditProject(false)} onSaved={async () => { await onChange(); setEditProject(false); }} /> : null}
    {itemModal ? <ItemModal project={project} item={itemModal.item} defaultType={itemModal.type} onClose={() => setItemModal(null)} onSaved={async () => { await onChange(); setItemModal(null); }} /> : null}
  </div>;
}

function Timeline({ project, onEdit, onToggleDone, saving }: { project: Project; onEdit: (item: PlanItem) => void; onToggleDone: (item: PlanItem) => void; saving: boolean }) {
  const bounds = useMemo(() => {
    const dates = project.items.flatMap((item) => [item.start_date, project.forecast.itemForecasts[item.id]?.end || item.end_date]);
    dates.push(today, project.target_date);
    const sortedDates = dates.sort();
    const min = sortedDates[0] || today;
    const max = sortedDates.at(-1) || addDays(today, 30);
    return { start: addDays(min, -3), end: addDays(max, 4) };
  }, [project]);
  const total = Math.max(1, daysBetween(bounds.start, bounds.end));
  const months: { label: string; left: number }[] = [];
  for (let cursor = bounds.start; cursor <= bounds.end; cursor = addDays(cursor, 1)) {
    if (parseDate(cursor).getDate() === 1 || cursor === bounds.start) months.push({ label: new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(parseDate(cursor)), left: daysBetween(bounds.start, cursor) / total * 100 });
  }
  const todayLeft = daysBetween(bounds.start, today) / total * 100;

  return <div className="timeline-scroll"><div className="timeline" style={{ minWidth: 860 }}>
    <div className="timeline-head"><div>Vorgang</div><div className="month-axis">{months.map((month) => <span key={`${month.label}-${month.left}`} style={{ left: `${month.left}%` }}>{month.label}</span>)}</div><div>Status</div></div>
    <div className="today-line" style={{ left: `calc(260px + (100% - 380px) * ${todayLeft / 100})` }}><span>Heute</span></div>
    {project.items.map((item) => {
      const forecast = project.forecast.itemForecasts[item.id] || { start: item.start_date, end: item.end_date };
      const plannedLeft = daysBetween(bounds.start, item.start_date) / total * 100;
      const plannedWidth = Math.max(1.5, (daysBetween(item.start_date, item.end_date) + 1) / total * 100);
      const forecastLeft = daysBetween(bounds.start, forecast.start) / total * 100;
      const forecastWidth = Math.max(1.5, (daysBetween(forecast.start, forecast.end) + 1) / total * 100);
      const shifted = forecast.start !== item.start_date || forecast.end !== item.end_date;
      const dependencies = item.dependency_ids.map((id) => project.items.find((candidate) => candidate.id === id)?.title).filter(Boolean);
      return <div className={`timeline-row ${item.status === 'done' ? 'is-done' : ''}`} key={item.id}>
        <button className="task-info" onClick={() => onEdit(item)}><span className={item.type}><ItemIcon type={item.type} /></span><p><strong>{item.title}</strong><small>{item.partner || (item.type === 'delivery' ? 'Lieferant offen' : 'Noch nicht zugewiesen')}</small></p>{dependencies.length ? <Link2 className="dependency-icon" size={14} /> : null}</button>
        <button className="track" onClick={() => onEdit(item)} title={`${formatDate(item.start_date)} bis ${formatDate(item.end_date)}`}>
          {shifted ? <i className="forecast-bar" style={{ left: `${forecastLeft}%`, width: `${forecastWidth}%` }} /> : null}
          <i className={`task-bar ${item.type}`} style={{ left: `${plannedLeft}%`, width: `${plannedWidth}%` }}><span>{daysBetween(item.start_date, item.end_date) >= 4 ? item.title : ''}</span></i>
        </button>
        <button disabled={saving} className={`status-button ${item.status}`} onClick={() => void onToggleDone(item)}>{item.status === 'done' ? <Check /> : item.status === 'active' ? <Clock3 /> : <CircleDot />}<span>{statusLabels[item.status]}</span></button>
      </div>;
    })}
    {project.items.length === 0 ? <div className="empty-timeline">Noch keine Lieferungen oder Arbeiten. Füge den ersten Eintrag hinzu.</div> : null}
  </div></div>;
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
  const [draft, setDraft] = useState<ItemDraft>(() => item ? { type: item.type, title: item.title, partner: item.partner, start_date: item.start_date, end_date: item.end_date, status: item.status, notes: item.notes, dependency_ids: item.dependency_ids } : { ...emptyItem(), type: defaultType || 'work' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api(item ? `/api/items/${item.id}` : `/api/projects/${project.id}/items`, { method: item ? 'PATCH' : 'POST', body: JSON.stringify(draft) });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Fehler beim Speichern'); setSaving(false); }
  };
  const remove = async () => {
    if (!item || !window.confirm(`„${item.title}“ wirklich löschen?`)) return;
    setSaving(true); await api(`/api/items/${item.id}`, { method: 'DELETE' }); onSaved();
  };
  const duration = Math.max(1, daysBetween(draft.start_date, draft.end_date) + 1);
  return <Modal title={item ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen'} subtitle="Lieferungen und Arbeiten bleiben jederzeit veränderbar." onClose={onClose}>
    <form onSubmit={save} className="form-grid">
      <div className="type-switch wide"><button type="button" className={draft.type === 'delivery' ? 'active' : ''} onClick={() => setDraft({ ...draft, type: 'delivery' })}><Truck /> Lieferung</button><button type="button" className={draft.type === 'work' ? 'active' : ''} onClick={() => setDraft({ ...draft, type: 'work' })}><Wrench /> Arbeit</button></div>
      <label className="wide"><span>Bezeichnung *</span><input autoFocus required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={draft.type === 'delivery' ? 'z. B. Frästeile Achse' : 'z. B. Achse montieren'} /></label>
      <label><span>{draft.type === 'delivery' ? 'Lieferant' : 'Verantwortlich'}</span><input value={draft.partner} onChange={(e) => setDraft({ ...draft, partner: e.target.value })} placeholder={draft.type === 'delivery' ? 'Firma / Ansprechpartner' : 'Name oder Team'} /></label>
      <label><span>Status</span><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>{draft.type === 'delivery' ? 'Bestellt / gestartet' : 'Geplanter Start'}</span><input required type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} /></label>
      <label><span>{draft.type === 'delivery' ? 'Voraussichtliche Lieferung' : 'Geplantes Ende'}</span><input required type="date" min={draft.start_date} value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} /><small>{duration} Kalendertage eingeplant</small></label>
      <fieldset className="wide dependencies"><legend>Kann erst starten, wenn …</legend>{project.items.filter((candidate) => candidate.id !== item?.id).map((candidate) => <label key={candidate.id}><input type="checkbox" checked={draft.dependency_ids.includes(candidate.id)} onChange={(e) => setDraft({ ...draft, dependency_ids: e.target.checked ? [...draft.dependency_ids, candidate.id] : draft.dependency_ids.filter((id) => id !== candidate.id) })} /><span className={candidate.type}><ItemIcon type={candidate.type} /></span>{candidate.title}</label>)}{project.items.filter((candidate) => candidate.id !== item?.id).length === 0 ? <small>Noch keine anderen Einträge vorhanden.</small> : null}</fieldset>
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
