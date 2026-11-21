create table transactions (
  id serial primary key,
  date date not null,
  type text not null check (type in ('income','expense')),
  category text not null check (
    (type = 'expense' and category in ('alat','domain_hosting','ads','fee_tim','lainnya'))
    or (type = 'income' and category = 'lainnya')
  ),
  amount bigint not null check (amount > 0),
  note text not null default '',
  order_id int references orders(id) on delete set null,
  created_by int not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transactions_date_idx on transactions(date);
create index transactions_order_id_idx on transactions(order_id);
create index orders_received_at_idx on orders(received_at);
