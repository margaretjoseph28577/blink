import fs from 'node:fs';
import path from 'node:path';
import { getDb, getPhotosDir } from '../db/connection';
import { logActivity } from './activityService';
import { getSession } from './authService';
import { listLoans } from './circulationService';
import { listFines } from './fineService';
import type { Member, MemberDetail, MemberInput, MemberListRow } from '../../shared/types';

function savePhotoFromDataUrl(memberId: number, dataUrl: string): string {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('Invalid photo image data');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const file = path.join(getPhotosDir(), `${memberId}.${ext}`);
  fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
  return file;
}

export function readPhotoDataUrl(memberId: number): string | null {
  const row = getDb().prepare('SELECT photo_path FROM members WHERE id = ?').get(memberId) as
    | { photo_path: string | null }
    | undefined;
  if (!row?.photo_path || !fs.existsSync(row.photo_path)) return null;
  const ext = path.extname(row.photo_path).slice(1).replace('jpg', 'jpeg');
  const buf = fs.readFileSync(row.photo_path);
  return `data:image/${ext};base64,${buf.toString('base64')}`;
}

export function nextMemberCode(): string {
  const row = getDb()
    .prepare("SELECT member_code FROM members ORDER BY id DESC LIMIT 1")
    .get() as { member_code: string } | undefined;
  const last = row ? Number(/(\d+)$/.exec(row.member_code)?.[1] ?? '0') : 0;
  return `M-${String(last + 1).padStart(4, '0')}`;
}

export function listMembers(opts: { search?: string; status?: string }): MemberListRow[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.search?.trim()) {
    where.push(
      `(m.name LIKE :q OR m.member_code LIKE :q OR m.email LIKE :q OR m.phone LIKE :q
        OR m.guardian_phone LIKE :q OR m.roll_no LIKE :q OR (m.class_name || '-' || COALESCE(m.section, '')) LIKE :q)`,
    );
    params.q = `%${opts.search.trim()}%`;
  }
  if (opts.status?.trim()) {
    where.push('m.status = :status');
    params.status = opts.status.trim();
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(
      `SELECT m.*,
         (SELECT COUNT(*) FROM loans l WHERE l.member_id = m.id AND l.status = 'active') AS active_loans,
         (SELECT COALESCE(SUM(f.amount_paise - f.amount_paid_paise), 0) FROM fines f
            WHERE f.member_id = m.id AND f.status = 'outstanding') AS outstanding_fines_paise,
         EXISTS (SELECT 1 FROM users u WHERE u.member_id = m.id AND u.is_active = 1) AS has_login
       FROM members m ${whereSql}
       ORDER BY m.member_code`,
    )
    .all(params) as MemberListRow[];
}

export function getMemberDetail(id: number): MemberDetail {
  const db = getDb();
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id) as Member | undefined;
  if (!member) throw new Error('Member not found');
  const login = db
    .prepare('SELECT username FROM users WHERE member_id = ? AND is_active = 1')
    .get(id) as { username: string } | undefined;
  return {
    member,
    hasLogin: !!login,
    loginUsername: login?.username ?? null,
    activeLoans: listLoans({ memberId: id, filter: 'active' }),
    loanHistory: listLoans({ memberId: id, filter: 'returned' }),
    fines: listFines({ memberId: id }),
  };
}

export function createMember(input: MemberInput): Member {
  const db = getDb();
  const tx = db.transaction(() => {
    const code = nextMemberCode();
    const s = schoolFields(input);
    const info = db
      .prepare(
        `INSERT INTO members (member_code, name, email, phone, join_date, status, notes,
                              member_type, class_name, section, roll_no, guardian_name, guardian_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        code,
        input.name.trim(),
        input.email || null,
        input.phone || null,
        input.join_date ||
          (db.prepare("SELECT date('now','localtime') AS d").get() as { d: string }).d,
        input.status || 'active',
        input.notes || null,
        s.member_type, s.class_name, s.section, s.roll_no, s.guardian_name, s.guardian_phone,
      );
    return db.prepare('SELECT * FROM members WHERE id = ?').get(Number(info.lastInsertRowid)) as Member;
  });
  const member = tx();
  if (input.photoDataUrl) {
    const file = savePhotoFromDataUrl(member.id, input.photoDataUrl);
    db.prepare('UPDATE members SET photo_path = ? WHERE id = ?').run(file, member.id);
    member.photo_path = file;
  }
  logActivity(getSession()?.id ?? null, 'member_add', `Registered ${member.name} (${member.member_code})`);
  return member;
}

/** Normalise the school-specific fields: staff carry no class/roll/guardian data. */
function schoolFields(input: MemberInput) {
  const member_type = input.member_type ?? 'student';
  const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  const student = member_type === 'student';
  return {
    member_type,
    class_name: student ? clean(input.class_name) : null,
    section: student ? clean(input.section)?.toUpperCase() ?? null : null,
    roll_no: student ? clean(input.roll_no) : null,
    guardian_name: student ? clean(input.guardian_name) : null,
    guardian_phone: student ? clean(input.guardian_phone) : null,
  };
}

export function updateMember(id: number, input: MemberInput): void {
  const s = schoolFields(input);
  getDb()
    .prepare(
      `UPDATE members SET name=?, email=?, phone=?, join_date=?, status=?, notes=?,
        member_type=?, class_name=?, section=?, roll_no=?, guardian_name=?, guardian_phone=?,
        updated_at=datetime('now','localtime') WHERE id=?`,
    )
    .run(
      input.name.trim(),
      input.email || null,
      input.phone || null,
      input.join_date,
      input.status,
      input.notes || null,
      s.member_type, s.class_name, s.section, s.roll_no, s.guardian_name, s.guardian_phone,
      id,
    );
  if (input.photoDataUrl) {
    const file = savePhotoFromDataUrl(id, input.photoDataUrl);
    getDb().prepare('UPDATE members SET photo_path = ? WHERE id = ?').run(file, id);
  }
  logActivity(getSession()?.id ?? null, 'member_edit', `Updated member ${input.name}`);
}

export function deleteMember(id: number): void {
  const db = getDb();
  const active = (
    db
      .prepare("SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND status = 'active'")
      .get(id) as { n: number }
  ).n;
  if (active > 0) throw new Error('Cannot delete: member has books on loan');
  const member = db.prepare('SELECT name, photo_path FROM members WHERE id = ?').get(id) as
    | { name: string; photo_path: string | null }
    | undefined;
  const hasHistory = (
    db.prepare('SELECT COUNT(*) AS n FROM loans WHERE member_id = ?').get(id) as { n: number }
  ).n;
  if (hasHistory > 0) {
    db.prepare("UPDATE members SET status = 'expired' WHERE id = ?").run(id);
    db.prepare('UPDATE users SET is_active = 0 WHERE member_id = ?').run(id);
    throw new Error('Member has loan history — marked as expired instead of deleting');
  }
  db.prepare('DELETE FROM users WHERE member_id = ?').run(id);
  db.prepare('DELETE FROM members WHERE id = ?').run(id);
  if (member?.photo_path && fs.existsSync(member.photo_path)) fs.unlinkSync(member.photo_path);
  logActivity(getSession()?.id ?? null, 'member_delete', `Deleted member ${member?.name ?? id}`);
}
