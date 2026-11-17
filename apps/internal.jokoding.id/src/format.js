const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

export function formatRupiah(n) {
  return `Rp${new Intl.NumberFormat('id-ID').format(n)}`
}

export function formatTanggal(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return '-'
  return `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}`
}

export const WORK_STATUS = { baru: 'Baru', dikerjakan: 'Dikerjakan', selesai: 'Selesai' }
export const PAYMENT_STATUS = { belum: 'Belum bayar', dp: 'DP', lunas: 'Lunas' }

export function todayLocal() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
