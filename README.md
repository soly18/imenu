# iMenu25

Modern cloud-based restaurant POS — React + Node.js + MySQL.

## Structure
```
imenu25/
├── frontend/           React + TypeScript + Vite + TailwindCSS
├── backend/            Node.js + Express + TypeScript + MySQL
├── shared/             Shared TypeScript types (used by both)
├── _previous-session/  Earlier JS prototype (client/ + server/) — reference only,
│                       not part of the build. Contains EOD / back-office / POS routes
│                       and a fuller schema.sql worth porting into backend/.
└── package.json        Monorepo workspace root
```

## Quick Start

1. **Install** (from the repo root): `npm install`
2. **Configure backend**: `cp backend/.env.example backend/.env` and set your MySQL password and two JWT secret strings.
3. **Create the database**:
   `mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS imenu25 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`
4. **Migrate + seed**: `npm run db:migrate && npm run db:seed`
5. **Run**: `npm run dev` → frontend http://localhost:5173, API http://localhost:3001

## Demo PINs (after seed)
| Role | PIN |
|------|-----|
| Admin | 1111 |
| Manager | 2222 |
| Cashier | 3333 |
| Waiter | 4444 |
| Kitchen | 5555 |

## What works today
- PIN login with JWT + silent refresh, role-based API access
- Dashboard KPIs, floor status, clock in/out
- POS: pick category, add items, change quantity, void, send to kitchen, pay (cash/card)
- Server is the source of truth for order totals

## Tables map
`/tables`: floor plan with live table status (free / open / sent to kitchen), your own tables highlighted. Tap a free table to open an order, tap an occupied one to continue it. A table can only have one open order: a second waiter tapping it gets the same order.

## Migrating a customer from the Delphi version
Admin screen **Migration**: enter the old MySQL 5.5 connection (or press *Find the old computer* on the same Wi-Fi / USB network), check the report, approve once, then it syncs automatically whenever the old computer is reachable. Run `tools/legacy/setup-win7.bat` once on the old computer first. Details and safety rules: `docs/legacy-migration.md`.
After pulling this version run `npm run migrate` in `backend/` (adds `legacy_connection`, `legacy_map`).

## Orders board
`/orders`: live board (refreshes every 10 s) with one column per employee and a colour per status (open, sent to kitchen, paid, cancelled, void). Tap an open order to continue it in the POS. Scrolling works by touch, wheel and mouse drag in both directions (`frontend/src/hooks/useDragScroll.tsx`). To add a status, see the comment at the top of `OrdersPage.tsx`.

## End-of-day reports (X / Z)
- **X** = live read-only report for the current period; **Z** = frozen, numbered snapshot (Reports page, admin/manager).
- A period = paid orders and voided items not yet claimed by a Z (`z_report_id IS NULL`), no timestamp math.
- Z is blocked while orders with items are open; empty open orders are cancelled and clocked-in staff are clocked out automatically.
- Cash declaration is per payment method (blind count), attached to the next Z.
- **Upgrading an existing DB:** after `git pull`, run `npm run migrate` in `backend/` (adds `declarations`, `voided_at`, `z_report_id`), then restart `npm run dev`.

## Not built yet
- Back Office screens (shell only), combo/pizza modals, split-bill UI, discounts UI, thermal printing, PDF/Excel export of reports (browser print only), per-shift/employee X filter, tips/service charge/invoices/multi-currency
- Import of legacy MySQL 5.5 iMenu data
- Tests

## Languages
Hebrew (RTL), English, Arabic (RTL), Russian — switch from the login screen or top bar.

## Android app, admin panel, themes
See [docs/android-and-admin.md](docs/android-and-admin.md).

## Vendor console (devices, licences, features)
See [docs/console.md](docs/console.md).

## Windows / Linux / macOS / Android / iOS
See [docs/cross-platform.md](docs/cross-platform.md).
