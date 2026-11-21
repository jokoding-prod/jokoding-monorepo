import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatRupiah } from '../format.js'

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const monthLabel = (ym) => {
  const [y, m] = ym.split('-')
  return `${BULAN[Number(m) - 1]} ${y.slice(2)}`
}
const short = (n) =>
  n >= 1e9 ? `${+(n / 1e9).toFixed(1)}M` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)}jt` : n >= 1e3 ? `${Math.round(n / 1e3)}rb` : `${n}`

export default function MonthlyChart({ rows }) {
  const data = (rows || []).map((r) => ({
    month: monthLabel(r.month),
    Pemasukan: Number(r.income) || 0,
    Pengeluaran: Number(r.expense) || 0
  }))
  return (
    <div className="h-64 w-full" role="img" aria-label="Grafik pemasukan dan pengeluaran per bulan">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e7e5e0" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: '#6b7280' }} />
          <YAxis tickFormatter={short} tickLine={false} axisLine={false} fontSize={11} tick={{ fill: '#6b7280' }} width={48} />
          <Tooltip formatter={(v) => formatRupiah(v)} cursor={{ fill: 'rgba(22,101,52,0.06)' }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Pemasukan" fill="#15803d" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="Pengeluaran" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
