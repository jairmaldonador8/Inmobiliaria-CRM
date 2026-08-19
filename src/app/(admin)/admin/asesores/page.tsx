import { AlarmClock, PhoneOff, Snowflake, UsersRound } from 'lucide-react'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { panoramaAsesores } from '@/lib/asesores/panorama'
import { DialogCrearAsesor } from '@/components/asesores/dialog-crear-asesor'
import { TarjetaAsesorPanorama } from '@/components/asesores/tarjeta-asesor-panorama'
import { BarraVida } from '@/components/asesores/barra-vida'

/**
 * Panorama de asesores (pedido de Jair, 2026-08-18): «ver qué están
 * trabajando, sus leads, un diagrama del nivel de vida de los leads, y si
 * hay prioridades por atender».
 *
 * Reemplaza a la tabla-directorio que había aquí: los datos de
 * administración (correo, teléfono, activo/inactivo, editar, desactivar)
 * siguen todos, pero dejaron de ser el tema — ahora el tema es el trabajo.
 *
 * El orden lo decide `construirPanorama`: arriba quien más cola tiene, y los
 * inactivos hasta abajo. Así la primera tarjeta siempre es la que hay que
 * mirar.
 */
export default async function PaginaAsesores() {
  await requireAdmin()
  const { filas, totales } = await panoramaAsesores()

  const resumen = [
    {
      etiqueta: 'Leads activos',
      valor: totales.activos,
      Icono: UsersRound,
      clase: 'text-slate-900',
    },
    {
      etiqueta: 'Sin contactar',
      valor: totales.sinContactar,
      Icono: PhoneOff,
      clase: totales.sinContactar > 0 ? 'text-red-600' : 'text-slate-900',
    },
    {
      etiqueta: 'Leads fríos',
      valor: totales.frios,
      Icono: Snowflake,
      clase: totales.frios > 0 ? 'text-amber-600' : 'text-slate-900',
    },
    {
      etiqueta: 'Recordatorios vencidos',
      valor: totales.recordatoriosVencidos,
      Icono: AlarmClock,
      clase: 'text-slate-900',
    },
  ]

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Asesores</h1>
          <p className="text-sm text-slate-500">
            {totales.asesoresActivos} trabajando · {totales.ganadosMes} cerrado
            {totales.ganadosMes === 1 ? '' : 's'} este mes
          </p>
        </div>
        <DialogCrearAsesor />
      </header>

      {filas.length === 0 ? (
        <div className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60">
          <p className="text-sm text-slate-500">Todavía no hay asesores registrados</p>
        </div>
      ) : (
        <>
          {/* Cómo está la agencia de un vistazo, antes de bajar asesor por asesor. */}
          <div className="flex flex-col gap-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {resumen.map(({ etiqueta, valor, Icono, clase }) => (
                <div key={etiqueta} className="flex flex-col gap-1">
                  <p className="flex items-center gap-1.5 text-[11px] tracking-wide text-slate-500 uppercase">
                    <Icono aria-hidden className="size-3.5" />
                    {etiqueta}
                  </p>
                  <p className={`text-2xl leading-none font-semibold ${clase}`}>{valor}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 pt-4">
              <p className="text-[11px] tracking-wide text-slate-500 uppercase">
                Nivel de vida de los leads de toda la agencia
              </p>
              <BarraVida className="mt-2" vida={totales.vida} />
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {filas.map((fila) => (
              <TarjetaAsesorPanorama key={fila.userId} fila={fila} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
