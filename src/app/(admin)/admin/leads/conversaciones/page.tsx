import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { MessageCircle, MessagesSquare, Phone } from 'lucide-react'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { leadsEnConversacion } from '@/lib/leads/consultas'
import { claseBadgeEtapa, etiquetaEtapa } from '@/lib/leads/formato'
import { esSinRespuesta } from '@/lib/contactos/formato'
import { Badge } from '@/components/ui/badge'
import { TabsLeadsAdmin } from '@/components/leads/tabs-leads-admin'

/**
 * Etiquetas del desenlace en TERCERA persona: las de contactos/formato son
 * en primera («Me contestó») porque las lee quien reportó; aquí las lee la
 * dirección hablando de la conversación de alguien más.
 */
const DESENLACE_TERCERA: Record<string, string> = {
  pendiente: 'Sin reportar',
  contesto: 'Contestó',
  no_contesto: 'No contestó',
  cita: 'Cita agendada',
  no_interesa: 'No le interesa',
  sin_reporte: 'Nunca se reportó',
}

function hace(fecha: string): string {
  return formatDistanceToNow(new Date(fecha), { addSuffix: true, locale: es })
}

/**
 * Vista «En conversación» (pedido de Jair 2026-08-17): con quién ya se
 * habló y cómo va el tema — el lugar donde reaparecen los leads que salen
 * de «por contestar» al recibir su primera atención.
 */
export default async function PaginaEnConversacion() {
  await requireAdmin()
  const leads = await leadsEnConversacion()

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">En conversación</h1>
        <p className="text-sm text-slate-500">
          {leads.length} lead{leads.length === 1 ? '' : 's'} con conversación viva, la más
          reciente primero
        </p>
      </header>

      <TabsLeadsAdmin activa="conversaciones" />

      {leads.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center">
          <MessagesSquare aria-hidden className="size-6 text-slate-400" />
          <p className="text-sm text-slate-500">
            Todavía no hay leads en conversación. En cuanto alguien conteste a un lead, aparece
            aquí.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {leads.map((lead) => {
            const c = lead.ultimoContacto
            const s = lead.ultimoSeguimiento
            const esperando = c ? esSinRespuesta(c.resultado) : false
            return (
              <li key={lead.id}>
                <Link
                  href={`/admin/leads/${lead.id}`}
                  className="flex flex-col gap-2.5 rounded-xl bg-white p-4 ring-1 ring-slate-200 transition-shadow hover:shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{lead.nombre}</span>
                    <Badge className={claseBadgeEtapa(lead.etapa)}>
                      {etiquetaEtapa(lead.etapa)}
                    </Badge>
                    {lead.ultimaActividad ? (
                      <span suppressHydrationWarning className="ml-auto text-xs text-slate-400">
                        {hace(lead.ultimaActividad)}
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-slate-500">
                    {lead.asesor?.nombre ?? 'Sin asesor'}
                    {lead.propiedad ? <> · {lead.propiedad.titulo}</> : null}
                  </p>

                  {c ? (
                    <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                      {c.canal === 'llamada' ? (
                        <Phone aria-hidden className="size-4 shrink-0 text-slate-400" />
                      ) : (
                        <MessageCircle aria-hidden className="size-4 shrink-0 text-slate-400" />
                      )}
                      <span>
                        {c.canal === 'llamada' ? 'Llamada' : 'WhatsApp'}
                        {c.autorNombre ? ` de ${c.autorNombre}` : ''}
                      </span>
                      <Badge variant={esperando ? 'outline' : 'secondary'}>
                        {DESENLACE_TERCERA[c.resultado] ?? c.resultado}
                      </Badge>
                    </p>
                  ) : (
                    <p className="text-sm text-slate-400">
                      Sin contacto registrado desde la app
                    </p>
                  )}

                  {s ? (
                    <p className="line-clamp-2 text-sm text-slate-500">
                      «{s.nota}»{s.autorNombre ? ` — ${s.autorNombre}` : ''}
                    </p>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
