export function invoicePdfTitle(client, invoiceDate) {
  const date = invoiceDate ? new Date(`${invoiceDate}T12:00:00`) : new Date();
  const when = Number.isNaN(date.getTime()) ? new Date() : date;
  const monthYear = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(when);
  const safeClient = String(client ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ") || "Tanpa Nama Klien";
  return `Invoice - ${safeClient} - ${monthYear}`;
}
