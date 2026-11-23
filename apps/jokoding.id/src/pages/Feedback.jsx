import { useState } from 'react';
import { Star, Send, CheckCircle2 } from 'lucide-react';
import { LAYANAN, validateFeedback } from '../feedback/validateFeedback';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { FEEDBACK_TITLE } from '../feedback/feedbackMeta';

const EMPTY = { rating: 0, layanan: '', bagus: '', kurang: '', nama: '', izin_testimoni: false, website: '' };
const RATING_LABEL = ['', 'Kecewa', 'Kurang', 'Cukup', 'Puas', 'Sangat puas'];

const inputClass =
  'w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';

const Feedback = () => {
  useDocumentTitle(FEEDBACK_TITLE);
  const [data, setData] = useState(EMPTY);
  const [status, setStatus] = useState('idle'); // idle | sending | done
  const [error, setError] = useState('');

  const set = (field) => (e) => setData((d) => ({ ...d, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const check = validateFeedback(data);
    if (!check.ok) return setError(check.error);

    setError('');
    setStatus('sending');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Gagal mengirim feedback.');
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 pt-28 pb-20 px-4">
      <div className="max-w-xl mx-auto">
        {status === 'done' ? (
          <div className="rounded-2xl bg-white p-8 shadow-sm text-center">
            <CheckCircle2 className="mx-auto text-emerald-600" size={48} />
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Terima kasih!</h1>
            <p className="mt-2 text-gray-600">Feedback kamu sudah kami terima dan akan kami pakai untuk memperbaiki layanan Jokoding.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="rounded-2xl bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Feedback untuk Jokoding</h1>
              <p className="mt-2 text-gray-600">Ceritakan pengalamanmu pakai jasa kami, jujur saja. Butuh sekitar 1 menit.</p>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-gray-900 mb-2">
                Seberapa puas kamu? <span className="text-emerald-600">*</span>
              </legend>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="cursor-pointer p-1">
                    <input
                      type="radio"
                      name="rating"
                      value={n}
                      checked={data.rating === n}
                      onChange={() => setData((d) => ({ ...d, rating: n }))}
                      aria-label={`${n} bintang, ${RATING_LABEL[n]}`}
                      className="peer sr-only"
                    />
                    <Star
                      size={36}
                      className={`transition-colors rounded peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 ${
                        n <= data.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-300'
                      }`}
                    />
                  </label>
                ))}
                <span className="ml-2 text-sm text-gray-600">{RATING_LABEL[data.rating]}</span>
              </div>
            </fieldset>

            <label className="block">
              <span className="block text-sm font-semibold text-gray-900 mb-2">Layanan yang kamu pakai</span>
              <select value={data.layanan} onChange={set('layanan')} className={inputClass}>
                <option value="">Pilih layanan</option>
                {LAYANAN.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-sm font-semibold text-gray-900 mb-2">Apa yang sudah bagus?</span>
              <textarea rows={3} value={data.bagus} onChange={set('bagus')} placeholder="Contoh: pengerjaan cepat, penjelasannya mudah dipahami" className={`${inputClass} resize-none`} />
            </label>

            <label className="block">
              <span className="block text-sm font-semibold text-gray-900 mb-2">Apa yang perlu kami perbaiki?</span>
              <textarea rows={3} value={data.kurang} onChange={set('kurang')} placeholder="Contoh: respons chat kadang lama" className={`${inputClass} resize-none`} />
            </label>

            <label className="block">
              <span className="block text-sm font-semibold text-gray-900 mb-2">Nama (boleh dikosongkan)</span>
              <input type="text" autoComplete="given-name" value={data.nama} onChange={set('nama')} placeholder="Nama panggilanmu" className={inputClass} />
            </label>

            {/* Honeypot: tersembunyi dari manusia, biasanya diisi bot. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" value={data.website} onChange={set('website')} className="hidden" aria-hidden="true" />

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={data.izin_testimoni}
                onChange={(e) => setData((d) => ({ ...d, izin_testimoni: e.target.checked }))}
                className="mt-1 size-4 accent-emerald-600"
              />
              <span className="text-sm text-gray-700">Boleh ditampilkan sebagai testimoni di website Jokoding.</span>
            </label>

            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-full bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <Send size={18} /> {status === 'sending' ? 'Mengirim...' : 'Kirim Feedback'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
};

export default Feedback;
