import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'production-planer.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    customer TEXT NOT NULL DEFAULT '',
    target_date TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#e8a83e',
    notes TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('delivery', 'work')),
    title TEXT NOT NULL,
    partner TEXT NOT NULL DEFAULT '',
    icon_key TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'active', 'done')),
    previous_status TEXT NOT NULL DEFAULT 'open',
    schedule_mode TEXT NOT NULL DEFAULT 'auto' CHECK(schedule_mode IN ('auto', 'fixed')),
    extension_days INTEGER NOT NULL DEFAULT 0,
    extension_reason TEXT NOT NULL DEFAULT '',
    baseline_start_date TEXT NOT NULL DEFAULT '',
    baseline_end_date TEXT NOT NULL DEFAULT '',
    actual_end_date TEXT NOT NULL DEFAULT '',
    previous_end_date TEXT NOT NULL DEFAULT '',
    pull_forward INTEGER NOT NULL DEFAULT 0,
    change_type TEXT NOT NULL DEFAULT 'none',
    change_reason TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS dependencies (
    item_id INTEGER NOT NULL,
    depends_on_id INTEGER NOT NULL,
    PRIMARY KEY(item_id, depends_on_id),
    FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY(depends_on_id) REFERENCES items(id) ON DELETE CASCADE
  );
`);

const itemColumns = new Set((db.prepare('PRAGMA table_info(items)').all() as { name: string }[]).map((column) => column.name));
if (!itemColumns.has('schedule_mode')) db.exec("ALTER TABLE items ADD COLUMN schedule_mode TEXT NOT NULL DEFAULT 'auto'");
if (!itemColumns.has('extension_days')) db.exec('ALTER TABLE items ADD COLUMN extension_days INTEGER NOT NULL DEFAULT 0');
if (!itemColumns.has('extension_reason')) db.exec("ALTER TABLE items ADD COLUMN extension_reason TEXT NOT NULL DEFAULT ''");
if (!itemColumns.has('baseline_start_date')) db.exec("ALTER TABLE items ADD COLUMN baseline_start_date TEXT NOT NULL DEFAULT ''");
if (!itemColumns.has('baseline_end_date')) db.exec("ALTER TABLE items ADD COLUMN baseline_end_date TEXT NOT NULL DEFAULT ''");
if (!itemColumns.has('actual_end_date')) db.exec("ALTER TABLE items ADD COLUMN actual_end_date TEXT NOT NULL DEFAULT ''");
if (!itemColumns.has('previous_end_date')) db.exec("ALTER TABLE items ADD COLUMN previous_end_date TEXT NOT NULL DEFAULT ''");
if (!itemColumns.has('pull_forward')) db.exec('ALTER TABLE items ADD COLUMN pull_forward INTEGER NOT NULL DEFAULT 0');
if (!itemColumns.has('change_type')) db.exec("ALTER TABLE items ADD COLUMN change_type TEXT NOT NULL DEFAULT 'none'");
if (!itemColumns.has('change_reason')) db.exec("ALTER TABLE items ADD COLUMN change_reason TEXT NOT NULL DEFAULT ''");
if (!itemColumns.has('previous_status')) db.exec("ALTER TABLE items ADD COLUMN previous_status TEXT NOT NULL DEFAULT 'open'");
if (!itemColumns.has('icon_key')) db.exec("ALTER TABLE items ADD COLUMN icon_key TEXT NOT NULL DEFAULT ''");

const projectCount = db.prepare('SELECT COUNT(*) AS count FROM projects').get() as { count: number };
if (projectCount.count === 0 && process.env.SEED_DEMO !== 'false') {
  const seed = db.transaction(() => {
    const project = db.prepare(`INSERT INTO projects (name, customer, target_date, color, notes)
      VALUES (?, ?, ?, ?, ?)`);
    const item = db.prepare(`INSERT INTO items
      (project_id, type, title, partner, start_date, end_date, status, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const dependency = db.prepare('INSERT INTO dependencies (item_id, depends_on_id) VALUES (?, ?)');

    const p1 = Number(project.run('Anlage P-104', 'Müller Automation', '2026-08-28', '#e8a83e', 'Sonderhalterung auf Kundenseite').lastInsertRowid);
    const fraesteile = Number(item.run(p1, 'delivery', 'Frästeile Achse', 'Haas Metallbau', '2026-07-10', '2026-07-24', 'open', 'Termin telefonisch bestätigt', 1).lastInsertRowid);
    const motor = Number(item.run(p1, 'delivery', 'Motoren', 'Antriebstechnik West', '2026-07-10', '2026-07-18', 'done', '', 2).lastInsertRowid);
    const kabel = Number(item.run(p1, 'work', 'Kabelbaum fertigen', 'Nico', '2026-07-14', '2026-07-18', 'active', 'Kann parallel laufen', 3).lastInsertRowid);
    const achse = Number(item.run(p1, 'work', 'Achse montieren', 'Jan', '2026-07-27', '2026-07-31', 'open', '', 4).lastInsertRowid);
    const endmontage = Number(item.run(p1, 'work', 'Endmontage & Test', 'Team', '2026-08-03', '2026-08-14', 'open', '', 5).lastInsertRowid);
    dependency.run(achse, fraesteile);
    dependency.run(achse, motor);
    dependency.run(endmontage, achse);
    dependency.run(endmontage, kabel);

    const p2 = Number(project.run('Retrofit R-27', 'Kramer GmbH', '2026-08-14', '#6ca6a1', 'Kunde benötigt kurze Stillstandszeit').lastInsertRowid);
    const sensor = Number(item.run(p2, 'delivery', 'Sonder-Sensorik', 'Sensorik Nord', '2026-07-10', '2026-07-29', 'open', 'Lieferzeit noch nicht bestätigt', 1).lastInsertRowid);
    const schrank = Number(item.run(p2, 'work', 'Schaltschrank vorbereiten', 'Lena', '2026-07-13', '2026-07-24', 'active', '', 2).lastInsertRowid);
    const umbau = Number(item.run(p2, 'work', 'Umbau beim Kunden', 'Nico & Jan', '2026-08-03', '2026-08-07', 'open', '', 3).lastInsertRowid);
    dependency.run(umbau, sensor);
    dependency.run(umbau, schrank);
  });
  seed();
}

db.prepare("UPDATE items SET baseline_start_date = start_date WHERE baseline_start_date = ''").run();
db.prepare("UPDATE items SET baseline_end_date = end_date WHERE baseline_end_date = ''").run();
db.prepare("UPDATE items SET previous_end_date = end_date WHERE status = 'done' AND previous_end_date = ''").run();
db.prepare("UPDATE items SET end_date = actual_end_date WHERE status = 'done' AND actual_end_date <> ''").run();
