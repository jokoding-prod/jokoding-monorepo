import { describe, expect, it } from 'vitest';
import { validateFeedback } from './validateFeedback';

describe('validateFeedback', () => {
  it('accepts a minimal feedback and normalizes empty fields to null', () => {
    expect(validateFeedback({ rating: 5, bagus: '  cepat  ' })).toEqual({
      ok: true,
      value: { rating: 5, layanan: null, sumber: null, bagus: 'cepat', kurang: null, nama: null, izin_testimoni: false },
    });
  });

  it('rejects a rating outside 1 to 5', () => {
    expect(validateFeedback({ rating: 6, bagus: 'x' }).ok).toBe(false);
    expect(validateFeedback({ rating: 0, bagus: 'x' }).ok).toBe(false);
    expect(validateFeedback({ bagus: 'x' }).ok).toBe(false);
  });

  it('requires at least one written answer', () => {
    expect(validateFeedback({ rating: 4, bagus: '   ', kurang: '' }).ok).toBe(false);
  });

  it('rejects an unknown service', () => {
    expect(validateFeedback({ rating: 4, layanan: 'Hacking', kurang: 'x' }).ok).toBe(false);
  });

  it('accepts a known source and rejects an unknown one', () => {
    expect(validateFeedback({ rating: 5, sumber: 'TikTok', bagus: 'x' }).value.sumber).toBe('TikTok');
    expect(validateFeedback({ rating: 5, sumber: 'Koran', bagus: 'x' }).ok).toBe(false);
  });

  it('truncates long text and only treats literal true as consent', () => {
    const { value } = validateFeedback({ rating: 3, kurang: 'a'.repeat(5000), izin_testimoni: 'true' });
    expect(value.kurang).toHaveLength(2000);
    expect(value.izin_testimoni).toBe(false);
  });
});
