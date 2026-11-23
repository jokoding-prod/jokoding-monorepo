const TONE = {
  baru: 'bg-gray-100 text-gray-700',
  dikerjakan: 'bg-blue-100 text-blue-800',
  selesai: 'bg-green-100 text-green-800',
  belum: 'bg-red-100 text-red-800',
  dp: 'bg-amber-100 text-amber-800',
  lunas: 'bg-green-100 text-green-800'
}

export default function StatusBadge({ value, label }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONE[value] || TONE.baru}`}>
      {label}
    </span>
  )
}
