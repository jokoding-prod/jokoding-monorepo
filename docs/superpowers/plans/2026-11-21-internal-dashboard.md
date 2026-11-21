# internal.jokoding.id Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin dashboard with order/revenue/profit stats, a manual income/expense ledger, a sidebar layout, and sortable paginated orders.

**Architecture:** New `transactions` table plus aggregate endpoints in `apps/internal-api` (all sums in SQL, paginated lists). The frontend `apps/internal.jokoding.id` gets a new Shell (sidebar + top bar), a Beranda page with cards, chart and ledger list, a transaction form, and server-paginated orders.

**Tech Stack:** Hono, pg, node:test; React 18, Vite, Tailwind 4, react-router 7, vitest, Testing Library, Recharts.

**Spec:** `docs/superpowers/specs/2026-11-21-internal-dashboard-design.md` (builds on `2026-11-16-internal-jokoding-design.md`)

## Global Constraints

- Admin-only data (transactions, net, profit, ledger, monthly chart) must be refused with 403 for members in the API, not only hidden in the UI.
- Omset kotor = order prices by `received_at` + manual income; omset bersih = kotor − expenses except category `fee_tim`; keuntungan = bersih − `fee_tim` expenses.
- Expense categories exactly: `alat`, `domain_hosting`, `ads`, `fee_tim`, `lainnya`; income category `lainnya`.
- Amounts are integer rupiah, > 0, stored as bigint.
- No endpoint returns unbounded rows: list endpoints take `page` and `limit` (default 20, max 100) and return `{ rows, total }`.
- Period boundaries are inclusive `from`/`to` DATE strings in Asia/Jakarta.
- UI copy in Indonesian; Jokoding green theme; works at 375px width.
- Existing member visibility rules for orders stay unchanged.

## Review Focus

- Empty period (no orders, no transactions): cards show 0 and the previous-period badge does not divide by zero.
- `fee_tim` expense counted exactly once (only in keuntungan, not also in bersih).
- Deleting an order linked to an expense: the expense survives with `order_id` null.
- Member calling `/api/stats` gets only their own orders' count and gross, never net/profit.
- Orders pagination with sort by deadline when some deadlines are null (nulls last).

---

### Task 1: API — transactions, stats, ledger, order pagination

**Files:** Create `apps/internal-api/migrations/003_transactions.sql`, `apps/internal-api/src/transactions.js`, `apps/internal-api/src/stats.js`, `apps/internal-api/test/transactions.test.js`, `apps/internal-api/test/stats.test.js`. Modify `apps/internal-api/src/app.js`, `apps/internal-api/src/orders.js`, existing orders tests.

**Interfaces (produces):**
- `POST /api/transactions` `{date, type, category, amount, note?, orderId?}` returns 201 with the row in camelCase. `PATCH /api/transactions/:id` takes the same fields, all optional. `DELETE /api/transactions/:id` returns 204. `GET /api/orders/:id/transactions` returns rows (admin).
- `GET /api/stats?from&to` → admin `{orders, gross, net, profit, prev:{orders,gross,net,profit}}`, where prev is the period of equal length immediately before. Member: `{orders, gross, prev:{orders,gross}}` for orders they're assigned to or created.
- `GET /api/stats/monthly?months=12` (1..36) → `[{month:'YYYY-MM', income, expense}]` oldest first, including zero months (admin).
- `GET /api/ledger?from&to&sort=date_desc|date_asc&page&limit` → `{rows:[{kind:'order'|'transaction', id, date, type:'income'|'expense', category, amount, label, orderId}], total}` (admin). The label for an order row is `project_name — client_name`.
- `GET /api/orders` now takes `sort=received_desc|received_asc|deadline_asc|deadline_desc` (default received_desc), `from`, `to`, `page`, and `limit`, and returns `{rows, total}`. This is a breaking change, so the frontend in Task 3 must follow it.

- [ ] Write the tests first, covering every Review Focus line plus: validation 400s (bad type/category/amount ≤ 0/bad date), member 403 on transactions, ledger and monthly, ledger sort order, and pagination totals. Run them and see them fail. Implement. Run the full API suite and see it pass. Commit.

### Task 2: Frontend — sidebar layout

**Files:** Modify `apps/internal.jokoding.id/src/layout/Shell.jsx` (or split into `Sidebar.jsx`, `TopBar.jsx`), copy the logo from `apps/jokoding.id/public/logo-jokoding-only.png` into `apps/internal.jokoding.id/public/`, and add a test.

- Desktop: fixed left sidebar with icons + labels (Beranda, Order, Invoice and Pengaturan are admin only), and a "Minimize Menu" toggle that collapses it to icons only, remembered in localStorage inside try/catch. Top bar: logo + "Internal" badge on the left, user name dropdown with "Keluar" on the right. The page header shows the title and a breadcrumb.
- Below 768px, the sidebar becomes a drawer opened from a hamburger.
- Tests: the member does not see the Invoice/Pengaturan links, the collapse toggle works, and logout is called.

### Task 3: Frontend — Beranda dashboard, transactions, orders table

**Files:** Create `src/dashboard/{DashboardPage.jsx, StatCards.jsx, MonthlyChart.jsx, LedgerList.jsx, TransactionForm.jsx, cache.js}` and tests. Modify `src/orders/OrdersPage.jsx` (sort headers, period filter, pagination), `src/orders/OrderDetail.jsx` (linked expenses, admin), and `App.jsx` routes. Add `recharts`.

- Admin Beranda: a green banner "Hey, <name>" with the date and a period chip, 4 cards with a ↑ green/↓ red change badge vs the previous period, period buttons (1 Bulan = current month, 3 Bulan, 6 Bulan, Semua), the monthly chart, the ledger list (green ↑ income, red ↓ expense, sortable by date, pager), a "Tambah transaksi" button opening the form, and the nearest-deadline list.
- Member Beranda: banner, 2 cards (Jumlah order, Total harga), nearest deadlines.
- `cache.js`: sessionStorage cache keyed by endpoint+params, wrapped in try/catch, plus the note "Data dari cache · diperbarui HH:mm · refresh".
- Orders: clickable column headers to sort by tanggal masuk and deadline, a period select, and a pager. The API from Task 1 does the work.
- Tests: card values render, the badge color follows the sign, the ledger arrow color follows the type, the transaction form posts the right body, and the member sees no net/profit.

### Final: whole-branch review on the most capable model, then fix wave, run all suites + build.
