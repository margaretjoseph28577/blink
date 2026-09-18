import { getDb } from '../db/connection';
import type { ActivityRow, Paged } from '../../shared/types';

export function logActivity(userId: number | null, action: string, detail: string): void {
  getDb()
    .prepare('INSERT INTO activity_log (user_id, action, detail) VALUES (?, ?, ?)')
    .run(userId, action, detail);
}

/** Full audit log, newest first, with optional action filter. */
export function listActivity(opts: {
  page?: number;
  pageSize?: number;
  action?: string;
}): Paged<ActivityRow> {
  const db = getDb();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, opts.pageSize ?? 30);
  const where = opts.action?.trim() ? 'WHERE a.action = :action' : '';
  const params: Record<string, unknown> = opts.action?.trim() ? { action: opts.action.trim() } : {};
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM activity_log a ${where}`).get(params) as { n: number }
  ).n;
  const rows = db
    .prepare(
      `SELECT a.id, a.at, a.action, a.detail, u.username
       FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.id DESC LIMIT :limit OFFSET :offset`,
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as ActivityRow[];
  return { rows, total };
}
