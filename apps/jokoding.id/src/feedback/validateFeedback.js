// Dipakai di form (client) dan di api/feedback.js (server), jadi aturan cukup ditulis sekali.
export const LAYANAN = ['Web Development', 'Mobile Apps', 'Internet of Things', 'AI & Deep Learning', 'Backend & API', 'Network & Server', 'Lainnya'];
export const SUMBER = ['Google', 'TikTok', 'Instagram', 'Facebook', 'AI (ChatGPT, Claude, dll)', 'Teman / kenalan', 'Lainnya'];

const MAX_TEXT = 2000;
const MAX_NAMA = 100;

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// Mengembalikan { ok: true, value } berisi baris siap insert, atau { ok: false, error }.
export const validateFeedback = (input) => {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Data tidak valid.' };

  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: 'Pilih rating 1 sampai 5.' };
  }

  const layanan = text(input.layanan, 50);
  if (layanan && !LAYANAN.includes(layanan)) return { ok: false, error: 'Layanan tidak dikenal.' };

  const sumber = text(input.sumber, 50);
  if (sumber && !SUMBER.includes(sumber)) return { ok: false, error: 'Sumber tidak dikenal.' };

  const bagus = text(input.bagus, MAX_TEXT);
  const kurang = text(input.kurang, MAX_TEXT);
  if (!bagus && !kurang) return { ok: false, error: 'Tulis minimal satu: yang sudah bagus atau yang perlu diperbaiki.' };

  return {
    ok: true,
    value: {
      rating,
      layanan: layanan || null,
      sumber: sumber || null,
      bagus: bagus || null,
      kurang: kurang || null,
      nama: text(input.nama, MAX_NAMA) || null,
      izin_testimoni: input.izin_testimoni === true,
    },
  };
};
