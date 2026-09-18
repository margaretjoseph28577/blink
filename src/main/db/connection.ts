import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from './migrations';

let db: Database.Database | null = null;

export function getUserDataDir(): string {
  // LIBRAFLOW_DATA_DIR lets dev/test runs point at a scratch data dir instead of the real one.
  return process.env.LIBRAFLOW_DATA_DIR || app.getPath('userData');
}

export function getCoversDir(): string {
  const dir = path.join(getUserDataDir(), 'covers');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getPhotosDir(): string {
  const dir = path.join(getUserDataDir(), 'photos');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDb(): Database.Database {
  if (db) return db;
  const dir = getUserDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'library.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
