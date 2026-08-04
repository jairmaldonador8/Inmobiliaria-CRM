import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { KanbanLeads, type LeadKanban } from '@/components/leads/kanban-leads'
import { SheetCapturaRapida } from '@/components/leads/sheet-captura-rapida'

type FilaLead = {
  id: string
  nombre: string
  fuente: string
  fuente_detalle: string | null
  etapa: string
  creado_en: string
  propiedad: { titulo: string } | null
}

/**
 * Kanban de leads del asesor. Todas las consultas van con el cliente de
 * SESIÓN: RLS limita automáticamente a los leads propios (y a los
 * seguimientos de esos leads) — sin filtrar por asesor_id a mano.
 */
export default async function PaginaLeadsAsesor() {
  await requireAsesor()
  const supabase = await createClient()

  const [{ data: leads, error }, { data: propiedades }] = await Promise.all([
    supabase
      .from('leads')
      .select(
        'id, nombre, fuente, fuente_detalle, etapa, creado_en, propiedad:propiedades(titulo)'
      )
      .eq('archivado', false)
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
    propiedad_titulo: lead.propiedad?.titulo ?? null,
    ultimo_seguimiento: ultimoSeguimiento.get(lead.id) ?? null,
  }))

  const opcionesPropiedad = (propiedades ?? []).map((p) => ({ id: p.id, titulo: p.titulo }))

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Leads</h1>
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
