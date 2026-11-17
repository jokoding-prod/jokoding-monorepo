# internal.jokoding.id Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship phase 1 of internal.jokoding.id: login with admin/member roles, Order tab, Invoice tab (created from an order, printable PDF), API + Postgres on the VPS, frontend on Vercel.

**Architecture:** React SPA (`apps/internal.jokoding.id`, Vercel) calls a Node API (`apps/internal-api`, VPS, systemd behind nginx + HTTPS at `api.internal.jokoding.id`) which talks to PostgreSQL on localhost. Pure invoice logic is shared through `packages/invoice-core`. Every access rule is enforced in the API.

**Tech Stack:** pnpm + Turbo monorepo; React 18, Vite, Tailwind 4, react-router-dom 7; Node 20+, Hono + `@hono/node-server`, `pg`; password hashing with `node:crypto` scrypt (no native deps); tests with `node:test` (API, core) and vitest + Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-11-16-internal-jokoding-design.md`

## Global Constraints

- Postgres listens on localhost only; API binds `127.0.0.1:3300`. Never use ports 3100 or 8080 (old invoice app).
- Money is integer rupiah (`integer`/`bigint`), no floats in DB.
- Invoice number format `INV-004/JKD/XI/2026` (reuse `../invoice/js/calc.js`).
- One invoice per order: `invoices.order_id` UNIQUE (nullable for legacy).
- Roles: `admin` | `member`. Member sees orders where `assignee_id = me OR created_by = me`; can create orders, edit own-created orders without invoice; cannot delete orders; no invoice access, no settings.
- Admin: everything. Only orders without invoice can be deleted.
- Invoice is frozen after creation: stores copies of client, items, bank (name/number/holder). Editing an order never changes its invoice.
- Session cookie: name `jki_session`, httpOnly, Secure (prod), `SameSite=Lax`, `Domain=.internal.jokoding.id` in prod, 30 days.
- CORS: only `CORS_ORIGIN` env (prod `https://internal.jokoding.id`), credentials allowed.
- UI copy in Bahasa Indonesia; invoice PDF copy in English exactly as the current app (`../invoice/index.html`).
- Frontend has `<meta name="robots" content="noindex, nofollow">`.

## Review Focus

1. Member requests another member's order by id (`GET/PATCH /api/orders/:id`) → 404, not the data. Test in Task 4.
2. Two invoices created for the same order at once (double click) → second gets 409, no duplicate. Test in Task 5.
3. Deactivated user with a live cookie → 401 on next request. Test in Task 3.
4. Price input like `"350.000"` or negative → 400 with message; never stored as 350 or -1. Test in Task 4.
5. Two invoices created in the same year by different requests get distinct numbers (UNIQUE number, retry once on conflict). Test in Task 5.

---

## File Structure

```
packages/invoice-core/
  package.json                 @jokoding/invoice-core, exports ./src/index.js
  src/calc.js                  copied from ../invoice/js/calc.js
  src/filename.js              copied from ../invoice/js/filename.js
  src/fromOrder.js             order → invoice draft
  src/index.js
  test/*.test.js
apps/internal-api/
  package.json                 @jokoding/internal-api
  migrations/001_init.sql
  src/db.js                    pool + migrate()
  src/password.js              scrypt hash/verify
  src/auth.js                  sessions, middleware, login/logout/me routes
  src/orders.js                order routes + validation
  src/invoices.js              invoice + bank routes
  src/app.js                   createApp({ db, config }) → Hono app
  src/main.js                  reads env, serves
  src/cli.js                   create-admin, set-bank, add-user
  test/helpers.js              test DB setup
  test/*.test.js
  deploy/install.sh, deploy/internal-api.service, deploy/nginx.conf, deploy/README.md
apps/internal.jokoding.id/
  package.json, vite.config.js, index.html, vercel.json
  src/main.jsx, src/App.jsx
  src/api.js                   fetch wrapper
  src/auth/AuthContext.jsx, src/pages/Login.jsx
  src/layout/Shell.jsx         tabs by role
  src/pages/Beranda.jsx        placeholder in phase 1
  src/orders/OrdersPage.jsx, OrderForm.jsx, OrderDetail.jsx
  src/invoices/InvoicesPage.jsx, InvoiceEditor.jsx, InvoiceSheet.jsx, invoice-sheet.css
  src/**/*.test.jsx
```

---

### Task 1: `packages/invoice-core`

**Files:**
- Create: `packages/invoice-core/package.json`, `src/calc.js`, `src/filename.js`, `src/fromOrder.js`, `src/index.js`, `test/calc.test.js`, `test/fromOrder.test.js`

**Interfaces:**
- Produces: `toRoman`, `formatInvoiceNumber`, `parseInvoiceNumber`, `nextInvoiceNumber(existingNumbers: string[], date: Date) → string`, `calcTotals({items, discountType, discountValue, depositPercent}) → {subtotal, discount, total, depositPercent, deposit, remaining}`, `invoicePdfTitle(client, isoDate) → string`, `invoiceDraftFromOrder(order, bank, today: Date) → InvoiceDraft`.
- `InvoiceDraft = { date: 'YYYY-MM-DD', dueDate, client, clientPhone, items: [{name, quantity, price}], discountType: 'percent', discountValue: 0, depositPercent: 50, currency: 'IDR', bankName, accountNumber, accountHolder, notes, paid: false }`

- [ ] **Step 1:** Copy `../invoice/js/calc.js`, `js/filename.js` and `tests/calc.test.mjs` (as `test/calc.test.js`, imports fixed). Package script `"test": "node --test test/"`.
- [ ] **Step 2: Write failing test `test/fromOrder.test.js`**

```js
test("invoiceDraftFromOrder maps order fields", () => {
  const order = { project_name: "UTS pemrograman python", client_name: "Deka Restu", client_phone: "085150651021", price: 350000, deadline: "2026-11-30", scope_of_work: "- Menyiapkan dataset\n- Melatih jaringan" };
  const bank = { bank_name: "BSI", account_number: "7253435342", account_holder: "IRFAN QOBUS SALIM" };
  const d = invoiceDraftFromOrder(order, bank, new Date(2026, 10, 16));
  assert.equal(d.date, "2026-11-16");
  assert.equal(d.dueDate, "2026-11-30");
  assert.deepEqual(d.items, [{ name: "UTS pemrograman python", quantity: 1, price: 350000 }]);
  assert.equal(d.client, "Deka Restu");
  assert.equal(d.notes, order.scope_of_work);
  assert.equal(d.bankName, "BSI");
  assert.equal(d.depositPercent, 50);
});
test("invoiceDraftFromOrder without bank leaves bank fields empty", () => { /* bank=null → "" */ });
```

- [ ] **Step 3:** Run `pnpm --filter @jokoding/invoice-core test` → FAIL (not defined).
- [ ] **Step 4:** Implement `invoiceDraftFromOrder` in `src/fromOrder.js`; date formatted from local date parts (not `toISOString`, avoids UTC shift).
- [ ] **Step 5:** Run tests → PASS. Commit `feat(invoice-core): shared invoice logic`.

---

### Task 2: API skeleton, DB schema, migrations

**Files:**
- Create: `apps/internal-api/package.json`, `migrations/001_init.sql`, `src/db.js`, `src/app.js`, `src/main.js`, `test/helpers.js`, `test/db.test.js`

**Interfaces:**
- Produces: `createPool(databaseUrl) → pg.Pool`; `migrate(pool) → Promise<string[]>` (applied file names, idempotent, tracked in `schema_migrations`); `createApp({ pool, config }) → Hono`; `config = { corsOrigin, cookieDomain|null, secureCookies: bool }`; `GET /api/health → {ok:true}`.
- Test helper: `freshDb() → { pool, cleanup }` creates schema `test_<random>` on `TEST_DATABASE_URL`, sets `search_path`, runs `migrate`. Tests skip with a clear message if `TEST_DATABASE_URL` unset. Local Postgres: `brew install postgresql@16` or `docker run -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16`.

Schema (`001_init.sql`):
- `users(id serial pk, name text not null, username text unique not null, password_hash text not null, role text check in ('admin','member'), active boolean default true, created_at timestamptz default now())`
- `sessions(id text pk, user_id int references users on delete cascade, expires_at timestamptz not null)`
- `bank_accounts(id serial pk, slot int unique check (slot in (1,2)), bank_name, account_number, account_holder text not null, is_default boolean default false)`
- `orders(id serial pk, received_at date not null, project_name text not null, client_name text not null, client_phone text default '', deadline date, price bigint not null check (price >= 0), scope_of_work text default '', assignee_id int references users, created_by int references users not null, work_status text default 'baru' check in ('baru','dikerjakan','selesai'), payment_status text default 'belum' check in ('belum','dp','lunas'), created_at, updated_at timestamptz default now())`
- `invoices(id serial pk, order_id int unique references orders on delete restrict, number text unique not null, data jsonb not null, created_at timestamptz default now())` — `data` holds the full `InvoiceDraft` snapshot.

- [ ] **Step 1:** Test: `migrate` twice returns the file list then `[]`; tables exist; inserting two invoices with same `order_id` throws code `23505`.
- [ ] **Step 2:** Run `pnpm --filter @jokoding/internal-api test` → FAIL.
- [ ] **Step 3:** Implement `db.js`, migration, `app.js` with health route and CORS (`hono/cors`, origin = `config.corsOrigin`, credentials true), `main.js` reading `DATABASE_URL`, `PORT` (default 3300), `HOST` (default 127.0.0.1), `CORS_ORIGIN`, `COOKIE_DOMAIN`; runs `migrate` on start.
- [ ] **Step 4:** Tests PASS; `curl localhost:3300/api/health` returns `{"ok":true}`. Commit `feat(internal-api): schema and server skeleton`.

---

### Task 3: Auth, sessions, CLI

**Files:**
- Create: `src/password.js`, `src/auth.js`, `src/cli.js`, `test/auth.test.js`, `test/password.test.js`
- Modify: `src/app.js` (mount auth)

**Interfaces:**
- Produces: `hashPassword(plain) → Promise<string>` (format `scrypt$N$salt$hash`), `verifyPassword(plain, stored) → Promise<boolean>` (timingSafeEqual).
- `requireUser` middleware: sets `c.get('user') = {id, name, username, role}` or 401 `{error:'unauthorized'}`; rejects expired sessions and `active=false` users.
- `requireAdmin`: 403 `{error:'forbidden'}` for members.
- Routes: `POST /api/auth/login {username,password}` → 200 user + cookie / 401 `{error:'Username atau password salah'}`; `POST /api/auth/logout` → 204; `GET /api/auth/me` → user.
- Login rate limit: in-memory, 10 failed attempts per username+IP per 15 min → 429.
- CLI: `node src/cli.js create-admin <username> <name>` (prompts password, hidden), `add-user <username> <name>` (member), `set-bank <slot 1|2> <bank> <number> <holder> [--default]`, `deactivate <username>` (also deletes that user's sessions).

- [ ] **Step 1:** Tests: hash/verify round trip, wrong password false; login success sets `jki_session` cookie with HttpOnly and SameSite=Lax; wrong password 401; `me` without cookie 401; **deactivated user with valid cookie → 401** (Review Focus 3); 11th bad login → 429; member hitting a `requireAdmin` test route → 403.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Session id = 32 random bytes base64url; expiry 30 days.
- [ ] **Step 4:** Run → PASS. Commit `feat(internal-api): auth, roles, admin CLI`.

---

### Task 4: Orders API

**Files:**
- Create: `src/orders.js`, `test/orders.test.js`
- Modify: `src/app.js`

**Interfaces:**
- `Order` JSON: `{id, receivedAt, projectName, clientName, clientPhone, deadline, price, scopeOfWork, assignee:{id,name,active}|null, createdBy:{id,name}, workStatus, paymentStatus, invoice:{id,number}|null}`.
- `GET /api/orders` → `Order[]` sorted `received_at desc, id desc`; member filter per Global Constraints.
- `GET /api/orders/:id` → Order or 404 (also 404 when member not allowed).
- `POST /api/orders` → 201 Order. Required: `projectName`, `clientName`, `receivedAt`, `price`. `createdBy` = current user.
- `PATCH /api/orders/:id` → admin any field; member only own-created without invoice, and not `paymentStatus` (403 otherwise).
- `DELETE /api/orders/:id` → admin only; 409 `{error:'Order sudah punya invoice'}` if invoice exists.
- `GET /api/users/assignable` → `[{id,name,role}]` active users (any logged-in user; needed for the assignee dropdown).
- Validation: `price` must be a non-negative integer number (JSON number or digit-only string); otherwise 400 `{error:'Harga harus angka bulat ≥ 0'}`. Dates `YYYY-MM-DD`.

- [ ] **Step 1:** Tests: admin lists all; member A lists only assigned-or-created; **member A GET/PATCH member B's order → 404** (Review Focus 1); member creates order assigned to B and still sees it; **price `"350.000"` and `-1` → 400** (Review Focus 4); member PATCH own order after invoice exists → 403; member PATCH paymentStatus → 403; DELETE with invoice → 409.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit `feat(internal-api): orders`.

---

### Task 5: Invoices + bank accounts API (admin)

**Files:**
- Create: `src/invoices.js`, `test/invoices.test.js`
- Modify: `src/app.js`

**Interfaces:**
- Consumes: `invoiceDraftFromOrder`, `nextInvoiceNumber` from `@jokoding/invoice-core`.
- `GET /api/banks` → 2 slots (any admin). `GET /api/invoices` → `[{id, number, orderId, client, total, date, createdAt}]` newest first.
- `GET /api/orders/:id/invoice-draft` → `{number, draft}` using default bank and today; 409 if invoice exists.
- `POST /api/invoices {orderId, number, data: InvoiceDraft}` → 201 `{id, number, orderId, data}`; 409 if order already has invoice; on number conflict (`23505` on number) with an auto number, recompute next number and retry once, else 409 `{error:'Nomor invoice sudah dipakai'}`.
- `GET /api/invoices/:id`, `PUT /api/invoices/:id {number, data}` (manual admin edit).
- All routes `requireAdmin`.

- [ ] **Step 1:** Tests: draft has order values and default bank; create succeeds and order's `invoice` field filled; **two concurrent POSTs for same order → one 201, one 409** (Review Focus 2); **two orders invoiced concurrently without explicit distinct numbers get distinct numbers** (Review Focus 5); editing the order afterwards leaves `invoice.data.client` unchanged; member → 403.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit `feat(internal-api): invoices and bank accounts`.

---

### Task 6: Frontend scaffold, login, role shell

**Files:**
- Create: `apps/internal.jokoding.id/{package.json,vite.config.js,index.html,vercel.json}`, `src/main.jsx`, `src/App.jsx`, `src/api.js`, `src/auth/AuthContext.jsx`, `src/pages/Login.jsx`, `src/layout/Shell.jsx`, `src/pages/Beranda.jsx`, `src/test/setup.js`, `src/App.test.jsx`

**Interfaces:**
- `api(path, {method, body}) → Promise<json>`; base `import.meta.env.VITE_API_URL` (dev `http://localhost:3300`), `credentials:'include'`; throws `ApiError {status, message}`.
- `useAuth() → {user, login(username,password), logout()}`; on load calls `/api/auth/me`.
- Routes: `/login`, `/` (Beranda), `/order`, `/order/:id`, `/invoice`, `/invoice/:id`. Tabs: admin = Beranda, Order, Invoice; member = Beranda, Order. Non-admin visiting `/invoice*` redirects to `/`.
- `vercel.json`: SPA rewrite `{"source":"/(.*)","destination":"/index.html"}`.
- Beranda phase 1: greeting + link to Order (dashboard is phase 2).

- [ ] **Step 1:** Tests (vitest, mocked `fetch`): unauthenticated → Login; admin sees "Invoice" tab; member does not; login error shows "Username atau password salah".
- [ ] **Step 2:** FAIL. **Step 3:** Implement (Tailwind; Jokoding green `#22c55e`-family from `@jokoding/config` if it exports colors, else Tailwind green). **Step 4:** PASS, `pnpm --filter @jokoding/internal.jokoding.id build` OK. Commit `feat(internal): app shell and login`.

---

### Task 7: Order tab UI

**Files:**
- Create: `src/orders/OrdersPage.jsx`, `OrderForm.jsx`, `OrderDetail.jsx`, `src/format.js`, `src/orders/orders.test.jsx`

**Interfaces:**
- `formatRupiah(n) → "Rp350.000"`, `formatTanggal('2026-11-16') → "16 Nov 2026"`.
- Table columns left→right: Tanggal masuk, Nama project, Nama klien, Deadline, Harga, plus status badges (work + payment). Row click → `/order/:id`.
- `OrderForm`: fields per Task 4; "Dikerjakan oleh" select from `/api/users/assignable` excluding admin, plus checkbox "Saya sendiri (admin)" shown only to admin (checked → `assigneeId = me`, select disabled). Price input accepts digits only, shows formatted.
- `OrderDetail`: all fields, scope of work with line breaks preserved, edit button when allowed, admin sees payment/work status selects, invoice section: admin + no invoice → "Buat invoice" (→ `/invoice/new?order=:id`); invoice exists → number + "Lihat invoice".

- [ ] **Step 1:** Tests: table renders columns in order with `Rp350.000`; admin checkbox sets assignee to self in POST body; member sees no "Saya sendiri" checkbox and no "Buat invoice"; API 400 message shown in form.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit `feat(internal): order tab`.

---

### Task 8: Invoice tab UI + printable sheet

**Files:**
- Create: `src/invoices/InvoicesPage.jsx`, `InvoiceEditor.jsx`, `InvoiceSheet.jsx`, `invoice-sheet.css`, `src/invoices/invoices.test.jsx`; copy `../invoice/assets/logo.png`, `signature.png` to `public/`.

**Interfaces:**
- Consumes: `calcTotals`, `invoicePdfTitle` from invoice-core; API from Task 5.
- `/invoice/new?order=:id`: loads `invoice-draft`, editor (number, date, due date, items, discount, DP %, bank slot select, notes, paid) with live `InvoiceSheet` preview; "Simpan" → POST → `/invoice/:id`.
- `/invoice/:id`: preview + "Download PDF" (`document.title = invoicePdfTitle(...)`, `window.print()`) + "Edit".
- `InvoiceSheet({data})`: port markup and `../invoice/style.css` print rules for the sheet; English copy exactly as current (Payment Term sentences, "Thank you for trusting us…", "Irfan Qobus / Founder & CEO of Jokoding"). `@media print` hides app chrome.

- [ ] **Step 1:** Tests: sheet for the Deka Restu sample shows `Rp350.000` total, `Rp175.000` deposit, `30 NOVEMBER 2026`, bank `BSI`; editor POST body includes `orderId`; 409 shows message.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; manual: print preview in Chrome matches the old app's PDF on A4. Commit `feat(internal): invoice tab and PDF`.

---

### Task 9: VPS deploy scripts + guide, Vercel config

**Files:**
- Create: `apps/internal-api/deploy/install.sh`, `internal-api.service`, `nginx.conf`, `README.md`

**Interfaces:**
- `sudo bash deploy/install.sh api.internal.jokoding.id` (idempotent), modeled on `../invoice/deploy/install.sh`:
  1. Checks root, apt, ports 3300 free (or ours); 1 GB swap at `/swapfile` if no swap.
  2. Installs `postgresql` (16 if available), nginx, certbot; Node 20+ system-wide (asks before NodeSource).
  3. Postgres: `listen_addresses='localhost'`, `shared_buffers=256MB`, `max_connections=30`, `work_mem=4MB` via `conf.d/internal.conf`; creates role `internal` + DB `internal` with random password once.
  4. Writes `/etc/jokoding-internal/env` (mode 600): `DATABASE_URL`, `PORT=3300`, `HOST=127.0.0.1`, `CORS_ORIGIN=https://internal.jokoding.id`, `COOKIE_DOMAIN=.internal.jokoding.id`; kept on re-run.
  5. Copies app to `/opt/jokoding-internal`, `pnpm install --prod --filter @jokoding/internal-api...` (or `npm ci` in a deployed copy — builder's call), systemd service with `EnvironmentFile`, `DynamicUser`-style hardening as in the old unit.
  6. nginx site → `127.0.0.1:3300`, certbot `--redirect`.
  7. ufw: allow OpenSSH, 80, 443; enable (warn first so SSH isn't cut).
  8. Prints next steps: `create-admin`, `set-bank 1 …`, `set-bank 2 …`.
- `README.md` in Indonesian: DNS (`A api.internal → IP VPS`), Vercel project setup (root `apps/internal.jokoding.id`, env `VITE_API_URL=https://api.internal.jokoding.id`, domain `internal.jokoding.id`), run install, create admin, update flow (`git pull && sudo bash deploy/install.sh api.internal.jokoding.id`), logs (`journalctl -u jokoding-internal -f`), checking memory with Hermes running (`free -h`).

- [ ] **Step 1:** `bash -n deploy/install.sh` and `shellcheck deploy/install.sh` (if installed) → no errors.
- [ ] **Step 2:** Run the API locally with prod-like env and `curl -i -H 'Origin: https://internal.jokoding.id' http://127.0.0.1:3300/api/health` → `Access-Control-Allow-Origin: https://internal.jokoding.id`, `Access-Control-Allow-Credentials: true`.
- [ ] **Step 3:** Commit `feat(internal-api): VPS install script and deploy guide`.

---

## Phase 2 (separate plan later)

Beranda dashboard (admin revenue by `received_at`, member totals), Settings UI (members, bank slots), legacy `invoices.json` import, daily `pg_dump` timer.
