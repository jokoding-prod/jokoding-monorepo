import { useLayoutEffect, useRef, useState } from 'react'
import { calcTotals } from '@jokoding/invoice-core'
import './invoice-sheet.css'

const SHEET_WIDTH = 794

export function money(amount, currency = 'IDR') {
  const formatter = new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'id-ID', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  })
  return formatter.format(Number(amount) || 0).replace(/\s/g, '')
}

function parseDate(value) {
  const date = value ? new Date(`${value}T12:00:00`) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

const longDate = (date) =>
  date ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date) : '-'
const monthYear = (date) =>
  date ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(date) : '-'
const text = (value, fallback = '-') => String(value ?? '').trim() || fallback

function FallbackImage({ src, alt, fallback = null }) {
  const [failed, setFailed] = useState(false)
  if (failed) return fallback
  return <img src={src} alt={alt} onError={() => setFailed(true)} />
}

// Scale the fixed-width A4 sheet to the available width on screen; print CSS removes the transform.
function useFitSheet() {
  const frame = useRef(null)
  const sheet = useRef(null)
  useLayoutEffect(() => {
    const f = frame.current
    const s = sheet.current
    const parent = f?.parentElement
    if (!f || !s || !parent) return
    const fit = () => {
      const available = parent.clientWidth
      const scale = available > 0 ? Math.min(1, available / SHEET_WIDTH) : 1
      s.style.transform = scale < 1 ? `scale(${scale})` : ''
      f.style.height = scale < 1 ? `${s.offsetHeight * scale}px` : ''
      f.style.width = scale < 1 ? `${SHEET_WIDTH * scale}px` : ''
    }
    const reset = () => {
      s.style.transform = ''
      f.style.height = ''
      f.style.width = ''
    }
    fit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    ro?.observe(parent)
    ro?.observe(s)
    window.addEventListener('beforeprint', reset)
    window.addEventListener('afterprint', fit)
    document.fonts?.ready?.then(fit)
    return () => {
      ro?.disconnect()
      window.removeEventListener('beforeprint', reset)
      window.removeEventListener('afterprint', fit)
    }
  }, [])
  return { frame, sheet }
}

export default function InvoiceSheet({ number, data }) {
  const { frame, sheet } = useFitSheet()
  const currency = data.currency || 'IDR'
  const fmt = (amount) => money(amount, currency)
  const items = data.items || []
  const totals = calcTotals({ ...data, items })
  const hasDiscount = totals.discount > 0
  const percentLabel =
    data.discountType === 'percent' ? ` (${Math.min(100, Number(data.discountValue) || 0)}%)` : ''
  const dueDate = parseDate(data.dueDate)
  const clientPhone = String(data.clientPhone ?? '').trim()
  const notes = String(data.notes ?? '').trim()

  return (
    <div className="sheet-frame" ref={frame}>
      <article className="invoice-sheet" ref={sheet}>
        <header className="invoice-header">
          <h2>INVOICE</h2>
          <div className="brand-lockup">
            <FallbackImage
              src="/logo.png"
              alt="Jokoding"
              fallback={
                <div className="brand-wordmark">
                  <span>joko</span>ding
                </div>
              }
            />
          </div>
        </header>

        <section className="invoice-meta">
          <div className="bill-to">
            <strong>Bill to</strong>
            <span>{text(data.client, 'Nama klien')}</span>
            {clientPhone && <span>{clientPhone}</span>}
          </div>
          <dl>
            <div>
              <dt>Date</dt>
              <dd>{longDate(parseDate(data.date))}</dd>
            </div>
            <div>
              <dt>Number</dt>
              <dd>{text(number)}</dd>
            </div>
          </dl>
        </section>

        <p className="issued-by">
          <strong>Issued by</strong> Jokoding
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Item</th>
                <th>Quantity</th>
                <th>Individual Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const quantity = Number(item.quantity) || 0
                const price = Number(item.price) || 0
                return (
                  <tr key={index}>
                    <td>{`${index + 1}.`}</td>
                    <td>{String(item.name ?? '').trim() || '-'}</td>
                    <td>{quantity || '-'}</td>
                    <td>{fmt(price)}</td>
                    <td>{fmt(quantity * price)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              {hasDiscount && (
                <tr className="minor">
                  <th colSpan={4}>Subtotal</th>
                  <td>{fmt(totals.subtotal)}</td>
                </tr>
              )}
              {hasDiscount && (
                <tr className="minor">
                  <th colSpan={4}>{`Discount${percentLabel}`}</th>
                  <td>{`-${fmt(totals.discount)}`}</td>
                </tr>
              )}
              <tr>
                <th colSpan={4}>Total</th>
                <td>{fmt(totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <section className="payment-terms">
          <h3>Payment Term</h3>
          <ol>
            <li>
              A down payment of <strong>{`${totals.depositPercent}%`}</strong> of the total project cost, which is{' '}
              <strong>{fmt(totals.deposit)}</strong>, is due before{' '}
              <strong>{monthYear(dueDate).toUpperCase()}</strong>. This payment will be considered as confirmation of
              the project and will initiate the work.
            </li>
            <li>
              The remaining <strong>{`${100 - totals.depositPercent}%`}</strong> of the total project cost, which is{' '}
              <strong>{fmt(totals.remaining)}</strong>, must be paid before the end of the project, which is on{' '}
              <strong>{longDate(dueDate).toUpperCase()}</strong>. Failure to make the final payment by the deadline
              may result in additional fees or delays in project delivery.
            </li>
          </ol>
        </section>

        <section className="bank-details">
          <p>Please make all payments to the following account:</p>
          <dl>
            <div>
              <dt>Bank</dt>
              <dd>{text(data.bankName, '[Nama bank]')}</dd>
            </div>
            <div>
              <dt>Account No.</dt>
              <dd>{text(data.accountNumber, '[Nomor rekening]')}</dd>
            </div>
            <div>
              <dt>Account Holder</dt>
              <dd>{text(data.accountHolder, '[Nama pemegang rekening]')}</dd>
            </div>
          </dl>
        </section>

        {notes && (
          <section className="notes-block">
            <h3>Notes</h3>
            <p>{notes}</p>
          </section>
        )}

        <p className="thank-you">Thank you for trusting us to develop your technology-related project.</p>
        <section className="signature-block">
          <strong>Best regards,</strong>
          <div className="signature-box">
            <FallbackImage src="/signature.png" alt="Tanda tangan Irfan Qobus" />
          </div>
          <strong>Irfan Qobus</strong>
          <span>Founder &amp; CEO of Jokoding</span>
          {data.paid && <div className="paid-stamp">PAID</div>}
        </section>
      </article>
    </div>
  )
}
