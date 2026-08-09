'use client'

/**
 * Panel «Leads en riesgo» del dashboard admin (Fase C): leads que cruzaron
 * el umbral del dueño (2h sin respuesta de nadie). Tres acciones por lead:
 * WhatsApp al asesor responsable (prellenado), reasignar inline (reusa
 * reasignarLead) y abrir el lead. Si no hay leads en riesgo, no se pinta.
 */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, MessageCircle, Siren, UserRoundPen } from 'lucide-react'
import { toast } from 'sonner'

import { reasignarLead } from '@/lib/leads/acciones'
import type { LeadEnRiesgo } from '@/lib/guardias/consultas'
import { cn } from '@/lib/utils'

interface AsesorOpcion {
  userId: string
  nombre: string
}

function tiempoLegible(minutos: number): string {
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return horas > 0 ? `${horas} h ${resto} min` : `${minutos} min`
}

export function PanelLeadsEnRiesgo({
  filas,
  asesores,
}: {
  filas: LeadEnRiesgo[]
  asesores: AsesorOpcion[]
}) {
  const router = useRouter()
  const [reasignando, startTransition] = useTransition()
  const [abiertoPara, setAbiertoPara] = useState<string | null>(null)

  if (filas.length === 0) return null

  function reasignar(leadId: string, nuevoAsesorId: string) {
    startTransition(async () => {
      const r = await reasignarLead(leadId, nuevoAsesorId)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success('Lead reasignado')
      setAbiertoPara(null)
      router.refresh()
    })
  }

  return (
    <section
      aria-label="Leads en riesgo"
      className="rounded-xl border border-red-200 bg-red-50/70 p-4"
    >
      <div className="flex items-center gap-2">
        <Siren aria-hidden className="size-4 text-red-600" />
        <h2 className="text-sm font-semibold text-red-900">Leads en riesgo</h2>
        <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
          {filas.length}
        </span>
      </div>
      <p className="mt-1 text-xs text-red-800/80">
        Más de 2 horas sin respuesta de nadie — decide el siguiente paso
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {filas.map((fila) => {
          const textoWhatsApp = `Hola ${fila.asesorNombre.split(' ')[0]}, el lead ${fila.leadNombre} lleva ${tiempoLegible(fila.minutosEsperando)} sin respuesta en el CRM. ¿Todo bien? ¿Lo puedes atender o lo reasigno?`
          return (
            <li key={fila.leadId} className="rounded-lg bg-white p-3 ring-1 ring-red-200">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-900">{fila.leadNombre}</p>
                <span className="shrink-0 text-xs font-semibold text-red-600">
                  {tiempoLegible(fila.minutosEsperando)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Responsable: {fila.asesorNombre}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {fila.asesorTelefono ? (
                  <a
                    href={`https://wa.me/${fila.asesorTelefono.replace(/\D/g, '')}?text=${encodeURIComponent(textoWhatsApp)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                  >
                    <MessageCircle aria-hidden className="size-3.5" />
                    WhatsApp al asesor
                  </a>
                ) : (
                  <span className="inline-flex min-h-9 items-center rounded-full bg-slate-100 px-3 text-xs text-slate-400">
                    Asesor sin teléfono
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setAbiertoPara(abiertoPara === fila.leadId ? null : fila.leadId)}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors',
                    abiertoPara === fila.leadId
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  )}
                >
                  <UserRoundPen aria-hidden className="size-3.5" />
                  Reasignar
                </button>

                <Link
                  href={`/admin/leads/${fila.leadId}`}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Ver lead
                  <ChevronRight aria-hidden className="size-3.5" />
                </Link>
              </div>

              {abiertoPara === fila.leadId && (
                <div className="mt-2">
                  <select
                    defaultValue=""
                    disabled={reasignando}
                    onChange={(e) => e.target.value && reasignar(fila.leadId, e.target.value)}
                    className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:opacity-60"
                  >
                    <option value="" disabled>
                      Elegir nuevo asesor…
                    </option>
                    {asesores
                      .filter((a) => a.userId !== fila.asesorId)
                      .map((a) => (
                        <option key={a.userId} value={a.userId}>
                          {a.nombre}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
