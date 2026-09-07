import { ArrowRight, CalendarDays, Heart, ShieldCheck, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pitches } from '@/lib/mock-data';
import { PitchCard } from '@/components/ui/PitchCard';

interface SimpleSectionProps {
  type: 'jugadores' | 'campeonatos' | 'escuelas' | 'perfil' | 'reservas';
}

export function SimpleSection({ type }: SimpleSectionProps) {
  const data = {
    jugadores: {
      eyebrow: 'ENCUENTRA JUGADOR',
      title: 'Completa tu equipo',
      lead: 'Conecta con jugadores de Pasto según posición, nivel y disponibilidad.',
      action: 'Publicar búsqueda',
      icon: Users,
      items: [
        'Mateo · Arquero · Nivel intermedio',
        'Valentina · Volante · Nivel avanzado',
        'Santiago · Defensa · Nivel amateur',
      ],
    },
    campeonatos: {
      eyebrow: 'CAMPEONATOS',
      title: 'Compite por algo grande',
      lead: 'Inscríbete a torneos locales y lleva el marcador de tu equipo.',
      action: 'Crear campeonato',
      icon: Trophy,
      items: [
        'Copa La 14 · Fútbol 5 · Inscripciones abiertas',
        'Liga Pinares · Fútbol 8 · 12 equipos',
        'Torneo Universitario · Mixto · Próximamente',
      ],
    },
    escuelas: {
      eyebrow: 'ESCUELAS DE FÚTBOL',
      title: 'Entrena como profesional',
      lead: 'Encuentra escuelas para niños, jóvenes y adultos en Pasto.',
      action: 'Ver escuelas',
      icon: ShieldCheck,
      items: [
        'Academia Los Andes · Niños 7–14 años',
        'Formación Pinares · Jóvenes y adultos',
        'Escuela Fútbol Total · Preparación competitiva',
      ],
    },
    perfil: {
      eyebrow: 'MI PERFIL',
      title: 'Tu fútbol, en un solo lugar',
      lead: 'Administra tus equipos, favoritos y estadísticas de jugador.',
      action: 'Editar perfil',
      icon: Heart,
      items: [
        '3 equipos creados',
        '12 partidos jugados este mes',
        'Nivel: Intermedio · Posición: Volante',
      ],
    },
    reservas: {
      eyebrow: 'MIS RESERVAS',
      title: 'Tus próximos partidos',
      lead: 'Revisa horarios, comprobantes y detalles de tus canchas.',
      action: 'Nueva reserva',
      icon: CalendarDays,
      items: [
        'Sábado 24 · La 14 · 6:30 PM · Confirmada',
        'Domingo 25 · Pinares · 10:00 AM · Pendiente',
        'Viernes 30 · Los Andes · 8:00 PM · Confirmada',
      ],
    },
  }[type];

  if (type === 'reservas') {
    return (
      <section className="page-content reservations-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow accent-label">MIS RESERVAS</p>
            <h1>Tus próximos partidos</h1>
            <p className="lead">Revisa horarios, comprobantes y detalles de tus canchas.</p>
          </div>
          <Button>
            <CalendarDays data-icon="inline-start" /> Nueva reserva
          </Button>
        </div>
        <div className="reservations-grid">
          {pitches.map((pitch) => (
            <PitchCard
              key={pitch.id}
              pitch={pitch as import('@/components/ui/PitchCard').PitchData}
              isAdmin={false}
            />
          ))}
        </div>
      </section>
    );
  }

  const Icon = data.icon;

  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow accent-label">{data.eyebrow}</p>
          <h1>{data.title}</h1>
          <p className="lead">{data.lead}</p>
        </div>
        <Button>
          <Icon data-icon="inline-start" /> {data.action}
        </Button>
      </div>
      <div className="feature-grid">
        {data.items.map((item, i) => (
          <article className="feature-card" key={item}>
            <div
              className={`feature-photo ${pitches[i].tone}`}
              style={{ backgroundImage: `url(${pitches[i].image})` }}
            />
            <div>
              <span className="eyebrow">0{i + 1}</span>
              <h2>{item.split(' · ')[0]}</h2>
              <p>{item.split(' · ').slice(1).join(' · ') || item}</p>
              <Button variant="outline" size="sm">
                Ver detalles <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
