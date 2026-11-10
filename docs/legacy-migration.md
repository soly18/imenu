# Migrating a customer from Delphi iMenu to iMenu25

Goal: take a real customer's existing MySQL database and bring it into the new cloud system
**without touching the customer's live database, and in a way that can be repeated** (one
customer today, many later).

## Automatic migration (built)
In iMenu25 (as admin): **Migration** in the top bar.
1. Connect this device to the old computer's network (same Wi-Fi, or USB network/tethering: both just give each device an IP).
2. On the old computer run `tools/legacy/setup-win7.bat` once (read-only MySQL user + firewall). It prints the values to type.
3. **Find the old computer** (scans this device's networks for MySQL and reads the server's greeting, no password needed) → enter user/password/database → **Test** → **Save**.
4. Press **Check now**: it reads the old database and shows exactly what would be created, per entity, with samples and warnings. Nothing is written.
5. If the report is right, **Approve and import**. From then on, with **Automatic** on, the system re-checks every time the old computer becomes reachable (and every 10 minutes while it is) and syncs by itself.

Safety built in: the old database is only read (SELECT/SHOW are the only statements the code can send);
the password is stored encrypted; an approval is tied to the old database's exact table/column layout,
so if the layout changes, automatic import stops and asks for a new approval; every imported row is
remembered, so repeated syncs never duplicate; rows created in the new system are never touched.

What is imported today: floor plan + tables, menu groups, menu items (price, take-away price, VAT, active),
employees (PIN re-hashed; imported **inactive** if the PIN is missing, non-numeric, or clashes).
Not yet: sales history, Z reports, modifiers/combos, customers: these need the real schema.

> **Important:** the column mapping uses the names seen in the Delphi sources (`EmployeeID`, `empPrimeLang`,
> `zoneID`, `OrdersPrice`, …) plus common alternatives, but the real schema has not been seen. The
> check-first design exists for exactly that: if a required column is not found, that entity is skipped
> and the report says which columns exist. Send the downloaded database profile (button on the page)
> and I fix the mapping.

> Status of the rest: this is the plan. The importer itself cannot be written before we see the real
> legacy schema. Step 1 below produces exactly what is needed.

## Principles
1. **Never write to the legacy database.** Everything works on a *copy* (a `mysqldump` file).
2. **Never import blindly.** Every run is a *dry run first*: it prints what it would create,
   what it could not map, and totals to compare with the old system.
3. **Repeatable.** Re-running the import must not create duplicates. Every imported row is
   recorded in a `legacy_map(entity, legacy_id, new_id)` table, so the second run updates
   instead of inserting.
4. **Reconcile with money.** The import is accepted only when totals match the old system's
   own reports (see "Proof").
5. **Masters first, history optional.** The restaurant can run tomorrow with menu +
   employees + tables. Old sales history is a separate, lower-risk step.

## What moves, in what order
| # | Data | Why this order | Notes |
|---|------|----------------|-------|
| 1 | Branch / settings | everything hangs on it | VAT rate, currency, names |
| 2 | Employees (+ roles, PINs) | needed to log in | **PINs are re-hashed** (bcrypt); see "Security" |
| 3 | Floor plan + tables | tables map | Delphi positions/sizes → `pos_x/pos_y/width/height` |
| 4 | Menu groups, items, prices, VAT per item | the POS | Hebrew names → `name_primary`, other language → `name_secondary` |
| 5 | Choices / modifiers / extras | order screen | Delphi "combo / pizza" structures may need a mapping table |
| 6 | Customers / members / tabs | optional | only if the customer uses them |
| 7 | **History**: closed orders, payments, Z reports | reports, audits | optional; see below |

Open (unpaid) orders at cutover are **not** migrated: the customer runs a Z in Delphi first
(see "Cutover").

## Step 1: look at the real database (needs you, on the Win7 machine)
Run `tools/legacy/inspect.sql` (read-only, MySQL 5.5):

    mysql -u root -p --default-character-set=utf8 DBNAME < inspect.sql > legacy-profile.txt

It lists tables, columns, keys, row counts and charset. It contains **no customer data**.
From it I write the exact mapping and the importer. Please also tell me which Delphi
version/build of iMenu the customer runs, since schemas differ between versions.

## Step 2: take a safe copy
On the Win7 machine, with the restaurant closed or at a quiet moment:

    mysqldump -u root -p --single-transaction --default-character-set=utf8 DBNAME > customer.sql

Copy `customer.sql` to the Mac and load it into a **scratch** database called `legacy_<customer>`.
The importer reads only from there.

## Step 3: the importer (to be written after Step 1)
A script `backend/src/tools/importLegacy.ts` that:
- connects to `legacy_<customer>` (read-only user) and to the new database;
- takes `--customer <branch id>`, `--only <entity,entity>`, and `--dry-run` (default);
- converts each entity with an explicit, reviewable mapping, one file per entity;
- records `legacy_map`, and writes a human-readable report (counts, skipped rows and why).

## Known risk areas (all Delphi-era classics)
- **Hebrew encoding.** Old databases are often `latin1` or `cp1255` with Hebrew stored as
  mis-tagged bytes. The inspection tells us the charset; if it is wrong the importer converts
  explicitly (never relies on the connection). We test with a few Hebrew item names first.
- **Money as FLOAT/DOUBLE.** Values like `12.299999` are rounded to 2 decimals on import
  and the rounding difference is reported.
- **No foreign keys / orphan rows** (menu items pointing to deleted groups etc.). Orphans
  are listed in the report, not silently dropped.
- **Soft deletes and "hidden" flags.** Deleted/hidden items are imported as inactive, so old
  sales still resolve their names.
- **Order numbers** from the old system are kept in `order_number` for history, so a customer
  can still look up "order 10432".
- **Time zones.** The new system stores UTC. The importer needs the customer's local zone
  (Israel: handles DST) to convert old local timestamps.
- **Z reports.** Old Z reports are imported as frozen history rows (numbers kept), and the
  new numbering continues after the last one.

## Cutover (day the customer switches)
1. Final import of masters (menu/prices/employees) from a fresh dump the evening before.
2. In Delphi: close all tables, run the **last Z**, take the **final dump**.
3. Import history up to that Z (if wanted), set the next Z number = last Z + 1.
4. Start iMenu25. Keep the Delphi machine untouched for 2 weeks as a fallback.

## Proof (acceptance checks, automated in the dry-run report)
- Item count and price list identical (spot-check the 20 best sellers by hand).
- Employee count and roles identical.
- For history: per Z report, **net sales, VAT, and per-payment-method totals equal the old
  Z report to the agora**; any difference blocks acceptance.
- A manager prints one old Z and one imported Z side by side.

## Security
- Delphi PINs/passwords may be stored in clear text or with a weak hash. They are never
  copied as-is: the importer hashes them with bcrypt, and the dump file is deleted from
  shared machines after import.
- `customer.sql` contains the customer's business data: keep it off GitHub (it is in
  `.gitignore`) and delete the scratch database after acceptance.

## Multi-customer later
The new schema is already per-`branch_id`. A second customer is a second branch (or a
separate database), imported with the same tool and a different `--customer`.
