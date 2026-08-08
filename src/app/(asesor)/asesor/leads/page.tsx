import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { KanbanLeads, type LeadKanban } from '@/components/leads/kanban-leads'
import { SheetCapturaRapida } from '@/components/leads/sheet-captura-rapida'
import { ETAPAS_CERRADAS, claseBadgeEtapa, etiquetaEtapa, formatearTelefono } from '@/lib/leads/formato'
import { Badge } from '@/components/ui/badge'
import { BotonReactivarLead } from '@/components/leads/boton-reactivar-lead'
import type { ClasificacionLeadEB } from '@/lib/easybroker/mapeo'

type FilaLead = {
  id: string
  nombre: string
  fuente: string
  fuente_detalle: string | null
  etapa: string
  creado_en: string
  clasificacion_eb: ClasificacionLeadEB | null
  propiedad: { titulo: string } | null
}

type FilaLeadCerrado = {
  id: string
  nombre: string
  telefono: string | null
  etapa: string
  creado_en: string
  propiedad: { titulo: string } | null
}

/**
 * Lista de leads cerrados (cerrado_ganado / cerrado_perdido) del asesor. Al
 * sacar esos dos estados del kanban (Task «Reducir el pipeline a 5 etapas»)
 * dejaban de ser consultables desde /asesor/leads — esta vista, detrás de
 * `?vista=cerrados`, es esa ruta de vuelta. Cliente de sesión: RLS ya acota
 * a los leads propios.
 */
async function ListaLeadsCerrados({ asesorId }: { asesorId: string }) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('leads')
    .select('id, nombre, telefono, etapa, creado_en, propiedad:propiedades(titulo)')
    .eq('asesor_id', asesorId)
    .eq('archivado', false)
    .in('etapa', ETAPAS_CERRADAS)
    .order('creado_en', { ascending: false })

  if (error) {
    throw new Error(`No se pudieron cargar los leads cerrados: ${error.message}`)
  }
  const filas = (data ?? []) as unknown as FilaLeadCerrado[]

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Leads cerrados</h1>
          <Link
            href="/asesor/leads"
            className="text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline"
          >
            Volver al pipeline
          </Link>
        </div>
        <p className="text-sm text-slate-500">
          {filas.length === 0
            ? 'Aún no tienes leads cerrados'
            : `${filas.length} lead${filas.length === 1 ? '' : 's'} cerrado${filas.length === 1 ? '' : 's'}`}
        </p>
      </header>

      {filas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-2 py-8 text-center text-sm text-slate-400">
          Sin leads cerrados
        </p>
      ) : (
        <ul className="grid gap-3">
          {filas.map((lead) => (
            <li key={lead.id}>
              {/*
                La tarjeta NO es un <Link> envolvente: el botón de reactivar
                vive dentro y un <button> anidado en un <a> es HTML inválido
                (y el clic se pelearía entre navegar y abrir el diálogo). El
                enlace queda sobre el nombre, que es lo que uno toca para
                abrir la ficha.
              */}
              <div className="flex flex-col gap-2 rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/asesor/leads/${lead.id}`}
                      className="truncate font-medium text-slate-900 underline-offset-4 hover:underline"
                    >
                      {lead.nombre}
                    </Link>
                    <p className="text-sm text-slate-500">{formatearTelefono(lead.telefono)}</p>
                  </div>
                  <Badge className={claseBadgeEtapa(lead.etapa)}>{etiquetaEtapa(lead.etapa)}</Badge>
                </div>
                {lead.propiedad ? (
                  <p className="truncate text-sm text-slate-500">{lead.propiedad.titulo}</p>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <span suppressHydrationWarning className="text-xs text-slate-400">
                    {formatDistanceToNow(new Date(lead.creado_en), { addSuffix: true, locale: es })}
                  </span>
                  {/* Solo los perdidos se reactivan; un ganado no «revive». */}
                  {lead.etapa === 'cerrado_perdido' ? (
                    <BotonReactivarLead leadId={lead.id} nombre={lead.nombre} />
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Kanban de leads del asesor. Todas las consultas van con el cliente de
 * SESIÓN: RLS limita a los leads propios (y a los seguimientos de esos leads).
 *
 * El `.eq('asesor_id', ...)` explícito NO es redundante: un admin en la vista
 * de asesor pasa `private.is_admin()` y RLS no lo filtra — sin el acotado
 * vería el pipeline completo de la agencia en una pantalla que dice ser suya
 * (ver `requireAsesor()`).
 */
export default async function PaginaLeadsAsesor({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>
}) {
  const usuario = await requireAsesor()
  const { vista } = await searchParams
  if (vista === 'cerrados') {
    return <ListaLeadsCerrados asesorId={usuario.user_id} />
  }

  const supabase = await createClient()

  const [{ data: leads, error }, { data: propiedades }] = await Promise.all([
    supabase
      .from('leads')
      .select(
        'id, nombre, fuente, fuente_detalle, etapa, creado_en, clasificacion_eb, propiedad:propiedades(titulo)'
      )
      .eq('asesor_id', usuario.user_id)
      .eq('archivado', false)
      // Los cerrados ya no tienen columna en el kanban (ver
      // ListaLeadsCerrados más arriba para consultarlos) — se excluyen aquí
      // para que «N leads en tu pipeline» cuente solo trabajo activo.
      .not('etapa', 'in', `(${ETAPAS_CERRADAS.join(',')})`)
      .order('creado_en', { ascending: false }),
    supabase
      .from('propiedades')
      .select('id, titulo')
      .eq('activa', true)
      .order('titulo', { ascending: true }),
  ])

  if (error) {
    throw new Error(`No se pudieron cargar los leads: ${error.message}`)
  }
  const filas = (leads ?? []) as unknown as FilaLead[]

  // Último seguimiento por lead: segunda consulta simple (orden descendente)
  // agrupada aquí — el primer registro visto por lead es el más reciente.
  const ultimoSeguimiento = new Map<string, string>()
  if (filas.length > 0) {
    const { data: seguimientos } = await supabase
      .from('seguimientos')
      .select('lead_id, creado_en')
      .in(
        'lead_id',
        filas.map((l) => l.id)
      )
      .order('creado_en', { ascending: false })

    for (const s of seguimientos ?? []) {
      if (!ultimoSeguimiento.has(s.lead_id)) {
        ultimoSeguimiento.set(s.lead_id, s.creado_en)
      }
    }
  }

  const items: LeadKanban[] = filas.map((lead) => ({
    id: lead.id,
    nombre: lead.nombre,
    fuente: lead.fuente,
    fuente_detalle: lead.fuente_detalle,
    etapa: lead.etapa,
    creado_en: lead.creado_en,
    clasificacion_eb: lead.clasificacion_eb,
    propiedad_titulo: lead.propiedad?.titulo ?? null,
    ultimo_seguimiento: ultimoSeguimiento.get(lead.id) ?? null,
  }))

  const opcionesPropiedad = (propiedades ?? []).map((p) => ({ id: p.id, titulo: p.titulo }))

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Leads</h1>
          <Link
            href="/asesor/leads?vista=cerrados"
            className="text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline"
          >
            Ver cerrados
          </Link>
        </div>
        <p className="text-sm text-slate-500">
          {items.length === 0
            ? 'Aún no tienes leads asignados'
            : `${items.length} lead${items.length === 1 ? '' : 's'} en tu pipeline`}
        </p>
      </header>

      <KanbanLeads leads={items} />

      <SheetCapturaRapida propiedades={opcionesPropiedad} />
    </section>
  )
}
