import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, Pencil } from 'lucide-react'
import { invoicePdfTitle } from '@jokoding/invoice-core'
import { api } from '../api.js'
import InvoiceSheet from './InvoiceSheet.jsx'

export default function InvoiceView() {
  const { id } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setInvoice(null)
    setError('')
    api(`/api/invoices/${id}`).then(setInvoice).catch((err) => setError(err.message))
  }, [id])

  if (error)
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>
    )
  if (!invoice) return <p className="text-gray-600">Memuat...</p>

  const printPdf = () => {
    const previous = document.title
    document.title = invoicePdfTitle(invoice.data.client, invoice.data.date)
    window.addEventListener('afterprint', () => (document.title = previous), { once: true })
    window.print()
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-xl font-bold text-gray-900">{invoice.number}</h2>
        {invoice.orderId && (
          <Link to={`/order/${invoice.orderId}`} className="text-sm text-green-700 hover:underline">
            Lihat order
          </Link>
        )}
        <Link
          to={`/invoice/${id}/edit`}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Pencil size={16} aria-hidden="true" />
          Edit
        </Link>
        <button
          type="button"
          onClick={printPdf}
          className="flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800"
        >
          <Download size={16} aria-hidden="true" />
          Download PDF
        </button>
      </div>
      <InvoiceSheet number={invoice.number} data={invoice.data} />
    </div>
  )
}
