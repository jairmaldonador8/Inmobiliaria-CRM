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
 *
 * Task 9 (disponibilidad): con `asesorId`, al tener fecha+hora completas
 * consulta `GET /api/google/disponibilidad` (debounced) y, si el horario
 * elegido choca con algo, muestra una advertencia — SIN bloquear el envío
 * (regla de producto explícita: el humano puede saber más que el
 * calendario). Si la consulta falla por lo que sea, simplemente no se
 * muestra advertencia: la misma falla-abierta de `obtenerDisponibilidad`,
 * replicada aquí del lado del cliente.
 *
 * El debounce se dispara desde los `onChange`/`onValueChange` de los campos
 * (mismo patrón que `src/components/leads/filtros-leads.tsx`), NO desde un
 * `useEffect` que observe fecha/hora/duración: la regla de React
 * `set-state-in-effect` marca como error llamar `setState` de forma
 * síncrona en el cuerpo de un efecto (puede encadenar renders) — disparar la
 * consulta como reacción directa a la interacción del usuario evita el
 * problema de raíz en vez de silenciarlo.
 */

import { useEffect, useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'

import { convertirFechaHoraMonterreyAIso, formatearHoraMonterrey } from '@/lib/fechas/monterrey'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Espera antes de consultar disponibilidad tras el último cambio de fecha/hora/duración — evita una petición por cada ajuste del picker. */
const DEBOUNCE_DISPONIBILIDAD_MS = 400

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
  /** Con esto presente, se consulta disponibilidad del asesor; sin él, no se muestra ninguna advertencia (mismo comportamiento que antes de la Task 9). */
  asesorId?: string
  /** Nombre del asesor para el texto de la advertencia («{Asesor} ya tiene un compromiso…»). */
  asesorNombre?: string
  /** Visita que se está reagendando: se excluye de los bloques del CRM para no advertir sobre el propio compromiso que se mueve. */
  excluirVisitaId?: string
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
  asesorId,
  asesorNombre,
  excluirVisitaId,
}: Props) {
  const itemsDuracion = OPCIONES_DURACION.map((min) => ({
    value: String(min),
    label: ETIQUETA_DURACION[min],
  }))

  const [advertencia, setAdvertencia] = useState<string | null>(null)
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controladorRef = useRef<AbortController | null>(null)

  // Limpieza al desmontar (sheet cerrada): NO llama setState, solo cancela
  // el timer/fetch en vuelo — por eso no cae en la regla `set-state-in-effect`.
  useEffect(() => {
    return () => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current)
      controladorRef.current?.abort()
    }
  }, [])

  /** Cancela cualquier consulta pendiente (timer + fetch en vuelo) y, si aplica, agenda una nueva tras el debounce. */
  function consultarDisponibilidad(fechaValor: string, horaValor: string, duracionValor: number) {
    if (temporizadorRef.current) clearTimeout(temporizadorRef.current)
    controladorRef.current?.abort()

    if (!asesorId || !fechaValor || !horaValor) {
      setAdvertencia(null)
      return
    }

    const fechaInicioIso = convertirFechaHoraMonterreyAIso(fechaValor, horaValor)
    if (!fechaInicioIso) {
      setAdvertencia(null)
      return
    }

    const controlador = new AbortController()
    controladorRef.current = controlador

    temporizadorRef.current = setTimeout(() => {
      const fechaFinIso = new Date(
        new Date(fechaInicioIso).getTime() + duracionValor * 60_000
      ).toISOString()

      const params = new URLSearchParams({
        asesor: asesorId,
        desde: fechaInicioIso,
        hasta: fechaFinIso,
      })
      if (excluirVisitaId) params.set('excluirVisita', excluirVisitaId)

      fetch(`/api/google/disponibilidad?${params.toString()}`, {
        signal: controlador.signal,
      })
        .then((respuesta) => (respuesta.ok ? respuesta.json() : null))
        .then((datos: { ocupado?: { inicio: string; fin: string }[] } | null) => {
          const bloque = datos?.ocupado?.[0]
          if (!bloque) {
            setAdvertencia(null)
            return
          }
          const nombre = asesorNombre ?? 'El asesor'
          setAdvertencia(
            `${nombre} ya tiene un compromiso de ${formatearHoraMonterrey(bloque.inicio)} a ${formatearHoraMonterrey(bloque.fin)}`
          )
        })
        .catch(() => {
          // Falla abierta: nunca bloquea el agendado, solo no se muestra
          // advertencia (mismo contrato que `obtenerDisponibilidad`).
          setAdvertencia(null)
        })
    }, DEBOUNCE_DISPONIBILIDAD_MS)
  }

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
            onChange={(e) => {
              onFechaChange(e.target.value)
              consultarDisponibilidad(e.target.value, hora, duracionMin)
            }}
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
            onChange={(e) => {
              onHoraChange(e.target.value)
              consultarDisponibilidad(fecha, e.target.value, duracionMin)
            }}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefijo}-duracion`}>Duración</Label>
        <Select
          items={itemsDuracion}
          value={String(duracionMin)}
          onValueChange={(v) => {
            const nuevaDuracion = Number(v)
            onDuracionChange(nuevaDuracion)
            consultarDisponibilidad(fecha, hora, nuevaDuracion)
          }}
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

      {advertencia ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {advertencia}
        </p>
      ) : null}
    </>
  )
}
