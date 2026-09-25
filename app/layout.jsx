import localFont from 'next/font/local';
import { Bitcount_Prop_Single, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import Footer from './components/Footer.jsx';
import Nav from './components/Nav.jsx';
import EdgePicker from './edge-picker.jsx';
import { publishedPosts } from '../lib/blog.js';
import { Analytics } from '@vercel/analytics/next';
import SideAdRails from './components/side-ad-rails.jsx';

// Satoshi stands in for Aeonik (per the style reference's own substitute
// list): geometric, slightly warm, carrying body copy at weight 400.
// Self-hosted from Fontshare (SIL OFL) so nothing loads from a third party.
const satoshi = localFont({
  src: [
    { path: './fonts/Satoshi-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Satoshi-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Satoshi-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-satoshi',
  display: 'swap',
});

// Bitcount Prop Single (Google Fonts) is the heading voice: a pixel-matrix
// face that rhymes with the dot-map hero. Every h1/h2/h3 renders in it (see
// the heading rule in globals.css); body copy stays Satoshi.
const bitcount = Bitcount_Prop_Single({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-bitcount',
  display: 'swap',
});

// IBM Plex Mono stands in for Input: the utilitarian meta voice used for
// captions, labels, and fine print.
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata = {
  metadataBase: new URL('https://runs-at.dev'),
  title: {
    default: 'runs-at.dev · free subdomains',
    template: '%s · runs-at.dev',
  },
  description: 'Claim your own name.runs-at.dev in seconds. Free, forever.',
  openGraph: {
    siteName: 'runs-at.dev',
    type: 'website',
    url: 'https://runs-at.dev',
    title: 'runs-at.dev · free subdomains',
    description: 'Claim your own name.runs-at.dev in seconds. Free, forever.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'runs-at.dev · free subdomains',
    description: 'Claim your own name.runs-at.dev in seconds. Free, forever.',
  },
  // Bing Webmaster Tools ownership. Not a secret -- a verification token is
  // only meaningful when it is publicly readable in the head of the site it
  // vouches for. Google needs no equivalent here: that property is verified
  // against DNS for the whole domain, which also covers claimed subdomains.
  verification: {
    other: { 'msvalidate.01': 'DE16AF61E473E1FDA073BB3E8BBCF342' },
  },
};

// Mobile Chrome and Safari tint the address bar / browser UI from these.
// The site is dark-locked, so every entry is the same obsidian #101010.
// They are hand-written in the head (not a viewport export) to control
// ORDER: the plain media-less tag leads, which is the shape GitHub ships.
// An engine that only reads the leading theme-color, or that mishandles
// media-qualified ones and stops scanning, still lands on the right color;
// spec-conforming engines match it immediately in light AND dark mode.
// The media pair trails as belt-and-braces for engines that prefer a
// scheme-matched variant over a bare one.
export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: browser extensions (dark-mode tools, emulator
    // bridges) rewrite html/body attributes before React hydrates, which
    // raises a mismatch warning on every page load for those visitors. The
    // markup itself is deterministic; this silences only that attribute-level
    // noise on the two elements extensions touch, nothing deeper.
    <html lang="en" suppressHydrationWarning style={{ backgroundColor: '#101010' }} className={`${satoshi.variable} ${bitcount.variable} ${mono.variable}`}>
      <head>
        <meta name="theme-color" content="#101010" />
        <meta name="theme-color" content="#101010" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#101010" media="(prefers-color-scheme: dark)" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body suppressHydrationWarning>
        <Nav />
        {/* Right padding on phones keeps text clear of the edge dock. */}
        <div className="pr-10 sm:pr-0">
          {/* relative: the desktop side-rail ads position against the page
              content only, so they stop above the footer. */}
          <div className="relative">
            {children}
            <SideAdRails />
          </div>
          <Footer />
        </div>
        <EdgePicker hideBlog={publishedPosts().length === 0} />
        <Analytics />
      </body>
    </html>
  );
}
