import { ImageResponse } from 'next/og';
import { BannerCard, BANNER_SIZE } from '../../lib/banner-card.jsx';

/**
 * Dark banner, used as the README's default image. GitHub is read on a dark theme by most
 * people, and the light social card glares against it.
 */
export function GET() {
  return new ImageResponse(<BannerCard theme="dark" />, { ...BANNER_SIZE });
}
