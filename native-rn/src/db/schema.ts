import * as SQLite from 'expo-sqlite';

let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function initTrailDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('follow_the_trail.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_photo_id TEXT,
      color TEXT NOT NULL DEFAULT '#B84F24',
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      distance_meters REAL NOT NULL DEFAULT 0,
      moving_time_ms INTEGER NOT NULL DEFAULT 0,
      total_time_ms INTEGER NOT NULL DEFAULT 0,
      rest_time_ms INTEGER NOT NULL DEFAULT 0,
      ascent_meters REAL NOT NULL DEFAULT 0,
      descent_meters REAL NOT NULL DEFAULT 0,
      max_altitude_meters REAL NOT NULL DEFAULT 0,
      min_altitude_meters REAL NOT NULL DEFAULT 0,
      max_speed_mps REAL NOT NULL DEFAULT 0,
      avg_speed_mps REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      active_version_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS track_versions (
      id TEXT PRIMARY KEY NOT NULL,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      parent_version_id TEXT,
      summary TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      is_original_raw INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS track_segments (
      id TEXT PRIMARY KEY NOT NULL,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      version_id TEXT NOT NULL REFERENCES track_versions(id) ON DELETE CASCADE,
      segment_index INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS track_points (
      id TEXT PRIMARY KEY NOT NULL,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      segment_id TEXT NOT NULL REFERENCES track_segments(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude_meters REAL NOT NULL,
      accuracy_meters REAL NOT NULL,
      speed_mps REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      is_raw INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS waypoints (
      id TEXT PRIMARY KEY NOT NULL,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude_meters REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      distance_from_start_meters REAL NOT NULL DEFAULT 0,
      distance_to_end_meters REAL NOT NULL DEFAULT 0,
      cumulative_track_meters REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY NOT NULL,
      track_id TEXT REFERENCES tracks(id) ON DELETE CASCADE,
      waypoint_id TEXT REFERENCES waypoints(id) ON DELETE SET NULL,
      track_point_id TEXT REFERENCES track_points(id) ON DELETE SET NULL,
      original_uri TEXT NOT NULL,
      thumbnail_uri TEXT NOT NULL,
      captured_at INTEGER,
      latitude REAL,
      longitude REAL,
      altitude_meters REAL,
      exif_json TEXT NOT NULL DEFAULT '{}',
      match_confidence TEXT NOT NULL,
      confirmed_by_user INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      waypoint_id TEXT REFERENCES waypoints(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_points_track_seq ON track_points(track_id, seq);
    CREATE INDEX IF NOT EXISTS idx_waypoints_track ON waypoints(track_id);
    CREATE INDEX IF NOT EXISTS idx_photos_track ON photos(track_id);
    CREATE INDEX IF NOT EXISTS idx_photos_track_point ON photos(track_point_id);
  `);

  // Non-destructive column extension for pre-existing local SQLite databases
  const photoCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(photos)');
  const colNames = new Set(photoCols.map((c) => c.name));
  if (!colNames.has('track_point_id')) {
    await db.execAsync(
      'ALTER TABLE photos ADD COLUMN track_point_id TEXT REFERENCES track_points(id) ON DELETE SET NULL'
    );
  }
  if (!colNames.has('created_at')) {
    await db.execAsync('ALTER TABLE photos ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0');
  }

  return db;
}

export function openTrailDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInitPromise) {
    dbInitPromise = initTrailDatabase().catch((err) => {
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}
