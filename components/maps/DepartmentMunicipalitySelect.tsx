'use client';

import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { COLOMBIA_DEPARTMENTS, findDepartment, findMunicipality } from '@/lib/colombia-locations';

interface Props {
  department: string;
  city: string;
  onDepartmentChange: (name: string) => void;
  onCityChange: (name: string) => void;
  /** Coordenada del casco urbano del municipio elegido (para centrar el mapa). */
  onMunicipalityPicked?: (lat: number, lng: number) => void;
}

const selectCls =
  'w-full appearance-none cursor-pointer px-4 pr-9 py-2.5 text-sm border border-border rounded-xl bg-background outline-none focus:border-emerald-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * Departamento → Municipio como desplegables (DANE). Si el valor guardado no está en la lista
 * (escrito a mano antes o devuelto por el mapa con otro nombre), se conserva como opción.
 */
export default function DepartmentMunicipalitySelect({ department, city, onDepartmentChange, onCityChange, onMunicipalityPicked }: Props) {
  const dep = useMemo(() => findDepartment(department), [department]);
  const depValue = dep?.name || department || '';
  const mun = useMemo(() => findMunicipality(dep, city), [dep, city]);
  const cityValue = mun?.[0] || city || '';

  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="dm-department" className="text-xs font-bold text-muted-foreground uppercase">Departamento *</label>
        <div className="relative">
          <select
            id="dm-department"
            value={depValue}
            onChange={e => {
              const next = findDepartment(e.target.value);
              onDepartmentChange(e.target.value);
              // Si el municipio actual no es de ese departamento, se limpia para que elija uno.
              if (!findMunicipality(next, city)) onCityChange('');
            }}
            className={selectCls}
          >
            {!dep && department && <option value={department}>{department}</option>}
            {!depValue && <option value="">Selecciona el departamento</option>}
            {COLOMBIA_DEPARTMENTS.map(d => (
              <option key={d.name} value={d.name}>{d.name}</option>
            ))}
          </select>
          <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="dm-city" className="text-xs font-bold text-muted-foreground uppercase">Ciudad / Municipio *</label>
        <div className="relative">
          <select
            id="dm-city"
            value={cityValue}
            disabled={!dep}
            onChange={e => {
              onCityChange(e.target.value);
              const m = findMunicipality(dep, e.target.value);
              if (m && onMunicipalityPicked) onMunicipalityPicked(m[1], m[2]);
            }}
            className={selectCls}
          >
            {!mun && city && <option value={city}>{city}</option>}
            {!cityValue && <option value="">{dep ? `Municipios de ${dep.name} (${dep.municipalities.length})` : 'Primero elige el departamento'}</option>}
            {dep?.municipalities.map(m => (
              <option key={m[0]} value={m[0]}>{m[0]}</option>
            ))}
          </select>
          <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
        </div>
      </div>
    </>
  );
}
