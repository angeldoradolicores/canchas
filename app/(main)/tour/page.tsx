import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Tour Interactivo del Producto | Cancheros Pasto',
  description: 'Conoce cómo funciona la plataforma Cancheros para jugadores y dueños de complejos deportivos en Pasto.',
};

export default function TourPage() {
  redirect('/tour.html');
}
