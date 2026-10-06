'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { usePathname } from 'next/navigation';

interface ReservationsNotificationContextType {
  hasReservationUpdates: boolean;
  clearReservationUpdates: () => void;
  checkReservationStatuses: () => Promise<void>;
}

const ReservationsNotificationContext = createContext<ReservationsNotificationContextType>({
  hasReservationUpdates: false,
  clearReservationUpdates: () => {},
  checkReservationStatuses: async () => {},
});

const SEEN_STATUSES_KEY = 'canchas_seen_booking_statuses';
const UNREAD_FLAG_KEY = 'canchas_unread_reservation_updates';

export function ReservationsNotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const supabase = createClient();
  const [hasReservationUpdates, setHasReservationUpdates] = useState(false);
  const isCheckingRef = useRef(false);

  // Cargar estado inicial de no leídos desde localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedUnread = localStorage.getItem(UNREAD_FLAG_KEY) === 'true';
      if (savedUnread) setHasReservationUpdates(true);
    } catch {}
  }, []);

  const clearReservationUpdates = useCallback(() => {
    setHasReservationUpdates(false);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(UNREAD_FLAG_KEY);
      } catch {}
    }
  }, []);

  // Si el usuario entra a /reservations, marcar automáticamente como leídas las actualizaciones
  useEffect(() => {
    if (pathname === '/reservations') {
      clearReservationUpdates();
    }
  }, [pathname, clearReservationUpdates]);

  /**
   * Consulta las reservas del usuario (o invitado) y detecta si hubo cambios de estado
   */
  const checkReservationStatuses = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      let currentBookings: { id: string; status: string; updated_at?: string }[] = [];

      if (user?.id) {
        const { data, error } = await supabase
          .from('bookings')
          .select('id, status, updated_at')
          .eq('user_id', user.id);

        if (!error && Array.isArray(data)) {
          currentBookings = data;
        }
      } else {
        // Para invitados, revisar IDs en almacenamiento local
        let guestIds: string[] = [];
        if (typeof window !== 'undefined') {
          try {
            const localIds = JSON.parse(localStorage.getItem('cancheros_guest_booking_ids') || '[]');
            const sessionIds = JSON.parse(sessionStorage.getItem('cancheros_recent_booking_ids') || '[]');
            guestIds = Array.from(new Set([...localIds, ...sessionIds]));
          } catch {}
        }

        if (guestIds.length > 0) {
          const { data, error } = await supabase
            .from('bookings')
            .select('id, status, updated_at')
            .in('id', guestIds);

          if (!error && Array.isArray(data)) {
            currentBookings = data;
          }
        }
      }

      if (typeof window === 'undefined' || currentBookings.length === 0) return;

      const seenRaw = localStorage.getItem(SEEN_STATUSES_KEY);
      const seenStatuses: Record<string, string> = seenRaw ? JSON.parse(seenRaw) : {};

      let hasNewChange = false;
      const updatedSeen: Record<string, string> = { ...seenStatuses };

      for (const b of currentBookings) {
        const previousStatus = seenStatuses[b.id];

        // Si ya teníamos registrado el estado previo y ahora es diferente (ej: pending -> confirmed o pending -> cancelled)
        if (previousStatus && previousStatus !== b.status) {
          hasNewChange = true;
        }

        // Registrar estado actual
        updatedSeen[b.id] = b.status;
      }

      // Si el usuario no está en la página de reservas y se detectó un cambio, activar el globito
      if (hasNewChange && pathname !== '/reservations') {
        setHasReservationUpdates(true);
        localStorage.setItem(UNREAD_FLAG_KEY, 'true');
      }

      // Si el usuario ESTÁ en la página de reservas, sincronizar los estados vistos para que no vuelva a notificar
      if (pathname === '/reservations') {
        localStorage.setItem(SEEN_STATUSES_KEY, JSON.stringify(updatedSeen));
      } else if (!seenRaw) {
        // Primera vez que se cargan: guardar línea base para detectar cambios futuros
        localStorage.setItem(SEEN_STATUSES_KEY, JSON.stringify(updatedSeen));
      }
    } catch (err) {
      console.warn('Error verificando notificaciones de reservas:', err);
    } finally {
      isCheckingRef.current = false;
    }
  }, [user?.id, pathname, supabase]);

  // Verificar al montar o cambiar usuario/ruta
  useEffect(() => {
    checkReservationStatuses();
  }, [checkReservationStatuses]);

  // Polling ligero cada 8 segundos y Realtime para detectar cambios en tiempo real
  useEffect(() => {
    const pollInterval = setInterval(() => {
      checkReservationStatuses();
    }, 8000);

    // Si el usuario está autenticado, suscribir a postgres_changes en bookings
    let channel: any = null;
    if (user?.id) {
      channel = supabase
        .channel(`user-notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'bookings',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const oldStatus = payload.old?.status;
            const newStatus = payload.new?.status;
            if (newStatus && newStatus !== oldStatus && pathname !== '/reservations') {
              setHasReservationUpdates(true);
              if (typeof window !== 'undefined') {
                localStorage.setItem(UNREAD_FLAG_KEY, 'true');
              }
            }
          }
        )
        .subscribe();
    }

    // Escuchar eventos globales de cambios de reserva
    const handleManualTrigger = () => {
      checkReservationStatuses();
    };
    window.addEventListener('reservation-status-updated', handleManualTrigger);

    return () => {
      clearInterval(pollInterval);
      if (channel) supabase.removeChannel(channel);
      window.removeEventListener('reservation-status-updated', handleManualTrigger);
    };
  }, [user?.id, pathname, checkReservationStatuses, supabase]);

  return (
    <ReservationsNotificationContext.Provider
      value={{
        hasReservationUpdates,
        clearReservationUpdates,
        checkReservationStatuses,
      }}
    >
      {children}
    </ReservationsNotificationContext.Provider>
  );
}

export const useReservationsNotifications = () => useContext(ReservationsNotificationContext);
