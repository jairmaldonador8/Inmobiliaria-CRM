import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { leadsGlobal, type FiltrosLeads as Filtros } from '@/lib/leads/consultas'
import {
  actividadContacto7d,
  embudoPorEtapa,
  leadsPorFuente30d,
  medianaPrimeraRespuesta7d,
  type ConteoEtapa,
  type ConteoFuente,
} from '@/lib/dashboard/consultas'
import { PanelComoVanLeads } from '@/components/dashboard/panel-como-van-leads'
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
import { TabsLeadsAdmin } from '@/components/leads/tabs-leads-admin'

export default async function PaginaLeadsAdmin({
  searchParams,
}: {
  searchParams: Promise<Filtros>
}) {
  await requireAdmin()
  const filtros = await searchParams
  const supabase = createAdminClient()

  const [leads, { data: asesores }, embudo, medianaMin, fuentes, actividad] = await Promise.all([
    leadsGlobal(filtros),
    supabase
      .from('usuarios')
      .select('user_id, nombre, activo')
      .eq('rol', 'asesor')
      .order('nombre', { ascending: true }),
    // Métricas «Cómo van los leads»: best-effort, mismo criterio que el
    // resumen del dashboard — la lista de leads nunca se cae por ellas.
    embudoPorEtapa(supabase).catch((): ConteoEtapa[] => []),
    medianaPrimeraRespuesta7d(supabase).catch((): number | null => null),
    leadsPorFuente30d(supabase).catch((): ConteoFuente[] => []),
    actividadContacto7d(supabase).catch((): number[] => new Array(7).fill(0) as number[]),
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

      <PanelComoVanLeads
        variante="escritorio"
        metricas={{ embudo, medianaMin, fuentes, actividad }}
      />

      <TabsLeadsAdmin activa="todos" />

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
                      <Link
                        href={`/admin/leads/${lead.id}`}
                        className="font-medium text-slate-900 underline-offset-4 hover:underline"
                      >
                        {lead.nombre}
                      </Link>
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

          {/*
            Tarjetas — móvil.

            `min-w-0` en la tarjeta: es un item de rejilla, y un item de
            rejilla no baja de su tamaño mínimo automático. Como el título de
            la propiedad usa `truncate` (que incluye `whitespace-nowrap`), su
            ancho mínimo es la CADENA ENTERA, así que un título largo estiraba
            la columna y con ella la página. Medido en producción: 599px en
            una pantalla de 390 con «CASA VENTA EN LOS ÁNGELES BOSQUE
            RESIDENCIAL, VALLE ORIENTE». Con `min-w-0` el texto vuelve a
            recortarse, que es lo que `truncate` prometía.
          */}
          <div className="grid min-w-0 gap-3 lg:hidden">
            {leads.map((lead) => (
              <Link
                key={lead.id}
                href={`/admin/leads/${lead.id}`}
                className="flex min-w-0 flex-col gap-2 rounded-xl bg-white p-4 ring-1 ring-slate-200 transition-shadow hover:shadow-sm"
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
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
