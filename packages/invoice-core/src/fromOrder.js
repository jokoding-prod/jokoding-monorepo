const pad = (n) => String(n).padStart(2, "0");
const localIsoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function invoiceDraftFromOrder(order, bank, today) {
  return {
    date: localIsoDate(today),
    dueDate: order.deadline ?? "",
    client: order.client_name ?? "",
    clientPhone: order.client_phone ?? "",
    items: [{ name: order.project_name ?? "", quantity: 1, price: Number(order.price) || 0 }],
    discountType: "percent",
    discountValue: 0,
    depositPercent: 50,
    currency: "IDR",
    bankName: bank?.bank_name ?? "",
    accountNumber: bank?.account_number ?? "",
    accountHolder: bank?.account_holder ?? "",
    notes: order.scope_of_work ?? "",
    paid: false,
  };
}
