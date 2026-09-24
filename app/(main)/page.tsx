'use client';

import { useState, useEffect } from 'react';
import { Pitch } from '@/lib/types';
import { ExploreView } from '@/components/explore/ExploreView';
import { PitchDetail } from '@/components/booking/PitchDetail';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { useActiveBooking } from '@/lib/active-booking-context';
import { CustomAlertModal, AlertModalState } from '@/components/ui/CustomAlertModal';

export default function ExplorePage() {
  const [booking, setBooking] = useState<Pitch | null>(null);
  const [detail, setDetail] = useState<Pitch | null>(null);
  const [preselectedTimes, setPreselectedTimes] = useState<string[]>([]);
  const [preselectedDate, setPreselectedDate] = useState('');
  const { activeBooking, setIsFloating } = useActiveBooking();

  const [alertState, setAlertState] = useState<AlertModalState>({
    isOpen: false,
    type: 'warning',
    title: '',
    message: ''
  });

  // Auto-activar flotante al salir del BookingFlow con reserva activa
  const handleLeaveBooking = () => {
    if (activeBooking) {
      setIsFloating(true); // Mostrar el cronómetro flotante automáticamente
    }
    setBooking(null);
    setPreselectedTimes([]);
    setPreselectedDate('');
  };

  useEffect(() => {
    const handleResume = () => {
      if (activeBooking) {
        setBooking(activeBooking.pitch);
        setPreselectedTimes(activeBooking.selectedTimes);
        setPreselectedDate(activeBooking.selectedDate);
        setDetail(null);
      }
    };

    const handleCancel = () => {
      handleLeaveBooking();
    };

    const handleResetExplore = () => {
      setBooking(null);
      setDetail(null);
      setPreselectedTimes([]);
      setPreselectedDate('');
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    };

    window.addEventListener('resume-active-booking', handleResume);
    window.addEventListener('cancel-active-booking', handleCancel);
    window.addEventListener('reset-explore-view', handleResetExplore);

    // Auto-resume if coming from another page via FloatingBookingTimer
    if (typeof window !== 'undefined' && localStorage.getItem('resume-booking') === 'true' && activeBooking) {
      localStorage.removeItem('resume-booking');
      handleResume();
    }

    return () => {
      window.removeEventListener('resume-active-booking', handleResume);
      window.removeEventListener('cancel-active-booking', handleCancel);
      window.removeEventListener('reset-explore-view', handleResetExplore);
    };
  }, [activeBooking]);

  // 1. Determinar qué vista mostrar sin usar "returns" anticipados
  return (
    <>
      <CustomAlertModal alertState={alertState} onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))} />
      {booking ? (
        <BookingFlow
          pitch={booking}
          preselectedTimes={preselectedTimes}
          preselectedDate={preselectedDate}
          onBack={handleLeaveBooking}
        />
      ) : detail ? (
        <PitchDetail
          pitch={detail}
          onBack={() => setDetail(null)}
          onSelectPitch={(p) => setDetail(p)}
          onBook={(times, date, chosenPitch) => {
            setPreselectedTimes(times || []);
            setPreselectedDate(date || '');
            setBooking(chosenPitch || detail);
            setDetail(null);
          }}
        />
      ) : (
        <ExploreView
          onBook={(pitch, times, date) => {
            if (activeBooking && activeBooking.pitch.id !== pitch.id) {
              setAlertState({
                isOpen: true,
                type: 'warning',
                title: 'Reserva en proceso',
                message: 'Tienes una reserva pendiente de pago o confirmación.\n\nPara iniciar una nueva reserva, primero debes completar o cancelar la actual.',
                showCancel: true,
                confirmText: 'Ir a mi reserva',
                cancelText: 'Cerrar',
                onConfirm: () => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('resume-active-booking', { detail: activeBooking }));
                  }
                }
              });
              return;
            }
            setPreselectedTimes(Array.isArray(times) ? times : times ? [times] : []);
            setPreselectedDate(date || '');
            setBooking(pitch);
          }}
          onOpen={(pitch) => setDetail(pitch)}
        />
      )}
    </>
  );
}