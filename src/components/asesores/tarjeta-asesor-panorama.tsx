import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlarmClock, ChevronRight, PhoneOff, Snowflake, Trophy } from 'lucide-react'

import type { FilaPanorama } from '@/lib/asesores/panorama'
import { formatearTelefono } from '@/lib/leads/formato'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { BarraPipeline } from '@/components/asesores/barra-pipeline'
import { BarraVida } from '@/components/asesores/barra-vida'
import { MenuAccionesAsesor } from '@/components/asesores/menu-acciones-asesor'

/**
 * Las tres colas que la dirección tiene que poder ver sin abrir nada.
 * Se pintan solo cuando hay algo: una tarjeta sin chips es una tarjeta en paz.
 */
const COLAS = [
  {
    clave: 'sinContactar' as const,
    Icono: PhoneOff,
    singular: 'sin contactar',
    plural: 'sin contactar',
    clase: 'bg-red-50 text-red-700 ring-red-200',
  },
  {
    clave: 'frios' as const,
    Icono: Snowflake,
    singular: 'lead frío',
    plural: 'leads fríos',
    clase: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  {
    clave: 'recordatoriosVencidos' as const,
    Icono: AlarmClock,
    singular: 'recordatorio vencido',
    plural: 'recordatorios vencidos',
    clase: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
]

/**
 * Un asesor visto por la dirección: qué carga, cómo está de vivo su
 * pipeline y qué tiene pendiente de atender.
 *
 * La tarjeta entera NO es un link: dentro viven el menú de acciones y, si
 * hiciera falta, más controles. El link explícito al apartado del asesor va
 * al pie, que además dice a dónde lleva.
 */
export function TarjetaAsesorPanorama({ fila }: { fila: FilaPanorama }) {
  const colas = COLAS.map((cola) => ({ ...cola, cantidad: fila[cola.clave] })).filter(
    (cola) => cola.cantidad > 0
  )

  return (
    <article
      className={cn(
        'flex flex-col gap-4 rounded-xl bg-white p-4 ring-1 ring-slate-200',
        !fila.activo && 'opacity-60'
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/asesores/${fila.userId}`}
              className="truncate font-medium text-slate-900 underline-offset-4 hover:underline"
            >
              {fila.nombre}
            </Link>
            {!fila.activo && <Badge variant="outline">Inactivo</Badge>}
            {fila.rol === 'admin' && <Badge variant="outline">Admin</Badge>}
            {fila.activo && !fila.tienePush && (
              <Badge className="bg-amber-100 text-amber-700">Sin notificaciones</Badge>
            )}
          </div>
          <p className="truncate text-xs text-slate-500">
            {fila.email}
            {fila.telefono ? ` · ${formatearTelefono(fila.telefono)}` : ''}
          </p>
          <p suppressHydrationWarning className="text-xs text-slate-400">
            {fila.ultimaActividad
              ? `Última actividad ${formatDistanceToNow(new Date(fila.ultimaActividad), {
                  addSuffix: true,
                  locale: es,
                })}`
              : 'Sin actividad registrada todavía'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className="text-2xl leading-none font-semibold text-slate-900">{fila.activos}</p>
            <p className="text-[11px] text-slate-500">activos</p>
          </div>
          {/* Una cuenta admin no se desactiva desde aquí: le quitaría todo el
              acceso, no solo su faceta de asesor. */}
          {fila.rol === 'asesor' && (
            <MenuAccionesAsesor
              asesor={{
                userId: fila.userId,
                nombre: fila.nombre,
                telefono: fila.telefono,
                activo: fila.activo,
              }}
            />
          )}
        </div>
      </header>

      {colas.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {colas.map(({ clave, Icono, singular, plural, clase, cantidad }) => (
            <li
              key={clave}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1',
                clase
              )}
            >
              <Icono aria-hidden className="size-3.5" />
              {cantidad} {cantidad === 1 ? singular : plural}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">Sin pendientes por atender. Todo al día.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] tracking-wide text-slate-500 uppercase">En qué va</p>
          <BarraPipeline className="mt-2" segmentos={fila.pipeline} />
        </div>
        <div>
          <p className="text-[11px] tracking-wide text-slate-500 uppercase">Nivel de vida</p>
          <BarraVida className="mt-2" vida={fila.vida} />
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Trophy aria-hidden className="size-3.5 text-slate-400" />
          {fila.ganadosMes} cerrado{fila.ganadosMes === 1 ? '' : 's'} este mes
        </p>
        <Link
          href={`/admin/asesores/${fila.userId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 underline-offset-4 hover:underline"
        >
          Ver su pipeline
          <ChevronRight aria-hidden className="size-3.5" />
        </Link>
      </footer>
    </article>
  )
}
