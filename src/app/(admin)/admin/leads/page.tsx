import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { leadsGlobal, type FiltrosLeads as Filtros } from '@/lib/leads/consultas'
import {
  claseBadgeEtapa,
  etiquetaEtapa,
  etiquetaFuenteConDetalle,
  formatearTelefono,
} from '@/lib/leads/formato'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FiltrosLeads } from '@/components/leads/filtros-leads'

// NOTA: el link al detalle del lead (/asesor/leads/[id]) se omite aquí:
// esa ruta llega con la Task 16. Al existir, cada fila enlazará al detalle.

export default async function PaginaLeadsAdmin({
  searchParams,
}: {
  searchParams: Promise<Filtros>
}) {
  await requireAdmin()
  const filtros = await searchParams
  const supabase = createAdminClient()

  const [leads, { data: asesores }] = await Promise.all([
    leadsGlobal(filtros),
    supabase
      .from('usuarios')
      .select('user_id, nombre, activo')
      .eq('rol', 'asesor')
      .order('nombre', { ascending: true }),
  ])

  const opcionesAsesor = (asesores ?? [])
    .filter((a) => a.activo)
    .map((a) => ({ userId: a.user_id, nombre: a.nombre }))

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Leads</h1>
        <p className="text-sm text-slate-500">
          {leads.length} lead{leads.length === 1 ? '' : 's'}
        </p>
      </header>

      <FiltrosLeads asesores={opcionesAsesor} />

      {leads.length === 0 ? (
        <div className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60">
          <p className="text-sm text-slate-500">Sin leads con esos filtros</p>
        </div>
      ) : (
        <>
          {/* Tabla — escritorio */}
          <div className="hidden overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Asesor</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead>Propiedad</TableHead>
                  <TableHead>Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{lead.nombre}</p>
                      <p className="text-xs text-slate-500">{formatearTelefono(lead.telefono)}</p>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {lead.asesor?.nombre ?? <Badge variant="outline">Bandeja</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge className={claseBadgeEtapa(lead.etapa)}>
                        {etiquetaEtapa(lead.etapa)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {etiquetaFuenteConDetalle(lead.fuente, lead.fuente_detalle)}
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-slate-600">
                      {lead.propiedad?.titulo ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-slate-500">
                      {formatDistanceToNow(new Date(lead.creado_en), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Tarjetas — móvil */}
          <div className="grid gap-3 lg:hidden">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="flex flex-col gap-2 rounded-xl bg-white p-4 ring-1 ring-slate-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{lead.nombre}</p>
                    <p className="text-sm text-slate-500">{formatearTelefono(lead.telefono)}</p>
                  </div>
                  <Badge className={claseBadgeEtapa(lead.etapa)}>
                    {etiquetaEtapa(lead.etapa)}
                  </Badge>
                </div>
                {lead.propiedad ? (
                  <p className="truncate text-sm text-slate-500">{lead.propiedad.titulo}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{lead.asesor?.nombre ?? 'Bandeja'}</span>
                  <span>{etiquetaFuenteConDetalle(lead.fuente, lead.fuente_detalle)}</span>
                  <span>
                    {formatDistanceToNow(new Date(lead.creado_en), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
