'use client'

/**
 * Campos compartidos de fecha, hora y duración de una visita — usados por
 * `HojaAgendarVisita` (agendar) y `HojaReagendarVisita` (reagendar) para NO
 * duplicar la lógica de zona horaria ni las opciones de duración entre
 * ambos formularios (Task de corrección post-cierre: reagendar/cancelar).
 *
 * Fecha y hora son SIEMPRE estado controlado por el padre (nunca
 * `defaultValue`): con `<form action={fn}>`, React 19 resetea los inputs no
 * controlados en cuanto la función retorna, incluso si hubo error — un
 * error de validación dejaría los campos en blanco y obligaría a teclear
 * todo de nuevo. Al ser controlados, sobreviven a un error de servidor.
 */

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Opciones de duración razonables para una visita, en minutos. */
export const OPCIONES_DURACION = [30, 45, 60, 90, 120] as const

export const ETIQUETA_DURACION: Record<number, string> = {
  30: '30 min',
  45: '45 min',
  60: '1 hora',
  90: '1 h 30 min',
  120: '2 horas',
}

type Props = {
  idPrefijo: string
  fecha: string
  hora: string
  duracionMin: number
  onFechaChange: (fecha: string) => void
  onHoraChange: (hora: string) => void
  onDuracionChange: (duracionMin: number) => void
  /** `min` del input de fecha: hoy en America/Monterrey, no la del dispositivo. */
  minFecha: string
  disabled: boolean
}

/** Fecha, hora y duración de una visita — fila de 2 columnas + select. */
export function CamposFechaHoraVisita({
  idPrefijo,
  fecha,
  hora,
  duracionMin,
  onFechaChange,
  onHoraChange,
  onDuracionChange,
  minFecha,
  disabled,
}: Props) {
  const itemsDuracion = OPCIONES_DURACION.map((min) => ({
    value: String(min),
    label: ETIQUETA_DURACION[min],
  }))

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefijo}-fecha`}>Fecha</Label>
          <Input
            id={`${idPrefijo}-fecha`}
            name="fecha"
            type="date"
            required
            min={minFecha}
            disabled={disabled}
            value={fecha}
            onChange={(e) => onFechaChange(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefijo}-hora`}>Hora</Label>
          <Input
            id={`${idPrefijo}-hora`}
            name="hora"
            type="time"
            required
            disabled={disabled}
            value={hora}
            onChange={(e) => onHoraChange(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefijo}-duracion`}>Duración</Label>
        <Select
          items={itemsDuracion}
          value={String(duracionMin)}
          onValueChange={(v) => onDuracionChange(Number(v))}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefijo}-duracion`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {itemsDuracion.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  )
}
