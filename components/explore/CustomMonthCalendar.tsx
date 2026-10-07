'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTH_NAMES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface CustomMonthCalendarProps {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (dateStr: string) => void;
  minDate?: string | null; // YYYY-MM-DD (Si se omite o es null, NO restringe fechas pasadas)
}

export function CustomMonthCalendar({ selectedDate, onSelectDate, minDate }: CustomMonthCalendarProps) {
  const todayObj = new Date();

  // Parse initial state or current month
  const initialYear = selectedDate ? parseInt(selectedDate.split('-')[0]) : todayObj.getFullYear();
  const initialMonth = selectedDate ? parseInt(selectedDate.split('-')[1]) - 1 : todayObj.getMonth();

  const [currentYear, setCurrentYear] = useState(initialYear);
  const [currentMonth, setCurrentMonth] = useState(initialMonth); // 0-indexed

  // Si minDate es proporcionado, se evalúa. Si es null/undefined, no restringe fechas.
  const minDateObj = minDate ? new Date(minDate + 'T00:00:00') : null;
  if (minDateObj) {
    minDateObj.setHours(0, 0, 0, 0);
  }

  // Navegación de meses
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  // Cálculo de días del mes
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstWeekday = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Dom, 1 = Lun...

  // Construcción de celdas (42 slots: 6 filas x 7 columnas)
  const cells: Array<{ type: 'blank' | 'day'; dayNumber?: number; dateStr?: string; isDisabled?: boolean; isToday?: boolean; isSelected?: boolean }> = [];

  // Espacios en blanco al inicio
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ type: 'blank' });
  }

  // Días del mes
  for (let day = 1; day <= daysInMonth; day++) {
    const monthStr = (currentMonth + 1).toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    const dateStr = `${currentYear}-${monthStr}-${dayStr}`;

    const cellDate = new Date(currentYear, currentMonth, day);
    cellDate.setHours(0, 0, 0, 0);

    const isToday = cellDate.getTime() === new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate()).getTime();

    // Deshabilitar solo si existe minDateObj y la fecha de la celda es menor
    const isDisabled = minDateObj ? cellDate.getTime() < minDateObj.getTime() : false;
    const isSelected = selectedDate === dateStr;

    cells.push({
      type: 'day',
      dayNumber: day,
      dateStr,
      isDisabled,
      isToday,
      isSelected,
    });
  }

  // Rellenar celdas en blanco al final hasta 42
  while (cells.length < 42) {
    cells.push({ type: 'blank' });
  }

  return (
    <div className="w-full max-w-[340px] mx-auto font-sans bg-card dark:bg-[#151e18] rounded-2xl overflow-hidden shadow-xl dark:shadow-2xl dark:shadow-black/50 border border-border/80 dark:border-emerald-500/20 transition-colors">
      {/* Header del Calendario */}
      <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-700 dark:from-emerald-950 dark:via-emerald-900 dark:to-emerald-950 text-white py-3.5 px-4 flex items-center justify-between border-b border-white/10 dark:border-emerald-500/20">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all text-white cursor-pointer"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={20} />
        </button>

        <h3 className="font-extrabold text-sm sm:text-base tracking-wider uppercase text-white drop-shadow-xs">
          {MONTH_NAMES[currentMonth]} {currentYear}
        </h3>

        <button
          type="button"
          onClick={handleNextMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all text-white cursor-pointer"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Días de la semana */}
      <div className="grid grid-cols-7 bg-secondary/50 dark:bg-black/30 text-center text-[11px] font-bold text-muted-foreground uppercase border-b border-border/60 dark:border-emerald-500/10 py-2">
        {WEEKDAYS.map((wd) => (
          <div key={wd}>{wd}</div>
        ))}
      </div>

      {/* Grid de días */}
      <div className="grid grid-cols-7 p-2.5 gap-1.5 bg-card dark:bg-[#151e18]">
        {cells.map((cell, idx) => {
          if (cell.type === 'blank') {
            return <div key={`blank-${idx}`} className="h-9 rounded-xl opacity-0 pointer-events-none" />;
          }

          if (cell.isDisabled) {
            return (
              <div
                key={cell.dateStr}
                className="h-9 flex items-center justify-center text-xs text-muted-foreground/35 dark:text-muted-foreground/25 rounded-xl cursor-not-allowed select-none line-through"
              >
                {cell.dayNumber}
              </div>
            );
          }

          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => cell.dateStr && onSelectDate(cell.dateStr)}
              className={`h-9 rounded-xl text-xs font-semibold transition-all flex items-center justify-center cursor-pointer ${
                cell.isSelected
                  ? 'bg-primary text-white font-extrabold shadow-md shadow-primary/30 scale-105 ring-2 ring-primary/40 dark:ring-primary/60'
                  : cell.isToday
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-bold hover:bg-emerald-500/25'
                    : 'text-foreground hover:bg-secondary dark:hover:bg-white/10 hover:text-foreground active:scale-95'
              }`}
            >
              {cell.dayNumber}
            </button>
          );
        })}
      </div>
    </div>
  );
}