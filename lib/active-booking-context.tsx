'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Pitch } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';

export interface ActiveBookingData {
  pitch: Pitch;
  selectedDate: string;
  selectedTimes: string[];
  expiresAt: string;
  bookingIds: string[];
}

interface ActiveBookingContextType {
  activeBooking: ActiveBookingData | null;
  secondsLeft: number;
  isFloating: boolean;
  showCancelModal: boolean;
  lockLoading: boolean;
  lockError: string | null;
  startLock: (pitch: Pitch, date: string, times: string[]) => Promise<boolean>;
  cancelActiveBooking: () => Promise<void>;
  setIsFloating: (floating: boolean) => void;
  setShowCancelModal: (show: boolean) => void;
  clearActiveBooking: () => void;
}

const ActiveBookingContext = createContext<ActiveBookingContextType>({
  activeBooking: null,
  secondsLeft: 0,
  isFloating: false,
  showCancelModal: false,
  lockLoading: false,
  lockError: null,
  startLock: async () => false,
  cancelActiveBooking: async () => {},
  setIsFloating: () => {},
  setShowCancelModal: () => {},
  clearActiveBooking: () => {},
});

const STORAGE_KEY = 'canchas_active_draft_booking';

export function ActiveBookingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeBooking, setActiveBooking] = useState<ActiveBookingData | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isFloating, setIsFloating] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [lockLoading, setLockLoading] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Restaurar desde sessionStorage al cargar
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: ActiveBookingData = JSON.parse(saved);
        const expiresTime = new Date(parsed.expiresAt).getTime();
        const now = Date.now();
        const diff = Math.floor((expiresTime - now) / 1000);
        if (diff > 0) {
          setActiveBooking(parsed);
          setSecondsLeft(diff);
          setIsFloating(true); // Si se recargó la página, mantener como flotante
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {}
  }, []);

  // Timer de cuenta regresiva
  useEffect(() => {
    if (!activeBooking) {
      if (timerRef.current) clearInterval(timerRef.current);
      setSecondsLeft(0);
      return;
    }

    const updateTimer = () => {
      const expiresTime = new Date(activeBooking.expiresAt).getTime();
      const diff = Math.max(0, Math.floor((expiresTime - Date.now()) / 1000));
      setSecondsLeft(diff);

      if (diff <= 0) {
        // Expiró
        if (timerRef.current) clearInterval(timerRef.current);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('active-booking-expired', {
              detail: {
                pitchId: activeBooking.pitch.id,
                pitchName: activeBooking.pitch.name,
              },
            })
          );
          sessionStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(STORAGE_KEY);
        }
        clearActiveBooking();
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeBooking]);

  const clearActiveBooking = useCallback(() => {
    setActiveBooking(null);
    setIsFloating(false);
    setShowCancelModal(false);
    setSecondsLeft(0);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const cancelActiveBooking = useCallback(async () => {
    if (!activeBooking) return;
    const { pitch, selectedDate, selectedTimes, bookingIds } = activeBooking;

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel_draft',
          payload: {
            pitch_id: pitch.id,
            selected_date: selectedDate,
            selected_times: selectedTimes,
            user_id: user?.id || null,
            booking_ids: bookingIds || [],
          },
        }),
      });
      
      const data = await res.json();
      if (!res.ok || !data.success) {
        console.error('[cancel draft response error]', data);
      }
    } catch (e) {
      console.error('[cancel draft error]', e);
    } finally {
      clearActiveBooking();
    }
  }, [activeBooking, user, clearActiveBooking]);

  const startLock = useCallback(
    async (pitch: Pitch, date: string, times: string[]): Promise<boolean> => {
      if (!pitch || !date || times.length === 0) return false;
      setLockLoading(true);
      setLockError(null);

      try {
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'lock_booking',
            payload: {
              pitch_id: pitch.id,
              user_id: user?.id || null,
              selected_date: date,
              selected_times: times,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          const errMsg = data.error || 'Esta hora ya está siendo reservada por otra persona.';
          setLockError(errMsg);
          return false;
        }

        const newActive: ActiveBookingData = {
          pitch,
          selectedDate: date,
          selectedTimes: times,
          expiresAt: data.data.expires_at,
          bookingIds: data.data.booking_ids || [],
        };

        setActiveBooking(newActive);
        setIsFloating(false);
        const diff = Math.max(0, Math.floor((new Date(data.data.expires_at).getTime() - Date.now()) / 1000));
        setSecondsLeft(diff);

        if (typeof window !== 'undefined') {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newActive));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newActive));
        }

        return true;
      } catch (err: any) {
        setLockError(err.message || 'Error al bloquear la cancha');
        return false;
      } finally {
        setLockLoading(false);
      }
    },
    [user]
  );

  return (
    <ActiveBookingContext.Provider
      value={{
        activeBooking,
        secondsLeft,
        isFloating,
        showCancelModal,
        lockLoading,
        lockError,
        startLock,
        cancelActiveBooking,
        setIsFloating,
        setShowCancelModal,
        clearActiveBooking,
      }}
    >
      {children}
    </ActiveBookingContext.Provider>
  );
}

export const useActiveBooking = () => useContext(ActiveBookingContext);
