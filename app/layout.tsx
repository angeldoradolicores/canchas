import { Analytics } from '@vercel/analytics/next'
import { Inter } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { ThemeProvider } from '@/lib/theme-context'
import { JsonLd } from '@/components/seo/JsonLd'
// import { AppSplashScreen } from '@/components/layout/AppSplashScreen'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://cancheros.site'),
  title: {
    default: 'Cancheros – Reserva Canchas Sintéticas en Pasto, Nariño',
    template: '%s | Cancheros',
  },
  description:
    'Cancheros: la plataforma oficial para reservar canchas sintéticas de fútbol en Pasto, Nariño. Consulta disponibilidad en tiempo real, compara precios y reserva en segundos. Fútbol 5, 6, 7 y 11.',
  applicationName: 'Cancheros',
  authors: [{ name: 'Cancheros' }],
  creator: 'Cancheros',
  publisher: 'Cancheros',
  keywords: [
    'Cancheros',
    'cancheros.site',
    'Cancheros Pasto',
    'canchas sinteticas pasto',
    'reservar cancha pasto',
    'canchas de futbol pasto',
    'futbol pasto nariño',
    'canchas sinteticas en pasto nariño',
    'alquiler canchas sinteticas pasto',
    'futbol 5 pasto',
    'futbol 6 pasto',
    'futbol 7 pasto',
    'futbol 11 pasto',
    'complejos deportivos pasto',
    'torneos futbol pasto',
    'reserva cancha online colombia',
  ],
  alternates: {
    canonical: 'https://cancheros.site',
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      {
        url: '/favicon.ico',
        sizes: '48x48',
        type: 'image/x-icon',
      },
      {
        url: '/cancheros.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        url: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icon-96x96.png',
        sizes: '96x96',
        type: 'image/png',
      },
      {
        url: '/icon-48x48.png',
        sizes: '48x48',
        type: 'image/png',
      },
    ],
    shortcut: '/cancheros.png',
    apple: [
      {
        url: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
  openGraph: {
    type: 'website',
    locale: 'es_CO',
    url: 'https://cancheros.site',
    siteName: 'Cancheros',
    title: 'Cancheros – Reserva Canchas Sintéticas en Pasto, Nariño',
    description:
      'Cancheros: reserva canchas sintéticas en Pasto con disponibilidad en tiempo real. Fútbol 5, 6, 7 y 11. Rápido, seguro y confiable.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Cancheros - Reserva Canchas Sintéticas en Pasto, Nariño',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cancheros – Reserva Canchas Sintéticas en Pasto',
    description:
      'Cancheros: reserva canchas sintéticas en tiempo real. Rápido, seguro y confiable.',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  category: 'sports',
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#007A3D' },
    { media: '(prefers-color-scheme: dark)', color: '#054D27' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="bg-background" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/cancheros.png" type="image/png" sizes="512x512" />
        <link rel="icon" href="/icon-192x192.png" type="image/png" sizes="192x192" />
        <link rel="icon" href="/icon-48x48.png" type="image/png" sizes="48x48" />
        <link rel="apple-touch-icon" href="/apple-icon.png" sizes="180x180" />
        <link rel="image_src" href="https://cancheros.site/og-image.jpg" />
        <meta name="thumbnail" content="https://cancheros.site/og-image.jpg" />
        <meta property="og:image" content="https://cancheros.site/og-image.jpg" />
        <meta property="og:image:secure_url" content="https://cancheros.site/og-image.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/jpeg" />
        <meta name="twitter:image" content="https://cancheros.site/og-image.jpg" />
        <link rel="preconnect" href="https://maps.google.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://maps.google.com" />
      </head>
      <body className={`${inter.variable} antialiased`}>
        <JsonLd />
        {/* <AppSplashScreen /> */}
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
