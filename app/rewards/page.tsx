'use client';
import { useEffect, useState } from 'react';
import { dayNames } from '@/components/booking/ComplexPromotions';

export default function RewardsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState('Cargando tus regalos…');
  useEffect(() => {
    fetch('/api/promotions')
      .then(r => r.json())
      .then(j => {
        setItems(j.rewards || []);
        setMessage(j.error || 'Aún no tienes horas gratis. Inicia sesión y reserva con tu celular de siempre para acumular en los complejos con promoción.');
      })
      .catch(() => setMessage('No se pudo conectar'));
  }, []);
  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-8 space-y-5">
      <h1 className="text-2xl font-black">🎁 Mis horas gratis</h1>
      {!items.length && <p className="text-sm text-muted-foreground">{message}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map(r => (
          <article key={r.id} className="border rounded-3xl p-5 bg-card space-y-3 min-w-0">
            <h2 className="font-bold break-words">{r.complex_promotions?.companies?.name}</h2>
            <p className="break-words">{r.complex_promotions?.title}</p>
            <p className="text-2xl font-black text-emerald-600">{r.remaining} {r.remaining === 1 ? 'hora disponible' : 'horas disponibles'}</p>
            <p>Días: {(r.complex_promotions?.weekdays || []).map((d: number) => dayNames[d]).join(', ')}</p>
            <p>Juega antes del {new Date(r.expires_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>
            <p className="text-sm text-muted-foreground">Elige una cancha de este complejo, selecciona el horario y usa tu regalo en el paso de pago.</p>
            <a href="/" className="btn-primary inline-block">Buscar cancha</a>
          </article>
        ))}
      </div>
    </main>
  );
}
