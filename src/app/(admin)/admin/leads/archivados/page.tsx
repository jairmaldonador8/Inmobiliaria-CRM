import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { leadsArchivados } from '@/lib/leads/consultas'
import {
  claseBadgeEtapa,
  etiquetaEtapa,
  etiquetaFuenteConDetalle,
  formatearTelefono,
} from '@/lib/leads/formato'
import { Badge } from '@/components/ui/badge'
import { TabsLeadsAdmin } from '@/components/leads/tabs-leads-admin'
import { AccionesLeadArchivado } from '@/components/leads/acciones-lead-archivado'

/**
 * Papelera de leads (2026-08-19). Aquí caen los leads que un admin eliminó
 * desde su detalle: siguen en la base pero fuera de TODA vista de trabajo.
 *
 * Es la única pantalla que los muestra, y la única puerta al borrado
 * definitivo — que exige haber pasado antes por aquí a propósito.
 *
 * No enlaza al detalle del lead: `/admin/leads/[id]` filtra
 * `archivado = false` y daría 404. Lo necesario para reconocerlo (teléfono,
 * asesor, propiedad, etapa en la que se quedó) se pinta en la tarjeta.
 */
export default async function PaginaLeadsArchivados() {
  await requireAdmin()
  const leads = await leadsArchivados()

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Papelera</h1>
        <p className="text-sm text-slate-500">
          {leads.length} lead{leads.length === 1 ? '' : 's'} fuera de circulación: los que has
          eliminado y los que ya estaban archivados de antes. Restaura el que se haya ido por
          error; borra definitivamente los de prueba.
        </p>
      </header>

      <TabsLeadsAdmin activa="archivados" />

      {leads.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center">
          <Trash2 aria-hidden className="size-6 text-slate-400" />
          <p className="text-sm text-slate-500">
            La papelera está vacía. Los leads que elimines desde su hoja llegan aquí.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {leads.map((lead) => (
            <li
              key={lead.id}
              className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{lead.nombre}</span>
                  <Badge className={claseBadgeEtapa(lead.etapa)}>
                    {etiquetaEtapa(lead.etapa)}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  {formatearTelefono(lead.telefono) || 'Sin teléfono'} ·{' '}
                  {etiquetaFuenteConDetalle(lead.fuente, lead.fuente_detalle)} ·{' '}
                  {lead.asesor?.nombre ?? 'Sin asesor'}
                  {lead.propiedad ? <> · {lead.propiedad.titulo}</> : null}
                </p>
                <p suppressHydrationWarning className="text-xs text-slate-400">
                  {lead.archivado_en ? (
                    <>
                      Eliminado{' '}
                      {formatDistanceToNow(new Date(lead.archivado_en), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </>
                  ) : (
                    <>
                      Archivado de antes · entró{' '}
                      {formatDistanceToNow(new Date(lead.creado_en), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </>
                  )}
                </p>
              </div>

              <AccionesLeadArchivado
                leadId={lead.id}
                nombre={lead.nombre}
                tieneOperacion={lead.tieneOperacion}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
