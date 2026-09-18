import fs from 'node:fs';
import path from 'node:path';
import { closeDb, getCoversDir, getDb, getUserDataDir } from '../db/connection';
import { getSettings, updateSettings } from './settingsService';
import { logActivity } from './activityService';

/** Auto-backups beyond this many are pruned, oldest first. */
const KEEP_BACKUPS = 30;

const BACKUP_DIR_RE = /^library-backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/;

function localStamp(): { dir: string; display: string } {
  const now = (
    getDb().prepare("SELECT datetime('now','localtime') AS d").get() as { d: string }
  ).d; // "YYYY-MM-DD HH:MM:SS"
  return { dir: now.replace(/[: ]/g, '-'), display: now };
}

/** Copy database + covers into a timestamped subfolder of destRoot; returns the folder path. */
export function runBackupTo(destRoot: string): string {
  const destDir = path.join(destRoot, `library-backup-${localStamp().dir}`);
  fs.mkdirSync(destDir, { recursive: true });
  const db = getDb();
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(path.join(getUserDataDir(), 'library.db'), path.join(destDir, 'library.db'));
  const coversDir = getCoversDir();
  const coversDest = path.join(destDir, 'covers');
  fs.mkdirSync(coversDest, { recursive: true });
  for (const f of fs.readdirSync(coversDir)) {
    fs.copyFileSync(path.join(coversDir, f), path.join(coversDest, f));
  }
  return destDir;
}

/** Delete the oldest auto-backup folders beyond the retention limit. Only touches our own naming pattern. */
export function pruneOldBackups(destRoot: string, keep = KEEP_BACKUPS): void {
  const dirs = fs
    .readdirSync(destRoot)
    .filter((n) => BACKUP_DIR_RE.test(n))
    .sort(); // timestamp format sorts chronologically
  for (const n of dirs.slice(0, Math.max(0, dirs.length - keep))) {
    fs.rmSync(path.join(destRoot, n), { recursive: true, force: true });
  }
}

function runAutoBackup(dir: string, trigger: string): string {
  const saved = runBackupTo(dir);
  pruneOldBackups(dir);
  updateSettings({ backup_auto_last: localStamp().display });
  logActivity(null, 'backup', `Automatic backup (${trigger}) saved to ${saved}`);
  return saved;
}

/**
 * Startup auto-backup: runs when a backup folder is configured and no auto-backup
 * has happened today. Covers the crash case where the quit backup never ran.
 */
export function autoBackupIfDue(): string | null {
  const settings = getSettings();
  const dir = settings.backup_dir?.trim();
  if (!dir || !fs.existsSync(dir)) return null;
  const today = (getDb().prepare("SELECT date('now','localtime') AS d").get() as { d: string }).d;
  if (settings.backup_auto_last?.slice(0, 10) === today) return null;
  return runAutoBackup(dir, 'startup');
}

/** Quit auto-backup: always runs when a backup folder is configured, capturing the day's changes. */
export function autoBackupOnQuit(): string | null {
  const dir = getSettings().backup_dir?.trim();
  if (!dir || !fs.existsSync(dir)) return null;
  return runAutoBackup(dir, 'on close');
}

/**
 * Replace the live database and covers with the contents of a backup folder.
 * Keeps a pre-restore safety copy of the current database in userData.
 * The caller must relaunch the app afterwards — the DB connection is closed here.
 */
export function restoreFromBackup(srcDir: string): void {
  const srcDb = path.join(srcDir, 'library.db');
  if (!fs.existsSync(srcDb)) {
    throw new Error('Selected folder does not contain a library.db backup');
  }
  const userDir = getUserDataDir();
  const liveDb = path.join(userDir, 'library.db');
  const stamp = localStamp().dir;

  const db = getDb();
  db.pragma('wal_checkpoint(TRUNCATE)');
  closeDb();

  fs.copyFileSync(liveDb, path.join(userDir, `library.db.pre-restore-${stamp}`));
  for (const suffix of ['-wal', '-shm']) {
    const p = liveDb + suffix;
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  }
  fs.copyFileSync(srcDb, liveDb);

  const srcCovers = path.join(srcDir, 'covers');
  if (fs.existsSync(srcCovers)) {
    const coversDir = getCoversDir();
    for (const f of fs.readdirSync(srcCovers)) {
      fs.copyFileSync(path.join(srcCovers, f), path.join(coversDir, f));
    }
  }

  // Log into the restored database (getDb reopens it) so the trail survives the restore.
  logActivity(null, 'restore', `Database restored from ${srcDir}`);
}
