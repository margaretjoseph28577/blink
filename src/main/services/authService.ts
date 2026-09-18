import bcrypt from 'bcryptjs';
import { getDb } from '../db/connection';
import type { SessionUser, StaffUser } from '../../shared/types';
import { logActivity } from './activityService';

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: 'librarian' | 'member';
  member_id: number | null;
  is_active: number;
  must_change_password: number;
}

/** In-memory session — single desktop app, one user at a time. */
let currentUser: SessionUser | null = null;

export function getSession(): SessionUser | null {
  return currentUser;
}

export function seedAdminIfNeeded(): void {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  if (count === 0) {
    db.prepare(
      "INSERT INTO users (username, password_hash, role, must_change_password) VALUES ('admin', ?, 'librarian', 1)",
    ).run(bcrypt.hashSync('admin', 10));
  }
}

export function login(username: string, password: string): SessionUser {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
    .get(username.trim()) as UserRow | undefined;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    throw new Error('Invalid username or password');
  }
  currentUser = {
    id: row.id,
    username: row.username,
    role: row.role,
    memberId: row.member_id,
    mustChangePassword: row.must_change_password === 1,
  };
  logActivity(row.id, 'login', `${row.username} logged in`);
  return currentUser;
}

export function logout(): void {
  if (currentUser) logActivity(currentUser.id, 'logout', `${currentUser.username} logged out`);
  currentUser = null;
}

export function changePassword(currentPassword: string, newPassword: string): void {
  if (!currentUser) throw new Error('Not logged in');
  if (newPassword.length < 4) throw new Error('New password must be at least 4 characters');
  const db = getDb();
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(currentUser.id) as
    | { password_hash: string }
    | undefined;
  if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
    throw new Error('Current password is incorrect');
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
    bcrypt.hashSync(newPassword, 10),
    currentUser.id,
  );
  currentUser.mustChangePassword = false;
}

export function createMemberLogin(memberId: number, username: string, password: string): void {
  const db = getDb();
  const member = db.prepare('SELECT id, name FROM members WHERE id = ?').get(memberId) as
    | { id: number; name: string }
    | undefined;
  if (!member) throw new Error('Member not found');
  if (password.length < 4) throw new Error('Password must be at least 4 characters');
  const existing = db
    .prepare('SELECT id FROM users WHERE member_id = ?')
    .get(memberId) as { id: number } | undefined;
  const hash = bcrypt.hashSync(password, 10);
  if (existing) {
    db.prepare('UPDATE users SET username = ?, password_hash = ?, is_active = 1 WHERE id = ?').run(
      username.trim(),
      hash,
      existing.id,
    );
  } else {
    db.prepare(
      "INSERT INTO users (username, password_hash, role, member_id) VALUES (?, ?, 'member', ?)",
    ).run(username.trim(), hash, memberId);
  }
  logActivity(currentUser?.id ?? null, 'member_login', `Login created for member ${member.name}`);
}

// --- staff (librarian) account management ---

export function listStaff(): StaffUser[] {
  return getDb()
    .prepare(
      "SELECT id, username, is_active, created_at FROM users WHERE role = 'librarian' ORDER BY username",
    )
    .all() as StaffUser[];
}

export function createStaff(username: string, password: string): void {
  const db = getDb();
  const name = username.trim();
  if (name.length < 2) throw new Error('Username must be at least 2 characters');
  if (password.length < 4) throw new Error('Password must be at least 4 characters');
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(name);
  if (existing) throw new Error(`Username "${name}" is already taken`);
  db.prepare(
    "INSERT INTO users (username, password_hash, role, must_change_password) VALUES (?, ?, 'librarian', 1)",
  ).run(name, bcrypt.hashSync(password, 10));
  logActivity(currentUser?.id ?? null, 'staff_add', `Staff account "${name}" created`);
}

function getStaffRow(userId: number): { id: number; username: string; is_active: number } {
  const row = getDb()
    .prepare("SELECT id, username, is_active FROM users WHERE id = ? AND role = 'librarian'")
    .get(userId) as { id: number; username: string; is_active: number } | undefined;
  if (!row) throw new Error('Staff account not found');
  return row;
}

/** Reset another librarian's password; they must change it at next login. */
export function setStaffPassword(userId: number, newPassword: string): void {
  if (newPassword.length < 4) throw new Error('Password must be at least 4 characters');
  const row = getStaffRow(userId);
  getDb()
    .prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 10), userId);
  logActivity(currentUser?.id ?? null, 'staff_edit', `Password reset for staff "${row.username}"`);
}

export function setStaffActive(userId: number, active: boolean): void {
  const db = getDb();
  const row = getStaffRow(userId);
  if (!active) {
    if (currentUser?.id === userId) throw new Error('You cannot deactivate your own account');
    const activeCount = (
      db
        .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'librarian' AND is_active = 1")
        .get() as { n: number }
    ).n;
    if (row.is_active === 1 && activeCount <= 1) {
      throw new Error('Cannot deactivate the last active staff account');
    }
  }
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(active ? 1 : 0, userId);
  logActivity(
    currentUser?.id ?? null,
    'staff_edit',
    `Staff "${row.username}" ${active ? 'activated' : 'deactivated'}`,
  );
}
