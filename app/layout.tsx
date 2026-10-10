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
    default: 'Cancheros | Canchas Sintéticas en Pasto - Reserva tu Cancha Online',
    template: '%s | Cancheros Pasto',
  },
  description:
    'Cancheros es la plataforma  para consultar y reservar canchas sintéticas de fútbol. Encuentra complejos deportivos, verifica horarios en tiempo real y reserva de forma inmediata.',
  applicationName: 'Cancheros',
  authors: [{ name: 'Cancheros' }],
  creator: 'Cancheros',
  publisher: 'Cancheros',
  keywords: [
    'Cancheros',
    'Cancheros Pasto',
    'canchas sinteticas en pasto',
    'canchas sinteticas pasto',
    'reserva canchas pasto',
    'alquiler canchas sinteticas pasto',
    'canchas de futbol pasto',
    'futbol 5 pasto',
    'futbol 6 pasto',
    'futbol 7 pasto',
    'futbol 11 pasto',
    'cancheros nariño',
    'complejos deportivos pasto',
    'torneos futbol pasto',
    'canchas pasto nariño',
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
    title: 'Cancheros | Canchas Sintéticas en Pasto - Reserva tu Cancha Online',
    description:
      'La plataforma líder y segura de canchas sintéticas. Encuentra tu cancha, verifica horarios en tiempo real y reserva de forma inmediata.',
    images: [
      {
        url: '/cancheros.png',
        width: 1254,
        height: 1254,
        alt: 'Cancheros - Plataforma Oficial de Reservas de Canchas Sintéticas',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cancheros | Reserva Canchas Sintéticas en Pasto',
    description:
      'Reserva canchas sintéticas en tiempo real. Rápido, seguro y confiable.',
    images: ['/cancheros.png'],
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
        <link rel="icon" href="/cancheros.png" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
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
