import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { calculateForecast, type PlanItem } from './forecast.js';

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
app.get('/api/projects', (_req, res) => res.json(getProjects()));

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
        const inserted = db.prepare(`INSERT INTO items (project_id, type, title, partner, start_date, end_date, status, previous_status, schedule_mode, extension_days, extension_reason, baseline_start_date, baseline_end_date, pull_forward, change_type, change_reason, notes, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, 'open', 'open', ?, ?, ?, ?, ?, ?, 'none', '', ?, ?)`).run(id, source.type, source.title, source.partner, source.start_date, source.end_date, source.schedule_mode, source.extension_days, source.extension_reason, source.start_date, source.end_date, source.pull_forward, source.notes, source.sort_order);
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

app.post('/api/projects/:id/items', (req, res) => {
  const { type, title, partner = '', start_date, end_date, status = 'open', previous_status = 'open', schedule_mode = 'auto', extension_days = 0, extension_reason = '', actual_end_date = '', pull_forward = 0, change_type = 'none', change_reason = '', notes = '', dependency_ids = [] } = req.body;
  if (!['delivery', 'work'].includes(type) || !title || !start_date || !end_date) return res.status(400).json({ error: 'Unvollständiger Eintrag.' });
  const create = db.transaction(() => {
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM items WHERE project_id = ?').get(req.params.id) as { value: number };
    const result = db.prepare(`INSERT INTO items (project_id, type, title, partner, start_date, end_date, status, previous_status, schedule_mode, extension_days, extension_reason, baseline_start_date, baseline_end_date, actual_end_date, pull_forward, change_type, change_reason, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(req.params.id, type, title, partner, start_date, end_date, status, previous_status, schedule_mode, Math.max(0, Number(extension_days) || 0), extension_reason, start_date, end_date, actual_end_date, Number(Boolean(pull_forward)), change_type, change_reason, notes, max.value + 1);
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
  const next = { ...current, ...changes };
  if (changes.status === 'done' && current.status !== 'done' && changes.previous_status === undefined) next.previous_status = current.status;
  const update = db.transaction(() => {
    db.prepare(`UPDATE items SET type = ?, title = ?, partner = ?, start_date = ?, end_date = ?, status = ?, previous_status = ?, schedule_mode = ?, extension_days = ?, extension_reason = ?, baseline_start_date = ?, baseline_end_date = ?, actual_end_date = ?, pull_forward = ?, change_type = ?, change_reason = ?, notes = ?, sort_order = ? WHERE id = ?`)
      .run(next.type, next.title, next.partner, next.start_date, next.end_date, next.status, next.previous_status || 'open', next.schedule_mode, Math.max(0, Number(next.extension_days) || 0), next.extension_reason, next.baseline_start_date || next.start_date, next.baseline_end_date || next.end_date, next.actual_end_date || '', Number(Boolean(next.pull_forward)), next.change_type || 'none', next.change_reason || '', next.notes, next.sort_order, req.params.id);
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
