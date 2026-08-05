import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Building2, ChevronRight } from 'lucide-react'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { leadsBandeja } from '@/lib/leads/consultas'
import { etiquetaFuenteConDetalle, formatearTelefono } from '@/lib/leads/formato'
import { HORA_MS, esUrgente } from '@/lib/leads/urgencia'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { AsignarLead } from '@/components/leads/asignar-lead'
import { HojaAsignarLead } from '@/components/leads/hoja-asignar-lead'
import { DialogRegistrarLead } from '@/components/leads/dialog-registrar-lead'
import FondoFintech from '@/components/fintech/fondo-fintech'
import TarjetaGlass from '@/components/fintech/tarjeta-glass'

// NOTA: el contador de bandeja en el sidebar (chip junto a «Bandeja» en
// nav-admin) queda diferido: requiere pasar el conteo desde el layout de
// servidor al nav de cliente. Por ahora el conteo vive en este encabezado.

/**
 * Urgencia visual por tiempo de espera: verde < 1 h, ámbar 1–24 h,
 * rojo > 24 h (punto de color + texto «hace X»).
 *
 * `esUrgente` (móvil, ver src/lib/leads/urgencia.ts) comparte la misma
 * frontera de 24h — inclusiva, igual que el `horas < 24` de aquí abajo cae
 * a rojo en `horas === 24`.
 */
function urgencia(creadoEn: string): { punto: string; texto: string } {
  const horas = (Date.now() - new Date(creadoEn).getTime()) / HORA_MS
  if (horas < 1) return { punto: 'bg-emerald-500', texto: 'text-emerald-600' }
  if (horas < 24) return { punto: 'bg-amber-500', texto: 'text-amber-600' }
  return { punto: 'bg-red-500', texto: 'text-red-600' }
}

export default async function PaginaBandeja() {
  await requireAdmin()
  const supabase = createAdminClient()

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

  return (
    <>
      {/* Móvil — estética «Fintech Muro» (Task FM7) */}
      <div className="lg:hidden">
        <FondoFintech className="px-4 pt-6 pb-8">
          <div className="flex flex-col gap-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight text-[#221B14]">Bandeja</h1>
                <p className="text-sm text-[#8E7F68]">
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
                <p className="text-sm text-[#8E7F68]">Sin leads pendientes</p>
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
                          <p className="truncate font-semibold text-[#221B14]">{lead.nombre}</p>
                          {lead.propiedad ? (
                            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-[#8E7F68]">
                              <Building2 aria-hidden className="size-3.5 shrink-0" />
                              <span className="truncate">{lead.propiedad.titulo}</span>
                            </p>
                          ) : lead.zona_interes ? (
                            <p className="mt-0.5 truncate text-sm text-[#8E7F68]">
                              Zona de interés: {lead.zona_interes}
                            </p>
                          ) : null}
                          <span
                            suppressHydrationWarning
                            className={cn(
                              'mt-1 inline-block text-xs',
                              urgente ? 'font-semibold text-[#A34E28]' : 'text-[#8E7F68]'
                            )}
                          >
                            {espera}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <Link
                            href={`/admin/leads/${lead.id}`}
                            className="inline-flex items-center gap-0.5 text-sm font-medium text-[#6B4A33] underline-offset-4 hover:underline"
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

      {/* Escritorio — intacto */}
      <div className="hidden lg:block">
        <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bandeja</h1>
          <p className="text-sm text-slate-500">
            {leads.length === 0
              ? 'Sin leads pendientes de asignar'
              : `${leads.length} lead${leads.length === 1 ? '' : 's'} pendiente${leads.length === 1 ? '' : 's'} de asignar`}
          </p>
        </div>
        <DialogRegistrarLead asesores={opcionesAsesor} propiedades={opcionesPropiedad} />
      </header>

      {leads.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-white/60">
          <p className="text-2xl" aria-hidden>
            🎉
          </p>
          <p className="text-sm text-slate-500">Sin leads pendientes</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {leads.map((lead) => {
            const { punto, texto } = urgencia(lead.creado_en)
            const espera = formatDistanceToNow(new Date(lead.creado_en), {
              addSuffix: true,
              locale: es,
            })
            return (
              <li
                key={lead.id}
                className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="font-medium text-slate-900 underline-offset-4 hover:underline"
                    >
                      {lead.nombre}
                    </Link>
                    <Badge variant="secondary">
                      {etiquetaFuenteConDetalle(lead.fuente, lead.fuente_detalle)}
                    </Badge>
                    <span className={`inline-flex items-center gap-1.5 text-xs ${texto}`}>
                      <span aria-hidden className={`size-2 rounded-full ${punto}`} />
                      {espera}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatearTelefono(lead.telefono)}
                    {lead.email ? <span className="text-slate-400"> · {lead.email}</span> : null}
                  </p>
                  {lead.propiedad ? (
                    <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-500">
                      <Building2 aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate">{lead.propiedad.titulo}</span>
                    </p>
                  ) : lead.zona_interes ? (
                    <p className="mt-1 truncate text-sm text-slate-500">
                      Zona de interés: {lead.zona_interes}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0">
                  <AsignarLead
                    leadId={lead.id}
                    leadNombre={lead.nombre}
                    asesores={opcionesAsesor}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
        </section>
      </div>
    </>
  )
}
