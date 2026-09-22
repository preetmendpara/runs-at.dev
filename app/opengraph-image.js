import { ImageResponse } from 'next/og';
import { BannerCard, BANNER_SIZE } from '../lib/banner-card.jsx';

export const size = BANNER_SIZE;
export const contentType = 'image/png';

/** Social preview. Light, matching the site's own identity. */
export default function Image() {
  return new ImageResponse(<BannerCard theme="light" />, { ...size });
}
