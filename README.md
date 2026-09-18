# LibraFlow

A desktop library management system for schools. Offline-first: everything runs locally against a
SQLite database, with no server to set up and no internet connection required for day-to-day work.

Built with Electron, React and TypeScript.

## Features

**Catalog** — Titles and individual copies (accession numbers, shelf locations, cost, source).
ISBN lookup fetches metadata and cover art from Open Library / Google Books. Filter by category,
resource type, copy status or shelf location; table and cover-grid views; CSV import and export.

**Members** — Students (class, section, roll number, guardian contact) and staff. Photos, per-member
loan and fine history, optional OPAC logins so students can search the catalog and see their own
account.

**Circulation** — Scan-first issue and return. Issue several books to one member in a single action,
with borrowing limits, renewal caps and per-day fines applied automatically at check-in.

**Fines** — Accrue on overdue loans, charged at return; part payments and waivers are recorded with
an audit trail.

**Reports** — Accession register, circulation register, overdue list, fine collections, collection
summary and most-borrowed titles. Each prints to A4 and exports to CSV. Barcode labels and borrower
cards print from the same place.

**Stock verification** — Scan the shelves, see what is missing, and mark unaccounted copies as lost.

**Housekeeping** — Backup and restore, an activity log of every change, and staff accounts.

## Running it

Requires Node.js 22 or newer.

```bash
npm install
npm start
```

The first launch creates the database and an `admin` account with the password `admin`, which must be
changed at first sign-in.

Data lives in Electron's user-data directory (`%APPDATA%/lib_manage` on Windows). Set
`LIBRAFLOW_DATA_DIR` to point a dev or demo run at a different folder and leave the real library
untouched.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test:e2e    # backend end-to-end suite
npm run make        # build installers
```

`npm run test:e2e` drives the real IPC layer — permission guard, schema validation and services —
against a throwaway database. It runs inside Electron rather than plain Node, because better-sqlite3
is compiled against Electron's ABI.

## How it is put together

```
src/main/       Electron main process — SQLite access, business logic, IPC handlers
  db/           schema migrations and connection
  services/     catalog, members, circulation, fines, reports, stock, import, backup
  ipc/          one guarded, zod-validated handler per channel
src/preload/    the only bridge between main and renderer
src/renderer/   React UI (React Router, TanStack Query, Tailwind)
src/shared/     the typed IPC contract shared by both sides
test/           end-to-end backend suite
```

The renderer has no direct database or Node access. Every operation goes through a channel declared
in `src/shared/ipc-contract.ts`, which types both the caller and the handler, so a change to a
payload breaks the build on both sides. Handlers validate input with zod and check the session's
role before doing any work; members are restricted to an allowlist of read-only channels scoped to
their own record.

Money is stored in paise (integers) and dates as local `YYYY-MM-DD` strings computed by SQLite, so
neither rounding nor time zones can shift a due date.

## License

MIT
