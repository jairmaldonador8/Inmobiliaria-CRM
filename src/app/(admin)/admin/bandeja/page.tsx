import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Building2, ChevronRight } from 'lucide-react'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { leadsBandeja } from '@/lib/leads/consultas'
import { ETAPAS_CERRADAS } from '@/lib/leads/formato'
import { esUrgente } from '@/lib/leads/urgencia'
import { cargaAsesores, entradaSemana } from '@/lib/bandeja/ascua'
import { guardiaActiva } from '@/lib/guardias/consultas'
import { medianaPrimeraRespuesta7d } from '@/lib/dashboard/consultas'
import { cn } from '@/lib/utils'
import { EtiquetaClasificacionEB } from '@/components/leads/etiqueta-clasificacion-eb'
import { HojaAsignarLead } from '@/components/leads/hoja-asignar-lead'
import { DialogRegistrarLead } from '@/components/leads/dialog-registrar-lead'
import { PanelAscua } from '@/components/bandeja/panel-ascua'
import FondoFintech from '@/components/fintech/fondo-fintech'
import TarjetaGlass from '@/components/fintech/tarjeta-glass'

// NOTA: el contador de bandeja en el sidebar (chip junto a «Bandeja» en
// nav-admin) queda diferido: requiere pasar el conteo desde el layout de
// servidor al nav de cliente. Por ahora el conteo vive en este encabezado.

export default async function PaginaBandeja() {
  await requireAdmin()
  const supabase = createAdminClient()

  // Un solo instante para toda la pantalla: si cada banda leyera su propio
  // Date.now(), un lead podría caer en dos bandas distintas del mismo render.
  const ahora = new Date()

  const [leads, { data: asesores }, { data: propiedades }] = await Promise.all([
    leadsBandeja(),
    supabase
      .from('usuarios')
      .select('user_id, nombre')
      .eq('rol', 'asesor')
      .eq('activo', true)
      .order('nombre', { ascending: true }),
    supabase
      .from('propiedades')
      .select('id, titulo')
      .eq('activa', true)
      .order('titulo', { ascending: true }),
  ])

  const opcionesAsesor = (asesores ?? []).map((a) => ({ userId: a.user_id, nombre: a.nombre }))
  const opcionesPropiedad = (propiedades ?? []).map((p) => ({ id: p.id, titulo: p.titulo }))

  // Datos del panel «Ascua» (solo escritorio). Best-effort: si alguna de
  // estas falla, la bandeja sigue sirviendo para lo único que no puede
  // faltar, que es asignar. La mediana ya devuelve null cuando no alcanza.
  const sesion = await createClient()
  const [carga, semana, medianaMin, guardia] = await Promise.all([
    cargaAsesores(supabase, ETAPAS_CERRADAS).catch((): Awaited<
      ReturnType<typeof cargaAsesores>
    > => []),
    entradaSemana(supabase, ahora).catch(() => ({ dias: [], bloques: [] })),
    medianaPrimeraRespuesta7d(sesion, ahora).catch((): number | null => null),
    guardiaActiva(supabase, ahora).catch(() => null),
  ])

  const nombrePorUserId = new Map(opcionesAsesor.map((a) => [a.userId, a.nombre]))
  const guardiaPanel = guardia
    ? {
        nombre: nombrePorUserId.get(guardia.asesor_id) ?? 'Asesor de guardia',
        hasta: guardia.hora_fin.slice(0, 5),
      }
    : null

  return (
    <>
      {/* Móvil — estética «Fintech Muro» (Task FM7) */}
      <div className="-mx-4 -mt-6 -mb-28 lg:hidden">
        <FondoFintech className="px-4 pt-6 pb-32">
          <div className="flex flex-col gap-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight text-[#141414]">Bandeja</h1>
                <p className="text-sm text-slate-500">
                  {leads.length === 0
                    ? 'Sin leads pendientes de asignar'
                    : `${leads.length} lead${leads.length === 1 ? '' : 's'} esperando asignación`}
                </p>
              </div>
              <DialogRegistrarLead asesores={opcionesAsesor} propiedades={opcionesPropiedad} />
            </header>

            {leads.length === 0 ? (
              <TarjetaGlass className="flex min-h-44 flex-col items-center justify-center gap-1 text-center">
                <p className="text-2xl" aria-hidden>
                  🎉
                </p>
                <p className="text-sm text-slate-500">Sin leads pendientes</p>
              </TarjetaGlass>
            ) : (
              <ul className="flex flex-col gap-3">
                {leads.map((lead) => {
                  const espera = formatDistanceToNow(new Date(lead.creado_en), {
                    addSuffix: true,
                    locale: es,
                  })
                  const urgente = esUrgente(lead.creado_en)
                  return (
                    <li key={lead.id}>
                      <TarjetaGlass className="flex flex-col gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate font-semibold text-[#141414]">{lead.nombre}</p>
                            <EtiquetaClasificacionEB clasificacion={lead.clasificacion_eb} />
                          </div>
                          {lead.propiedad ? (
                            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-slate-500">
                              <Building2 aria-hidden className="size-3.5 shrink-0" />
                              <span className="truncate">{lead.propiedad.titulo}</span>
                            </p>
                          ) : lead.zona_interes ? (
                            <p className="mt-0.5 truncate text-sm text-slate-500">
                              Zona de interés: {lead.zona_interes}
                            </p>
                          ) : null}
                          <span
                            suppressHydrationWarning
                            className={cn(
                              'mt-1 inline-block text-xs',
                              urgente ? 'font-semibold text-[#141414]' : 'text-slate-500'
                            )}
                          >
                            {espera}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <Link
                            href={`/admin/leads/${lead.id}`}
                            className="inline-flex items-center gap-0.5 text-sm font-medium text-[#141414] underline-offset-4 hover:underline"
                          >
                            Ver
                            <ChevronRight aria-hidden className="size-3.5" />
                          </Link>
                          <HojaAsignarLead
                            leadId={lead.id}
                            leadNombre={lead.nombre}
                            asesores={opcionesAsesor}
                          />
                        </div>
                      </TarjetaGlass>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </FondoFintech>
      </div>

      {/* Escritorio — estilo «Ascua» (aprobado 2026-08-12). El móvil se queda
          con la estética «Fintech Muro» de arriba: son dos lenguajes distintos
          a propósito hasta que se decida migrar también el móvil. */}
      <div className="hidden lg:-mx-10 lg:-my-8 lg:block">
        <PanelAscua
          leads={leads}
          asesores={opcionesAsesor}
          carga={carga}
          semana={semana}
          medianaMin={medianaMin}
          guardia={guardiaPanel}
          ahora={ahora.getTime()}
          registrarLead={
            <DialogRegistrarLead asesores={opcionesAsesor} propiedades={opcionesPropiedad} />
          }
        />
      </div>
    </>
  )
}
