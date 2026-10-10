export function JsonLd() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': 'https://cancheros.site/#website',
        url: 'https://cancheros.site',
        name: 'Cancheros',
        alternateName: [
          'Cancheros Pasto',
          'Cancheros.site',
          'Canchas Sintéticas Pasto',
          'Cancheros - Canchas Sintéticas en Pasto'
        ],
        description: 'La plataforma líder y más segura para consultar y reservar canchas sintéticas de fútbol en Pasto, Nariño.',
        inLanguage: 'es-CO',
        publisher: {
          '@id': 'https://cancheros.site/#organization'
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://cancheros.site/?q={search_term_string}'
          },
          'query-input': 'required name=search_term_string'
        }
      },
      {
        '@type': 'Organization',
        '@id': 'https://cancheros.site/#organization',
        name: 'Cancheros',
        alternateName: ['Cancheros Pasto', 'cancheros.site'],
        url: 'https://cancheros.site',
        logo: {
          '@type': 'ImageObject',
          url: 'https://cancheros.site/og-image.jpg',
          width: 1200,
          height: 630,
          caption: 'Cancheros - Reserva Canchas Sintéticas en Pasto'
        },
        image: 'https://cancheros.site/og-image.jpg',
        description: 'Cancheros: plataforma oficial para reservar canchas sintéticas de fútbol en Pasto, Nariño. Fútbol 5, 6, 7 y 11 con disponibilidad en tiempo real.',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Pasto',
          addressRegion: 'Nariño',
          addressCountry: 'CO'
        },
        areaServed: {
          '@type': 'City',
          name: 'Pasto'
        },
        sameAs: ['https://cancheros.site']
      },
      {
        '@type': 'SportsActivityLocation',
        '@id': 'https://cancheros.site/#service',
        name: 'Cancheros - Canchas Sintéticas en Pasto',
        url: 'https://cancheros.site',
        image: 'https://cancheros.site/og-image.jpg',
        description: 'Encuentra y reserva canchas sintéticas de fútbol 5, fútbol 6, fútbol 7 y fútbol 11 en Pasto. Horarios en tiempo real y reserva 100% segura.',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Pasto',
          addressRegion: 'Nariño',
          addressCountry: 'CO'
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: 1.2136,
          longitude: -77.2811
        },
        priceRange: '$$',
        currenciesAccepted: 'COP',
        paymentAccepted: 'Transferencia, Efectivo, Nequi, Daviplata'
      }
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
