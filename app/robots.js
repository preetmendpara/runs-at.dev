export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://runs-on.dev/sitemap.xml',
  };
}
