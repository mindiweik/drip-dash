import Database from 'better-sqlite3';

let instances = new Map<string, Database.Database>();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gardyn_id TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS care_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gardyn_id TEXT,
  name TEXT NOT NULL,
  every_days INTEGER NOT NULL,
  last_done_at TEXT
);
CREATE TABLE IF NOT EXISTS gardens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'gardyn',
  cols INTEGER NOT NULL,
  positions_per_col INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gardyn_id TEXT,
  plant_id INTEGER,
  schedule_id INTEGER,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT,
  due_at TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  variety TEXT,
  temp_pref TEXT,
  time_to_maturity TEXT,
  care_instructions TEXT,
  about TEXT,
  uses TEXT,
  details TEXT,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_identity
  ON catalog (name, COALESCE(variety, ''));
CREATE TABLE IF NOT EXISTS plants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gardyn_id TEXT NOT NULL,
  col INTEGER NOT NULL,
  position INTEGER NOT NULL,
  catalog_id INTEGER,
  planted_at TEXT,
  notes TEXT,
  demo INTEGER NOT NULL DEFAULT 0,
  removed_at TEXT,
  removed_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plants_active_slot
  ON plants (gardyn_id, col, position) WHERE removed_at IS NULL;
`;

export function getDb(path?: string): Database.Database {
  const key = path ?? process.env.DB_PATH ?? 'drip-dash.db';
  let db = instances.get(key);
  if (!db) {
    // Treat any key starting with ':memory:' as anonymous in-memory (not file-based)
    const dbPath = key.startsWith(':memory:') ? ':memory:' : key;
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(SCHEMA);
    instances.set(key, db);
  }
  return db;
}
