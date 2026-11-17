import { SITE_URL } from '../blog/seo';

export const FEEDBACK_TITLE = 'Feedback | Jokoding';

// noindex: halaman ini untuk client yang dikirimi link, bukan untuk hasil pencarian.
export const feedbackMeta = () => ({
  title: FEEDBACK_TITLE,
  description: 'Beri feedback tentang pengalamanmu memakai jasa Jokoding.',
  canonical: `${SITE_URL}/feedback`,
  image: `${SITE_URL}/og-image.jpg`,
  type: 'website',
  robots: 'noindex',
});
