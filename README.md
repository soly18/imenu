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

## Not built yet
- Back Office screens (shell only), X/Z reports, combo/pizza modals, split bill and the other payment methods, discounts UI, printing
- Arabic and Russian translations are English placeholders (`frontend/src/i18n/locales/ar.json`, `ru.json`)
- Tests

## Languages
Hebrew (RTL), English, Arabic (RTL), Russian — switch from the login screen or top bar.
