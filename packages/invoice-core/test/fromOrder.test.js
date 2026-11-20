import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceDraftFromOrder } from "../src/fromOrder.js";

const order = { project_name: "UTS pemrograman python", client_name: "Deka Restu", client_phone: "085150651021", price: 350000, deadline: "2026-11-30", scope_of_work: "- Menyiapkan dataset\n- Melatih jaringan" };

test("invoiceDraftFromOrder maps order fields", () => {
  const bank = { bank_name: "BSI", account_number: "7253435342", account_holder: "IRFAN QOBUS SALIM" };
  const d = invoiceDraftFromOrder(order, bank, new Date(2026, 10, 16));
  assert.equal(d.date, "2026-11-16");
  assert.equal(d.dueDate, "2026-11-30");
  assert.deepEqual(d.items, [{ name: "UTS pemrograman python", quantity: 1, price: 350000 }]);
  assert.equal(d.client, "Deka Restu");
  assert.equal(d.clientPhone, "085150651021");
  assert.equal(d.notes, order.scope_of_work);
  assert.equal(d.bankName, "BSI");
  assert.equal(d.accountNumber, "7253435342");
  assert.equal(d.accountHolder, "IRFAN QOBUS SALIM");
  assert.equal(d.discountType, "percent");
  assert.equal(d.discountValue, 0);
  assert.equal(d.depositPercent, 50);
  assert.equal(d.currency, "IDR");
  assert.equal(d.paid, false);
});

test("invoiceDraftFromOrder without bank leaves bank fields empty", () => {
  const d = invoiceDraftFromOrder(order, null, new Date(2026, 10, 16));
  assert.equal(d.bankName, "");
  assert.equal(d.accountNumber, "");
  assert.equal(d.accountHolder, "");
});

test("invoiceDraftFromOrder normalises a Date deadline to local YYYY-MM-DD", () => {
  const d = invoiceDraftFromOrder({ ...order, deadline: new Date(2026, 10, 30) }, null, new Date(2026, 10, 16));
  assert.equal(d.dueDate, "2026-11-30");
});

test("invoiceDraftFromOrder turns null deadline, scope and phone into empty strings", () => {
  const d = invoiceDraftFromOrder({ ...order, deadline: null, scope_of_work: null, client_phone: null }, null, new Date(2026, 10, 16));
  assert.equal(d.dueDate, "");
  assert.equal(d.notes, "");
  assert.equal(d.clientPhone, "");
});
