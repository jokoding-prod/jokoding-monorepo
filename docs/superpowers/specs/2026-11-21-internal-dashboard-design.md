# internal.jokoding.id — Dashboard, transactions, new layout

Date: 2026-11-21
Status: draft, awaiting owner approval
Builds on: `2026-11-16-internal-jokoding-design.md` (phase 1, merged in PR #11)

## Intent

The owner wants to see how the business is doing at a glance: number of orders, gross revenue, net revenue and profit, and a running list of money in and money out. Costs (IoT parts for a given order, domains, ads budget, team fees) are entered by hand. The app also gets a proper admin layout modelled on the owner's other internal tool (Invitato Intools screenshots): left sidebar, top bar with logo and user menu, greeting banner with stat cards.

## Goals

- New layout: left sidebar (Beranda, Order, Invoice, Pengaturan; collapsible "Minimize Menu"), top bar with the Jokoding logo (`apps/jokoding.id/public/logo-jokoding-only.png` / `logo jokoding.png`) and user name dropdown (logout). Jokoding green, not Invitato maroon. Breadcrumb under the page title. Works on phone width (sidebar becomes a drawer).
- Beranda (admin):
  - Greeting banner "Hey, <name>", today's date, selected period chip.
  - Four cards: **Jumlah order**, **Omset kotor**, **Omset bersih**, **Keuntungan**, each with change vs the previous period of equal length.
  - Period filter: 1 bulan, 3 bulan, 6 bulan, semua (default 1 bulan = current calendar month).
  - Monthly chart: pemasukan vs pengeluaran per month.
  - Transaction list: income rows with a green up arrow, expense rows with a red down arrow; sortable by date (newest/oldest), paginated server-side.
  - Nearest deadlines list (active orders).
- Beranda (member): their own active orders, nearest deadlines, total price of their own orders. No transactions, no costs, no profit.
- Transactions (admin only): add, edit, delete manual entries.
- Orders table: sort by tanggal masuk and deadline (asc/desc), filter by month/period, server-side pagination.

## Definitions (decided by owner)

- **Pemasukan** = order prices (by `received_at`, automatic, never typed twice) + manual income entries.
- **Omset kotor** = sum of order prices in the period + manual income in the period.
- **Pengeluaran** = manual expense entries in the period, any category.
- **Omset bersih** = omset kotor − all expenses except category `fee_tim`.
- **Keuntungan** = omset bersih − expenses in category `fee_tim`. (Option B.)
- Payment status does not affect these numbers (same rule as phase-1 spec).

## Data model

`transactions`:
- id, date (DATE), type (`income` | `expense`), category (`alat`, `domain_hosting`, `ads`, `fee_tim`, `lainnya` for expense; `lainnya` for income), amount (bigint rupiah, > 0), note (text), order_id (nullable → orders, ON DELETE SET NULL), created_by, created_at, updated_at.
- Indexes on (date), (order_id).

Order income is not copied into `transactions`; the stats and list queries union orders with transactions. An order deleted later simply disappears from income.

## API (admin unless noted)

- `GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ orders, gross, net, profit, prev: {...same} }`. Member: `{ orders, gross }` over their own orders only.
- `GET /api/stats/monthly?months=12` → `[{ month: 'YYYY-MM', income, expense }]`.
- `GET /api/ledger?from&to&sort=date_desc|date_asc&page&limit` → `{ rows: [{ kind: 'order'|'transaction', id, date, type, category, amount, label, orderId }], total }`.
- `POST/PATCH/DELETE /api/transactions[/:id]`.
- `GET /api/orders` gains `sort=received_desc|received_asc|deadline_asc|deadline_desc`, `from`, `to`, `page`, `limit` (default 20, max 100), and returns `{ rows, total }`. Member visibility rules unchanged.
- Order detail shows linked expenses (admin only).

## Keeping data transfer small

The owner asked not to blow up database egress. The DB is on the owner's VPS (no per-GB bill), but the same habits apply:
- All sums and counts run in Postgres (`SUM`, `COUNT`, `GROUP BY date_trunc('month', …)`); the browser receives a handful of numbers.
- Lists are paginated server-side; no endpoint returns all rows.
- Dashboard responses are cached in the browser for the session (sessionStorage) with a "Data dari cache, diperbarui <time> · refresh" note and a refresh button, like the Intools screenshot.

## Non-goals

- Per-engineer payout reports, tax, multi-currency, bank sync, receipt uploads.
- Members seeing costs or profit.

## Calls made by Claude (owner to confirm)

- Expense categories: Alat/komponen, Domain & hosting, Ads, Fee tim, Lainnya. Owner can ask for more later; adding one is a small migration.
- "Change vs previous period" is shown as a small green/red badge, like Intools.
- Charts use a small library (Recharts) rather than hand-drawn SVG.
- Default period is the current calendar month.
