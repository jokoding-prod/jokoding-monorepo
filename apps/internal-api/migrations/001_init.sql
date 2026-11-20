create table users (
  id serial primary key,
  name text not null,
  username text unique not null,
  password_hash text not null,
  role text not null check (role in ('admin','member')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table sessions (
  id text primary key,
  user_id int not null references users(id) on delete cascade,
  expires_at timestamptz not null
);

create table bank_accounts (
  id serial primary key,
  slot int unique not null check (slot in (1,2)),
  bank_name text not null,
  account_number text not null,
  account_holder text not null,
  is_default boolean not null default false
);

create table orders (
  id serial primary key,
  received_at date not null,
  project_name text not null,
  client_name text not null,
  client_phone text not null default '',
  deadline date,
  price bigint not null check (price >= 0),
  scope_of_work text not null default '',
  assignee_id int references users(id),
  created_by int not null references users(id),
  work_status text not null default 'baru' check (work_status in ('baru','dikerjakan','selesai')),
  payment_status text not null default 'belum' check (payment_status in ('belum','dp','lunas')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoices (
  id serial primary key,
  order_id int unique references orders(id) on delete restrict,
  number text unique not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
