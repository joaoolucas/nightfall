import type { Metadata } from 'next'
import { Inter, Silkscreen, Space_Mono } from 'next/font/google'
import './globals.css'

// Clean neutral grotesque for body copy; a mono only for hex addresses / hashes;
// a chunky pixel display face for headings, titles and card names.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono-ui',
  display: 'swap',
})
const silkscreen = Silkscreen({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Portage.fun — Creature collecting on Starknet',
  // Describes what the deployed page actually does. The STRK20 privacy work and
  // the Cairo contracts are real but are not reachable from this client yet, so
  // they do not belong in the description a search result shows.
  description: 'A cozy idle creature-collecting RPG: hunt, haul and trade in a hand-drawn pixel world that keeps playing while you are away.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceMono.variable} ${silkscreen.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  )
}
