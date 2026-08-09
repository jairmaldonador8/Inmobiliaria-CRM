'use client'

/**
 * Calendario mensual del rol de guardias (admin). Tap en un día abre la hoja
 * con los dos turnos; asignar dispara guardarGuardia y refresca. Huecos de
 * HOY en adelante se pintan en rojo; cada semana tiene su botón «copiar la
 * semana anterior» (no pisa turnos ya capturados — lo garantiza la action).
 */
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, CopyPlus } from 'lucide-react'
import { toast } from 'sonner'

import { copiarSemanaAnterior, guardarGuardia } from '@/lib/guardias/acciones'
import type { Guardia } from '@/lib/guardias/consultas'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

interface AsesorOpcion {
  userId: string
  nombre: string
}

interface Props {
  mes: string // YYYY-MM
  mesAnterior: string
  mesSiguiente: string
  hoy: string // YYYY-MM-DD en Monterrey (calculado en el servidor)
  guardias: Guardia[]
  asesores: AsesorOpcion[]
}

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const TURNOS: { turno: 'manana' | 'tarde'; etiqueta: string }[] = [
  { turno: 'manana', etiqueta: 'Mañana' },
  { turno: 'tarde', etiqueta: 'Tarde' },
]

function nombreCorto(nombre: string): string {
  return nombre.split(' ')[0]
}

/** Semanas del mes, lunes-primero; null = celda de relleno de otro mes. */
function semanasDelMes(mes: string): (string | null)[][] {
  const [anio, mesNum] = mes.split('-').map(Number)
  const totalDias = new Date(Date.UTC(anio, mesNum, 0)).getUTCDate()
  const primerDia = new Date(Date.UTC(anio, mesNum - 1, 1))
  const offsetLunes = (primerDia.getUTCDay() + 6) % 7

  const celdas: (string | null)[] = Array(offsetLunes).fill(null)
  for (let dia = 1; dia <= totalDias; dia++) {
    celdas.push(`${mes}-${String(dia).padStart(2, '0')}`)
  }
  while (celdas.length % 7 !== 0) celdas.push(null)

  const semanas: (string | null)[][] = []
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7))
  return semanas
}

const NOMBRE_MES = new Intl.DateTimeFormat('es-MX', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export function CalendarioGuardias({ mes, mesAnterior, mesSiguiente, hoy, guardias, asesores }: Props) {
  const router = useRouter()
  const [guardando, startTransition] = useTransition()
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null)

  const porDiaTurno = useMemo(() => {
    const mapa = new Map<string, Guardia>()
    for (const g of guardias) mapa.set(`${g.fecha}:${g.turno}`, g)
    return mapa
  }, [guardias])

  const nombresPorId = useMemo(
    () => new Map(asesores.map((a) => [a.userId, a.nombre])),
    [asesores]
  )

  const semanas = useMemo(() => semanasDelMes(mes), [mes])

  function asignar(fecha: string, turno: 'manana' | 'tarde', asesorId: string | null) {
    startTransition(async () => {
      const r = await guardarGuardia(fecha, turno, asesorId)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      router.refresh()
    })
  }

  function copiarSemana(lunes: string) {
    startTransition(async () => {
      const r = await copiarSemanaAnterior(lunes)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(
        r.copiadas === 0
          ? 'Nada que copiar: la semana ya estaba cubierta'
          : `Se copiaron ${r.copiadas} turno${r.copiadas === 1 ? '' : 's'} de la semana anterior`
      )
      router.refresh()
    })
  }

  const tituloMes = NOMBRE_MES.format(new Date(`${mes}-01T00:00:00Z`))

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold capitalize text-slate-900">{tituloMes}</h2>
        <div className="flex items-center gap-1">
          <Link
            href={`/admin/guardias?mes=${mesAnterior}`}
            aria-label="Mes anterior"
            className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <Link
            href={`/admin/guardias?mes=${mesSiguiente}`}
            aria-label="Mes siguiente"
            className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[repeat(7,minmax(0,1fr))_auto] gap-1 text-center">
        {DIAS_SEMANA.map((d, i) => (
          <span key={`${d}-${i}`} className="py-1 text-[11px] font-medium text-slate-500">
            {d}
          </span>
        ))}
        <span aria-hidden className="w-8" />

        {semanas.map((semana, iSemana) => {
          const lunes = semana.find((d) => d !== null)
          return (
            <div key={iSemana} className="col-span-full grid grid-cols-subgrid">
              {semana.map((fecha, iDia) =>
                fecha === null ? (
                  <span key={`vacio-${iDia}`} aria-hidden />
                ) : (
                  <CeldaDia
                    key={fecha}
                    fecha={fecha}
                    hoy={hoy}
                    manana={porDiaTurno.get(`${fecha}:manana`)}
                    tarde={porDiaTurno.get(`${fecha}:tarde`)}
                    nombresPorId={nombresPorId}
                    onTap={() => setDiaAbierto(fecha)}
                  />
                )
              )}
              <button
                type="button"
                onClick={() => lunes && copiarSemana(lunes)}
                disabled={guardando || !lunes}
                title="Copiar la semana anterior a esta semana"
                aria-label="Copiar la semana anterior a esta semana"
                className="flex w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
              >
                <CopyPlus className="size-4" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        <span className="mr-1 inline-block size-2 rounded-full bg-red-500 align-middle" aria-hidden />
        Turno sin cubrir (de hoy en adelante). El botón{' '}
        <CopyPlus className="inline size-3 align-text-bottom" aria-hidden /> copia la semana anterior.
      </p>

      <Sheet open={diaAbierto !== null} onOpenChange={(abierta) => !abierta && setDiaAbierto(null)}>
        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-2xl">
          {diaAbierto && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle>
                  {new Intl.DateTimeFormat('es-MX', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    timeZone: 'UTC',
                  }).format(new Date(`${diaAbierto}T00:00:00Z`))}
                </SheetTitle>
                <SheetDescription>Asigna quién cubre cada turno de este día</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4 pb-6">
                {TURNOS.map(({ turno, etiqueta }) => {
                  const actual = porDiaTurno.get(`${diaAbierto}:${turno}`)
                  return (
                    <label key={turno} className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-slate-900">
                        {etiqueta}
                        {actual && (
                          <span className="ml-2 font-normal text-slate-500">
                            {actual.hora_inicio.slice(0, 5)}–{actual.hora_fin.slice(0, 5)}
                          </span>
                        )}
                      </span>
                      <select
                        value={actual?.asesor_id ?? ''}
                        onChange={(e) => asignar(diaAbierto, turno, e.target.value || null)}
                        disabled={guardando}
                        className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:opacity-60"
                      >
                        <option value="">Sin asignar</option>
                        {asesores.map((a) => (
                          <option key={a.userId} value={a.userId}>
                            {a.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function CeldaDia({
  fecha,
  hoy,
  manana,
  tarde,
  nombresPorId,
  onTap,
}: {
  fecha: string
  hoy: string
  manana?: Guardia
  tarde?: Guardia
  nombresPorId: Map<string, string>
  onTap: () => void
}) {
  const esPasado = fecha < hoy
  const esHoy = fecha === hoy
  const huecos = !esPasado && (!manana || !tarde)

  return (
    <button
      type="button"
      onClick={onTap}
      className={cn(
        'flex min-h-14 flex-col items-stretch gap-0.5 rounded-lg border p-1 text-left transition-colors',
        esPasado
          ? 'border-transparent bg-slate-50 opacity-60'
          : huecos
            ? 'border-red-300 bg-red-50 hover:bg-red-100'
            : 'border-slate-200 bg-white hover:bg-slate-50',
        esHoy && 'ring-2 ring-slate-900 ring-offset-1'
      )}
    >
      <span className={cn('text-[11px] font-semibold', huecos ? 'text-red-600' : 'text-slate-900')}>
        {Number(fecha.slice(-2))}
      </span>
      <TurnoMini guardia={manana} etiqueta="M" nombresPorId={nombresPorId} faltante={!esPasado} />
      <TurnoMini guardia={tarde} etiqueta="T" nombresPorId={nombresPorId} faltante={!esPasado} />
    </button>
  )
}

function TurnoMini({
  guardia,
  etiqueta,
  nombresPorId,
  faltante,
}: {
  guardia?: Guardia
  etiqueta: string
  nombresPorId: Map<string, string>
  faltante: boolean
}) {
  if (!guardia) {
    return (
      <span className={cn('truncate text-[10px] leading-tight', faltante ? 'text-red-500' : 'text-slate-400')}>
        {etiqueta}·—
      </span>
    )
  }
  const nombre = nombresPorId.get(guardia.asesor_id)
  return (
    <span className="truncate text-[10px] leading-tight text-slate-600">
      {etiqueta}·{nombre ? nombreCorto(nombre) : '?'}
    </span>
  )
}
