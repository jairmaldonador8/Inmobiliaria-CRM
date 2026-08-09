import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Guardia } from '@/lib/guardias/consultas'
import {
  horaCorta,
  mesRelativo,
  nombreCorto,
  RE_MES,
  semanasDelMes,
  ultimoDiaDelMes,
} from '@/lib/guardias/calendario'
import { fechaHoyMonterrey } from '@/lib/fechas/monterrey'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const NOMBRE_MES = new Intl.DateTimeFormat('es-MX', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * Rol de guardias del mes, SOLO lectura, para asesores (spec Fase B). La
 * lectura de `guardias` va con el cliente de sesión (RLS: select para todo
 * autenticado); los NOMBRES de los compañeros salen del admin client porque
 * la RLS de `usuarios` solo deja leer la fila propia — aquí únicamente se
 * expone user_id → nombre, que es exactamente lo que el rol debe mostrar.
 */
export default async function PaginaRolGuardias({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const usuario = await requireAsesor()
  const { mes: mesParam } = await searchParams
  const hoy = fechaHoyMonterrey()
  const mes = mesParam && RE_MES.test(mesParam) ? mesParam : hoy.slice(0, 7)

  const supabase = await createClient()
  const { data: guardias } = await supabase
    .from('guardias')
    .select('id, fecha, turno, hora_inicio, hora_fin, asesor_id')
    .gte('fecha', `${mes}-01`)
    .lte('fecha', ultimoDiaDelMes(mes))
    .order('fecha')

  const rol = (guardias ?? []) as Guardia[]

  const idsAsesores = [...new Set(rol.map((g) => g.asesor_id))]
  const nombres = new Map<string, string>()
  if (idsAsesores.length > 0) {
    const { data: usuarios } = await createAdminClient()
      .from('usuarios')
      .select('user_id, nombre')
      .in('user_id', idsAsesores)
    for (const u of usuarios ?? []) nombres.set(u.user_id, u.nombre)
  }

  const porDiaTurno = new Map(rol.map((g) => [`${g.fecha}:${g.turno}`, g]))
  const semanas = semanasDelMes(mes)
  const tituloMes = NOMBRE_MES.format(new Date(`${mes}-01T00:00:00Z`))

  const misGuardias = rol.filter((g) => g.asesor_id === usuario.user_id && g.fecha >= hoy)

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link
          href="/asesor"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Volver al inicio
        </Link>
      </div>

      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Rol de guardias</h1>
        <p className="mt-1 text-sm text-slate-500">
          Quién cubre cada turno — lo captura la dirección
        </p>
      </header>

      <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold capitalize text-slate-900">{tituloMes}</h2>
          <div className="flex items-center gap-1">
            <Link
              href={`/asesor/guardias?mes=${mesRelativo(mes, -1)}`}
              aria-label="Mes anterior"
              className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <Link
              href={`/asesor/guardias?mes=${mesRelativo(mes, 1)}`}
              aria-label="Mes siguiente"
              className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {DIAS_SEMANA.map((d, i) => (
            <span key={`${d}-${i}`} className="py-1 text-[11px] font-medium text-slate-500">
              {d}
            </span>
          ))}
          {semanas.flat().map((fecha, i) =>
            fecha === null ? (
              <span key={`vacio-${i}`} aria-hidden />
            ) : (
              <div
                key={fecha}
                className={cn(
                  'flex min-h-14 flex-col items-stretch gap-0.5 rounded-lg border p-1 text-left',
                  fecha < hoy ? 'border-transparent bg-slate-50 opacity-60' : 'border-slate-200 bg-white',
                  fecha === hoy && 'ring-2 ring-slate-900 ring-offset-1'
                )}
              >
                <span className="text-[11px] font-semibold text-slate-900">
                  {Number(fecha.slice(-2))}
                </span>
                {(['manana', 'tarde'] as const).map((turno) => {
                  const g = porDiaTurno.get(`${fecha}:${turno}`)
                  const mia = g?.asesor_id === usuario.user_id
                  return (
                    <span
                      key={turno}
                      className={cn(
                        'truncate rounded text-[10px] leading-tight',
                        mia ? 'bg-slate-900 px-1 font-semibold text-white' : 'text-slate-600'
                      )}
                    >
                      {turno === 'manana' ? 'M' : 'T'}·
                      {g ? nombreCorto(nombres.get(g.asesor_id) ?? '?') : '—'}
                    </span>
                  )
                })}
              </div>
            )
          )}
        </div>
      </div>

      {misGuardias.length > 0 && (
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Tus próximas guardias</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {misGuardias.slice(0, 8).map((g) => (
              <li key={g.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="text-slate-900">
                  {new Intl.DateTimeFormat('es-MX', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  }).format(new Date(`${g.fecha}T00:00:00Z`))}
                </span>
                <span className="text-slate-500">
                  {horaCorta(g.hora_inicio)}–{horaCorta(g.hora_fin)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
