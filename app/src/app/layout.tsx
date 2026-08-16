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
  description: 'An idle creature-collecting prototype on Starknet with deterministic hatch previews, ownable creatures, expeditions, and STRK20 private STRK controls.',
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
