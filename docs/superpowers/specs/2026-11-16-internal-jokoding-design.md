# internal.jokoding.id — Design

Date: 2026-11-16
Status: approved 2026-11-17

## Intent

Jokoding takes client projects (joki: tugas, skripsi, IoT, ML, websites). Today orders live in chat and memory, and invoices are made in a separate vanilla app (`../invoice`) that stores history in a JSON file on the VPS. The goal is one internal web app where the admin records every incoming order, assigns it to a team member, creates its invoice in one click, and sees revenue; team members see only their own projects.

## Goals

- **Order tab**: table of client orders the admin can add to and edit.
- **Invoice tab**: invoices generated from orders, same PDF look as today's invoice app.
- **Beranda (home)**: dashboard whose numbers depend on the logged-in user.
- **Roles**: one admin, several members.
- **Settings**: two fixed bank-account templates, team member management.
- Database on the owner's VPS; frontend deployed on Vercel.

## Non-goals (for now)

- Client-facing access (clients never log in).
- Multiple invoices per order (DP and pelunasan on separate invoices, revision invoices).
- Payment gateway, automatic WhatsApp/email sending.
- Fee/bagi-hasil per engineer.
- Multiple admins.

## Anti-goals

- Database port exposed to the internet.
- Members seeing other members' orders or the overall revenue.
- Re-typing order data into the invoice form.

## Constraints

- Monorepo: pnpm + Turbo; existing apps are React 18 + Vite + Tailwind 4 (`apps/jokoding.id`). The new app follows the same stack.
- VPS: 2 GB RAM, 2 cores, Ubuntu/Debian (assumed), currently running only Hermes. Must stay light.
- Data includes client names, phone numbers, prices and bank details: must be behind login and HTTPS.
- Invoice PDF must match the current design (see `../invoice/index.html`, `style.css`; sample: INV-004/JKD/XI/2026).

## Approaches considered

1. **API + Postgres on VPS, Vercel serves frontend only — CHOSEN.** Postgres listens on localhost only; a Node API behind nginx + HTTPS at `api.internal.jokoding.id`. Safest, lightest, same pattern (nginx + systemd + Node) as the current invoice deployment. Cost: two deploy targets.
2. Vercel Functions connect directly to Postgres on VPS. One deploy target, but Postgres must be public on 5432 and Vercel IPs cannot be allowlisted; needs SSL + PgBouncer. Rejected: biggest risk to client and bank data.
3. Self-hosted Supabase on VPS. Auth and RLS out of the box, but ~10 containers and ~4 GB RAM. Rejected: too heavy for the VPS.

## Architecture

```
Browser ── https://internal.jokoding.id  (Vercel, static React SPA, apps/internal.jokoding.id)
   │
   └─ fetch, credentials: include
      https://api.internal.jokoding.id   (VPS)
         nginx (TLS, Let's Encrypt) → Node API on 127.0.0.1:3300 (systemd)
                                         → PostgreSQL 16 on 127.0.0.1:5432
```

- **Frontend**: `apps/internal.jokoding.id`, React + Vite + Tailwind + react-router, SPA (no prerender, `noindex`). Own Vercel project, domain `internal.jokoding.id`.
- **API**: `apps/internal-api` in the monorepo (so code and tests live together), deployed to the VPS by git pull + install script, like `../invoice/deploy/install.sh`. Builder's call on framework; suggested Hono or Fastify + `pg` + a migration tool (e.g. plain SQL files run in order).
- **Auth**: email/username + password (argon2id or bcrypt), server-side sessions in Postgres, httpOnly Secure cookie scoped to `.internal.jokoding.id`, `SameSite=Lax` (both hosts are same-site). CORS allows only `https://internal.jokoding.id` (plus localhost in dev) with credentials. Login rate-limited. Admin creates member accounts; no self sign-up. First admin is created by a CLI command on the VPS.
- **Authorization** is enforced in the API on every query, never only in the UI.

## Data model (sketch)

- `users`: id, name, username/email, password_hash, role (`admin` | `member`), active, created_at.
- `orders`: id, received_at (tanggal masuk), project_name, client_name, client_phone, deadline, price (integer rupiah), scope_of_work (text, bullet lines), created_by → users, assignee_id → users (the admin is a valid assignee, which is how the "saya sendiri" checkbox is stored), work_status (`baru` | `dikerjakan` | `selesai`), payment_status (`belum` | `dp` | `lunas`), created_at, updated_at.
- `invoices`: id, order_id (UNIQUE, nullable for imported legacy invoices), number (UNIQUE, format `INV-004/JKD/XI/2026`), date, due_date, items (jsonb), discount, deposit_percent, currency, bank_account_id, bank snapshot (name/number/holder copied at creation so old invoices never change), notes, paid flag, created_at.
- `bank_accounts`: id, bank_name, account_number, account_holder, is_default. Exactly two expected, edited in Settings.
- `sessions`: id, user_id, expires_at.

## Behaviour

### Order tab
- Columns, left to right: Tanggal masuk, Nama project, Nama klien, Deadline, Harga. Plus a small status badge (work + payment).
- Admin: "Tambah order" form with the fields above; "Dikerjakan oleh" dropdown of members plus a checkbox "Saya sendiri (admin)".
- Click a row: detail view with phone, scope of work, assignee, statuses, and invoice section ("Buat invoice" if none, else "Lihat / Download PDF").
- Member: can add orders (members also handle sales) and choose the assignee. A member sees orders assigned to them or created by them (`orders.created_by` → users), including price. A member can edit an order they created until it has an invoice; cannot delete. Invoices remain admin-only.

### Invoice tab
- List of all invoices (admin only).
- "Buat invoice" from an order pre-fills: Bill to = client name + phone; one item = project name, qty 1, price; due date = deadline; Notes = scope of work; bank = default template (dropdown to switch). Admin checks DP % and number (auto-numbered), can edit, saves.
- One invoice per order (DB unique constraint).
- PDF: port the current printable layout to React; download via browser print (as today).
- Legacy: one-time import of `invoices.json` from the old VPS as invoices without an order.

### Beranda
- Admin: total revenue = sum of order prices for all orders regardless of payment status, "this month" by `received_at`, plus all-time; legacy invoices without an order are not counted, active orders, orders without an invoice, nearest deadlines.
- Member: their own active projects, nearest deadlines, and the total price of their own orders.

### Settings (admin only)
- Two bank-account templates, choose default.
- Team members: add, deactivate, reset password.

## VPS setup (deliverable: `apps/internal-api/deploy/` + README)

1. DNS: A record `api.internal` → VPS IP. Vercel: add `internal.jokoding.id` to the new project.
2. Swap 1 GB (safety for 2 GB RAM).
3. PostgreSQL 16 from apt; `listen_addresses = 'localhost'`; small-memory tuning (`shared_buffers=256MB`, `max_connections=30`, `work_mem=4MB`); dedicated DB role + database with a strong password.
4. Firewall (ufw): allow 22, 80, 443 only. 5432 and the API port stay closed.
5. Node 20+ system-wide; API as systemd service on 127.0.0.1:3300, env file `/etc/jokoding-internal/env` (DATABASE_URL, SESSION_SECRET, CORS_ORIGIN), mode 600.
6. nginx site for `api.internal.jokoding.id` → proxy to 3300; certbot HTTPS.
7. Migrations run by the install script; `create-admin` CLI for first login.
8. Daily `pg_dump` backup via systemd timer, keep 14 days; recommend copying off-VPS.
9. Must coexist with Hermes and the old invoice app (same VPS, served via ngrok on nginx 127.0.0.1:8080, API 3100). Do not reuse ports 3100/8080. Cutover: import `/var/lib/jokoding-invoice/invoices.json`, then the owner stops `jokoding-invoice` and ngrok; no invoices are made in the old app after import.

## Calls made by Claude (owner to confirm)

- Invoice is frozen after creation: editing the order later does not change the invoice. Admin can edit the invoice by hand.
- An order with an invoice cannot be deleted; only orders without an invoice can be deleted. Only the admin edits or deletes.
- Order `payment_status` is set by hand by the admin; the invoice's paid flag is cosmetic (PAID stamp only).
- Deactivating a member deletes their sessions at once; their orders keep the assignee, shown as "nonaktif", and the admin can reassign.
- The repo's `supabase/feedback.sql` (jokoding.id feedback form) is separate and stays on Supabase.

## Phasing

1. VPS setup, auth + roles, Order, Invoice.
2. Beranda, Settings (members, bank templates; until then the two bank templates are seeded by migration), legacy import, daily backup.

## Left to the builder

- API framework, migration tool, password hash library, UI component details.
- Invoice auto-number logic (reuse `../invoice/js` logic and tests where possible).
- Exact dashboard layout.
