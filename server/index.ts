import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { calculateForecast, type PlanItem } from './forecast.js';
import { applyStatusTransition } from './item-status.js';

const app = express();
const port = Number(process.env.PORT || 3001);
app.use(express.json());

type Row = Record<string, unknown>;

function getProjects(includeArchived = false) {
  const projects = db.prepare(`SELECT * FROM projects ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY target_date`).all() as Row[];
  const items = db.prepare('SELECT * FROM items ORDER BY sort_order, start_date').all() as Row[];
  const dependencies = db.prepare('SELECT * FROM dependencies').all() as { item_id: number; depends_on_id: number }[];

  return projects.map((project) => {
    const projectItems = items.filter((item) => item.project_id === project.id).map((item) => ({
      ...item,
      dependency_ids: dependencies.filter((dependency) => dependency.item_id === item.id).map((dependency) => dependency.depends_on_id),
    }));
    return { ...project, id: Number(project.id), items: projectItems, forecast: calculateForecast(projectItems as unknown as PlanItem[]) };
  });
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/projects', (req, res) => res.json(getProjects(req.query.include_archived === 'true')));

app.get('/api/export', (_req, res) => {
  const projects = getProjects(true) as unknown as Array<Row & { items: Array<Row & { id: number; dependency_ids: number[] }> }>;
  res.json({
    schema_version: 1,
    exported_at: new Date().toISOString(),
    projects: projects.map((project) => {
      const keys = new Map(project.items.map((item) => [item.id, `item-${item.id}`]));
      const { id: _id, items, forecast: _forecast, created_at: _created, updated_at: _updated, ...projectData } = project;
      return {
        ...projectData,
        items: items.map((item) => {
          const { id, project_id: _projectId, sort_order: _sort, dependency_ids, ...itemData } = item;
          return { key: keys.get(id), ...itemData, dependencies: dependency_ids.map((dependencyId) => keys.get(dependencyId)).filter(Boolean) };
        }),
      };
    }),
  });
});

app.post('/api/import', (req, res) => {
  const projects = req.body?.projects;
  if (!Array.isArray(projects) || projects.length === 0) return res.status(400).json({ error: 'Die Datei enthält keine Projekte.' });
  if (projects.length > 50) return res.status(400).json({ error: 'Maximal 50 Projekte pro Import.' });

  const importProjects = db.transaction(() => {
    let imported = 0;
    for (const project of projects) {
      if (!project?.name || !project?.target_date || !Array.isArray(project.items)) continue;
      const projectResult = db.prepare('INSERT INTO projects (name, customer, target_date, color, notes, archived) VALUES (?, ?, ?, ?, ?, ?)')
        .run(project.name, project.customer || '', project.target_date, project.color || '#e8a83e', project.notes || '', Number(Boolean(project.archived)));
      const projectId = Number(projectResult.lastInsertRowid);
      const keyMap = new Map<string, number>();
      project.items.forEach((item: Row, index: number) => {
        if (!item.title || !['delivery', 'work'].includes(String(item.type)) || !item.start_date || !item.end_date) return;
        const status = item.status || 'open';
        const actualEnd = status === 'done' ? item.actual_end_date || item.end_date : item.actual_end_date || '';
        const storedEnd = status === 'done' ? actualEnd : item.end_date;
        const previousEnd = status === 'done' ? item.previous_end_date || item.end_date : item.previous_end_date || '';
        const result = db.prepare(`INSERT INTO items (project_id, type, title, partner, icon_key, start_date, end_date, status, previous_status, schedule_mode, extension_days, extension_reason, baseline_start_date, baseline_end_date, actual_end_date, previous_end_date, pull_forward, change_type, change_reason, notes, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          projectId, item.type, item.title, item.partner || '', item.icon_key || '', item.start_date, storedEnd,
          status, item.previous_status || 'open', item.schedule_mode || 'auto',
          Math.max(0, Number(item.extension_days) || 0), item.extension_reason || '',
          item.baseline_start_date || item.start_date, item.baseline_end_date || item.end_date,
          actualEnd, previousEnd, Number(Boolean(item.pull_forward)), item.change_type || 'none',
          item.change_reason || '', item.notes || '', index + 1,
        );
        keyMap.set(String(item.key || index), Number(result.lastInsertRowid));
      });
      project.items.forEach((item: Row, index: number) => {
        const itemId = keyMap.get(String(item.key || index));
        const dependencies = Array.isArray(item.dependencies) ? item.dependencies : [];
        if (!itemId) return;
        for (const dependencyKey of dependencies) {
          const dependencyId = keyMap.get(String(dependencyKey));
          if (dependencyId && dependencyId !== itemId) db.prepare('INSERT OR IGNORE INTO dependencies VALUES (?, ?)').run(itemId, dependencyId);
        }
      });
      imported += 1;
    }
    return imported;
  });

  const imported = importProjects();
  if (!imported) return res.status(400).json({ error: 'Keine gültigen Projekte gefunden.' });
  res.status(201).json({ imported });
});

app.post('/api/projects', (req, res) => {
  const { name, customer = '', target_date, color = '#e8a83e', notes = '', source_id } = req.body;
  if (!name || !target_date) return res.status(400).json({ error: 'Name und Zieltermin sind erforderlich.' });

  const create = db.transaction(() => {
    const result = db.prepare('INSERT INTO projects (name, customer, target_date, color, notes) VALUES (?, ?, ?, ?, ?)')
      .run(name, customer, target_date, color, notes);
    const id = Number(result.lastInsertRowid);
    if (source_id) {
      const sourceItems = db.prepare('SELECT * FROM items WHERE project_id = ? ORDER BY sort_order').all(source_id) as Row[];
      const idMap = new Map<number, number>();
      for (const source of sourceItems) {
        const inserted = db.prepare(`INSERT INTO items (project_id, type, title, partner, icon_key, start_date, end_date, status, previous_status, schedule_mode, extension_days, extension_reason, baseline_start_date, baseline_end_date, pull_forward, change_type, change_reason, notes, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 'open', ?, ?, ?, ?, ?, ?, 'none', '', ?, ?)`).run(id, source.type, source.title, source.partner, source.icon_key || '', source.start_date, source.end_date, source.schedule_mode, source.extension_days, source.extension_reason, source.start_date, source.end_date, source.pull_forward, source.notes, source.sort_order);
        idMap.set(source.id as number, Number(inserted.lastInsertRowid));
      }
      const sourceDependencies = db.prepare(`SELECT d.* FROM dependencies d JOIN items i ON i.id = d.item_id WHERE i.project_id = ?`).all(source_id) as { item_id: number; depends_on_id: number }[];
      for (const dependency of sourceDependencies) {
        const itemId = idMap.get(dependency.item_id);
        const dependsOnId = idMap.get(dependency.depends_on_id);
        if (itemId && dependsOnId) db.prepare('INSERT INTO dependencies VALUES (?, ?)').run(itemId, dependsOnId);
      }
    }
    return id;
  });
  const id = create();
  res.status(201).json(getProjects().find((project) => project.id === id));
});

app.patch('/api/projects/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as Row | undefined;
  if (!current) return res.status(404).json({ error: 'Auftrag nicht gefunden.' });
  const next = { ...current, ...req.body, updated_at: new Date().toISOString() };
  db.prepare(`UPDATE projects SET name = ?, customer = ?, target_date = ?, color = ?, notes = ?, archived = ?, updated_at = ? WHERE id = ?`)
    .run(next.name, next.customer, next.target_date, next.color, next.notes, Number(next.archived), next.updated_at, req.params.id);
  res.json(getProjects(true).find((project) => project.id === Number(req.params.id)));
});

app.delete('/api/projects/:id', (req, res) => {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Projekt nicht gefunden.' });
  res.status(204).end();
});

app.post('/api/projects/:id/items', (req, res) => {
  const { type, title, partner = '', icon_key = '', start_date, end_date, status = 'open', previous_status = 'open', schedule_mode = 'auto', extension_days = 0, extension_reason = '', actual_end_date = '', pull_forward = 0, change_type = 'none', change_reason = '', notes = '', dependency_ids = [] } = req.body;
  if (!['delivery', 'work'].includes(type) || !title || !start_date || !end_date) return res.status(400).json({ error: 'Unvollständiger Eintrag.' });
  const initial = applyStatusTransition({ status: 'open', previous_status: 'open', end_date, baseline_end_date: end_date, actual_end_date: '', previous_end_date: '' }, { status, previous_status, actual_end_date });
  const create = db.transaction(() => {
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM items WHERE project_id = ?').get(req.params.id) as { value: number };
    const result = db.prepare(`INSERT INTO items (project_id, type, title, partner, icon_key, start_date, end_date, status, previous_status, schedule_mode, extension_days, extension_reason, baseline_start_date, baseline_end_date, actual_end_date, previous_end_date, pull_forward, change_type, change_reason, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(req.params.id, type, title, partner, icon_key, start_date, initial.end_date, initial.status, initial.previous_status || 'open', schedule_mode, Math.max(0, Number(extension_days) || 0), extension_reason, start_date, end_date, initial.actual_end_date || '', initial.previous_end_date || '', Number(Boolean(pull_forward)), change_type, change_reason, notes, max.value + 1);
    const id = Number(result.lastInsertRowid);
    for (const dependencyId of dependency_ids) db.prepare('INSERT OR IGNORE INTO dependencies VALUES (?, ?)').run(id, dependencyId);
    return id;
  });
  const id = create();
  res.status(201).json({ id });
});

app.patch('/api/items/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id) as Row | undefined;
  if (!current) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  const { dependency_ids, ...changes } = req.body;
  const next = applyStatusTransition(current as Parameters<typeof applyStatusTransition>[0], changes);
  const update = db.transaction(() => {
    db.prepare(`UPDATE items SET type = ?, title = ?, partner = ?, icon_key = ?, start_date = ?, end_date = ?, status = ?, previous_status = ?, schedule_mode = ?, extension_days = ?, extension_reason = ?, baseline_start_date = ?, baseline_end_date = ?, actual_end_date = ?, previous_end_date = ?, pull_forward = ?, change_type = ?, change_reason = ?, notes = ?, sort_order = ? WHERE id = ?`)
      .run(next.type, next.title, next.partner, next.icon_key || '', next.start_date, next.end_date, next.status, next.previous_status || 'open', next.schedule_mode, Math.max(0, Number(next.extension_days) || 0), next.extension_reason, next.baseline_start_date || next.start_date, next.baseline_end_date || next.end_date, next.actual_end_date || '', next.previous_end_date || '', Number(Boolean(next.pull_forward)), next.change_type || 'none', next.change_reason || '', next.notes, next.sort_order, req.params.id);
    if (Array.isArray(dependency_ids)) {
      db.prepare('DELETE FROM dependencies WHERE item_id = ?').run(req.params.id);
      for (const dependencyId of dependency_ids) {
        if (Number(dependencyId) !== Number(req.params.id)) db.prepare('INSERT OR IGNORE INTO dependencies VALUES (?, ?)').run(req.params.id, dependencyId);
      }
    }
  });
  update();
  res.json({ ok: true });
});

app.delete('/api/items/:id', (req, res) => {
  db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, '../client');
app.use(express.static(clientDir));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));

app.listen(port, '0.0.0.0', () => console.log(`TAKT läuft auf Port ${port}`));
