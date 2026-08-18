import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlarmClock,
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Flame,
  MessageCircle,
  TrendingUp,
} from 'lucide-react'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { proximasVisitas } from '@/lib/dashboard/consultas'
import { leadsSinRespuesta } from '@/lib/contactos/consultas'
import {
  ETAPAS_CERRADAS,
  NOTA_CIERRE,
  claseBadgeEtapa,
  etiquetaEtapa,
} from '@/lib/leads/formato'
import { cn } from '@/lib/utils'
import { EtiquetaClasificacionEB } from '@/components/leads/etiqueta-clasificacion-eb'
import {
  fechaHoyMonterrey,
  formatearFechaHoraMonterrey,
  formatearHoraMonterrey,
} from '@/lib/fechas/monterrey'
import { recordatoriosParaHoy } from '@/lib/recordatorios/consultas'
import { estaVencido } from '@/lib/recordatorios/formato'
import { horaCorta } from '@/lib/guardias/calendario'
import {
  CardConexionGoogle,
  type AvisoConexionGoogle,
  type EstadoConexionGoogleUI,
} from '@/components/google/card-conexion'
import type { ClasificacionLeadEB } from '@/lib/easybroker/mapeo'

type LeadCola = {
  id: string
  nombre: string
  etapa: string
  creado_en: string
  asignado_en: string | null
  clasificacion_eb: ClasificacionLeadEB | null
  propiedad: { titulo: string } | null
}

const MAX_NECESITAN_SEGUIMIENTO = 10
const HORA_MS = 60 * 60 * 1000

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * Tarjeta compartida de las colas del inicio (ronda 2): además del nombre y
 * el subtítulo propio de cada cola, muestra la propiedad de interés, la etapa
 * y la clasificación — el asesor decide a quién atender sin abrir la ficha.
 */
function CardLeadCola({ lead, subtitulo }: { lead: LeadCola; subtitulo: string }) {
  return (
    <li>
      <Link
        href={`/asesor/leads/${lead.id}`}
        className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-xs ring-1 ring-slate-200 transition-colors active:bg-slate-50"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{lead.nombre}</p>
          {lead.propiedad ? (
            <p className="truncate text-xs text-slate-500">{lead.propiedad.titulo}</p>
          ) : null}
          <p suppressHydrationWarning className="mt-0.5 text-xs text-slate-500">
            {subtitulo}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[0.6875rem] font-medium',
                claseBadgeEtapa(lead.etapa)
              )}
            >
              {etiquetaEtapa(lead.etapa)}
            </span>
            <EtiquetaClasificacionEB
              clasificacion={lead.clasificacion_eb}
              className="px-1.5 text-[0.6875rem]"
            />
          </div>
        </div>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-400" />
      </Link>
    </li>
  )
}

type BusquedaPagina = { gcal?: string }

/**
 * «Cola del día» del asesor (Task 17): NO es un dashboard, es una lista de
 * trabajo (patrón Smart List) — qué atender primero, no cuánto se ha
 * vendido. Todo con el cliente de SESIÓN: RLS limita automáticamente a los
 * leads y seguimientos propios.
 *
 * `searchParams` (Task 7): trae `?gcal=conectado|cancelado|error` cuando el
 * asesor acaba de volver del callback OAuth de Google — se traduce a un
 * toast único en `CardConexionGoogle`.
 */
export default async function PaginaInicioAsesor({
  searchParams,
}: {
  searchParams: Promise<BusquedaPagina>
}) {
  const usuario = await requireAsesor()
  const supabase = await createClient()
  const { gcal } = await searchParams
  const avisoGoogle: AvisoConexionGoogle | null =
    gcal === 'conectado' || gcal === 'cancelado' || gcal === 'error' ? gcal : null

  // Instante "actual" calculado una sola vez (fuera de cualquier .filter/.map
  // de render, ver AGENTS.md de la tarea): evita repetir `Date.now()` en el
  // render, mismo espíritu que el `ahora` inyectable de consultas.ts.
  const ahora = new Date()

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const [
    { data: leadsData, error: errorLeads },
    { count: leadsNuevosMes },
    { data: cierresMes },
    visitasProximas,
    { data: conexionGoogle },
    { data: guardiasHoyData },
    paraHoy,
  ] = await Promise.all([
      // Leads activos (no cerrados, no archivados): base de ambas listas y
      // del chip «leads activos».
      // El acotado por asesor_id es explícito y NO redundante: un admin en la
      // vista de asesor pasa private.is_admin(), así que RLS no lo filtra y
      // vería los leads de toda la agencia (ver requireAsesor()).
      supabase
        .from('leads')
        .select(
          'id, nombre, etapa, creado_en, asignado_en, clasificacion_eb, propiedad:propiedades(titulo)'
        )
        .eq('asesor_id', usuario.user_id)
        .eq('archivado', false)
        .not('etapa', 'in', `(${ETAPAS_CERRADAS.join(',')})`)
        .order('creado_en', { ascending: false }),
      // Leads nuevos del mes (por fecha de alta, cualquier etapa).
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('asesor_id', usuario.user_id)
        .eq('archivado', false)
        .gte('creado_en', inicioMes.toISOString()),
      // Cierres «ganado» del mes: `leads` no tiene columna de fecha de
      // cierre — cambiarEtapa registra un seguimiento de sistema con texto
      // fijo (NOTA_CIERRE) al cerrar, y eso es lo que se cuenta aquí.
      supabase
        .from('seguimientos')
        .select('lead_id')
        .eq('autor_id', usuario.user_id)
        .eq('tipo', 'sistema')
        .eq('nota', NOTA_CIERRE.cerrado_ganado)
        .gte('creado_en', inicioMes.toISOString()),
      // Próximas visitas agendadas (futuras), para la sección homónima.
      proximasVisitas(supabase, 5, ahora, usuario.user_id),
      // Conexión de Google Calendar (Task 7): columnas explícitas, NUNCA
      // select('*') — la 0008 revocó el SELECT de tabla completo de
      // `authenticated` y solo regranteó estas columnas (refresh_token_cifrado
      // queda fuera, ver migración 0008/0010). maybeSingle() porque puede no
      // haber fila (asesor sin conectar todavía).
      supabase
        .from('google_conexiones')
        .select('google_email, estado')
        .eq('user_id', usuario.user_id)
        .maybeSingle(),
      // Guardias MÍAS de hoy (banner «Estás de guardia», Fase B). El acotado
      // por asesor_id es explícito por la misma razón que la query de leads:
      // un admin en vista de asesor pasa RLS y vería el rol completo.
      supabase
        .from('guardias')
        .select('turno, hora_inicio, hora_fin')
        .eq('fecha', fechaHoyMonterrey())
        .eq('asesor_id', usuario.user_id)
        .order('hora_inicio'),
      // Follow-ups pactados que vencen hoy (o ya vencieron): cola «Para hoy».
      recordatoriosParaHoy(supabase, usuario.user_id, ahora),
    ])

  if (errorLeads) {
    throw new Error(`No se pudo cargar la cola del día: ${errorLeads.message}`)
  }

  // `as unknown`: el join de propiedad viene tipado como arreglo por el
  // cliente genérico aunque la FK es singular (mismo caso que FilaLead en
  // /asesor/leads).
  const leads = (leadsData ?? []) as unknown as LeadCola[]

  const estadoGoogle: EstadoConexionGoogleUI = conexionGoogle
    ? (conexionGoogle.estado as EstadoConexionGoogleUI)
    : 'sin_conectar'

  // La integración solo se ofrece cuando la app OAuth ya existe en Google
  // Cloud. Mientras falte la credencial, la card se oculta en vez de mostrar
  // un botón que lleva a un error de Google.
  const googleConfigurado = Boolean(process.env.GOOGLE_CLIENT_ID)

  // Última ACTIVIDAD REAL del asesor por lead: mismo patrón que el kanban
  // (src/app/(asesor)/asesor/leads/page.tsx) — segunda consulta ordenada desc;
  // el primer registro visto por lead es el más reciente.
  //
  // Se excluye `tipo = 'sistema'` a propósito: asignar, tomar o reasignar un
  // lead registra un seguimiento de sistema (acciones.ts, sync.ts), y contarlo
  // aquí sacaba de «Atiende ahora» a TODO lead recién asignado en el mismo
  // instante de asignarlo — el bug que reportaron Renata y Arturo en el Live
  // test. Un seguimiento de sistema documenta al lead; no es atención.
  const ultimoSeguimiento = new Map<string, string>()
  // Contactos de WhatsApp de esos mismos leads: alimentan la lista «Sin
  // respuesta». Se declara fuera del `if` para que la derivación de abajo lo
  // vea aunque no haya leads.
  let contactos: { lead_id: string; resultado: string; creado_en: string }[] = []
  if (leads.length > 0) {
    const { data: seguimientos } = await supabase
      .from('seguimientos')
      .select('lead_id, creado_en')
      .in(
        'lead_id',
        leads.map((l) => l.id)
      )
      .neq('tipo', 'sistema')
      .order('creado_en', { ascending: false })

    for (const s of seguimientos ?? []) {
      if (!ultimoSeguimiento.has(s.lead_id)) {
        ultimoSeguimiento.set(s.lead_id, s.creado_en)
      }
    }

    const { data: datosContactos } = await supabase
      .from('contactos')
      .select('lead_id, resultado, creado_en')
      .in(
        'lead_id',
        leads.map((l) => l.id)
      )
    contactos = datosContactos ?? []
  }

  // Fecha del contacto más reciente por lead, para el subtítulo de las cards
  // de «Sin respuesta» (la consulta no viene ordenada: se toma el mayor).
  const ultimoContacto = new Map<string, string>()
  for (const contacto of contactos) {
    const previo = ultimoContacto.get(contacto.lead_id)
    if (!previo || new Date(contacto.creado_en) > new Date(previo)) {
      ultimoContacto.set(contacto.lead_id, contacto.creado_en)
    }
  }

  // «Atiende ahora»: asignados (asignado_en no nulo — un lead auto-capturado
  // por el asesor ya se considera atendido, ver acciones-asesor.ts) que
  // TODAVÍA no tienen actividad real del asesor (los seguimientos de sistema
  // no cuentan, ver arriba). Más antiguo asignado primero.
  //
  // Se excluyen los `clasificacion_eb === 'saliente'` (ver migración 0011 y
  // skill easybroker-api): esos NO son leads, son al revés — un asesor de
  // Montana preguntando por una propiedad ajena y el corredor de esa
  // agencia contestando. Contarlos aquí infla la cola de urgencia y las
  // métricas de "tiempo de respuesta" con algo que nunca requirió respuesta
  // nuestra. Siguen siendo visibles en /asesor/leads y en su ficha — solo
  // salen de las colas de urgencia. `clasificacion_eb == null` (no viene de
  // EasyBroker, o no se pudo clasificar) SÍ se incluye: no se penaliza al
  // lead por falta de dato.
  const atiendeAhora = leads
    .filter(
      (l) => l.asignado_en && !ultimoSeguimiento.has(l.id) && l.clasificacion_eb !== 'saliente'
    )
    .sort((a, b) => new Date(a.asignado_en!).getTime() - new Date(b.asignado_en!).getTime())

  // «Sin respuesta»: les mandaste WhatsApp y su contacto MÁS RECIENTE sigue
  // en `pendiente`/`no_contesto`. Cierra el hueco entre las otras dos colas:
  // en cuanto un lead recibe un seguimiento sale de «Atiende ahora» y todavía
  // no califica para «Necesitan seguimiento», así que quedaba invisible 24 h.
  // La regla vive en `leadsSinRespuesta` (pura, testeable) e incluye la misma
  // exclusión de `saliente`. Más antiguo primero: el que lleva más callado.
  const sinRespuesta = leadsSinRespuesta(leads, contactos).sort(
    (a, b) =>
      new Date(ultimoContacto.get(a.id)!).getTime() -
      new Date(ultimoContacto.get(b.id)!).getTime()
  )
  const idsSinRespuesta = new Set(sinRespuesta.map((l) => l.id))

  // «Necesitan seguimiento»: ya tuvieron contacto, pero el último fue hace
  // más de 24h. Más «abandonado» primero, tope de 10. Misma exclusión de
  // `saliente` que arriba, y por el mismo motivo. Se descartan además los que
  // ya salen en «Sin respuesta»: un lead no debe aparecer en dos colas.
  // («Atiende ahora» no necesita el filtro: un lead con contacto tiene
  // seguimiento por fuerza, así que nunca está ahí.)
  const necesitanSeguimiento = leads
    .filter((l) => {
      if (l.clasificacion_eb === 'saliente') return false
      if (idsSinRespuesta.has(l.id)) return false
      const ultimo = ultimoSeguimiento.get(l.id)
      return ultimo ? ahora.getTime() - new Date(ultimo).getTime() > 24 * HORA_MS : false
    })
    .sort(
      (a, b) =>
        new Date(ultimoSeguimiento.get(a.id)!).getTime() -
        new Date(ultimoSeguimiento.get(b.id)!).getTime()
    )
    .slice(0, MAX_NECESITAN_SEGUIMIENTO)

  const leadsActivos = leads.length
  const cerradosGanadosMes = new Set((cierresMes ?? []).map((c) => c.lead_id)).size

  const fechaHoy = capitalizar(format(ahora, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es }))

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Hola, {usuario.nombre.split(' ')[0]}
        </h1>
        <p suppressHydrationWarning className="text-sm text-slate-500">
          {fechaHoy}
        </p>
      </header>

      {(guardiasHoyData ?? []).length > 0 ? (
        <Link
          href="/asesor/guardias"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 transition-colors active:bg-amber-100"
        >
          <span className="flex items-center gap-2.5">
            <CalendarDays aria-hidden className="size-4 shrink-0 text-slate-500" />
            <span className="text-sm font-medium text-slate-900">
              Estás de guardia hoy{' '}
              {(guardiasHoyData ?? [])
                .map((g) => `${horaCorta(g.hora_inicio)}–${horaCorta(g.hora_fin)}`)
                .join(' y ')}
            </span>
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-500" />
        </Link>
      ) : (
        <Link
          href="/asesor/guardias"
          className="inline-flex items-center gap-1.5 self-start text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          <CalendarDays aria-hidden className="size-4" />
          Rol de guardias del mes
          <ChevronRight aria-hidden className="size-3.5" />
        </Link>
      )}

      {/* Para hoy: follow-ups pactados que vencen hoy (los vencidos, en rojo
          y primero — la consulta ya viene ordenada por fecha). No desaparecen
          solos: los resuelve la actividad real o el propio asesor. */}
      {paraHoy.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <AlarmClock aria-hidden className="size-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">Para hoy</h2>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              {paraHoy.length}
            </span>
          </div>
          <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3 xl:grid-cols-3">
            {paraHoy.map((recordatorio) => {
              const vencido = estaVencido(recordatorio.fecha_hora, ahora)
              return (
                <li key={recordatorio.id}>
                  <Link
                    href={`/asesor/leads/${recordatorio.lead_id}`}
                    className={
                      vencido
                        ? 'flex items-center justify-between gap-2 rounded-xl bg-red-50 p-3 shadow-xs ring-1 ring-red-200 transition-colors active:bg-red-100'
                        : 'flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-xs ring-1 ring-slate-200 transition-colors active:bg-slate-50'
                    }
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {recordatorio.lead?.nombre ?? 'Lead'}
                      </p>
                      {recordatorio.nota ? (
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {recordatorio.nota}
                        </p>
                      ) : null}
                    </div>
                    <span
                      suppressHydrationWarning
                      className={
                        vencido
                          ? 'shrink-0 text-xs font-semibold text-red-700'
                          : 'shrink-0 text-xs font-semibold text-slate-700'
                      }
                    >
                      {formatearHoraMonterrey(recordatorio.fecha_hora)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {/* Atiende ahora: nuevos sin atender */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Flame aria-hidden className="size-4 text-red-500" />
          <h2 className="text-sm font-semibold text-slate-900">Atiende ahora</h2>
          {atiendeAhora.length > 0 ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {atiendeAhora.length}
            </span>
          ) : null}
        </div>

        {atiendeAhora.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500 lg:max-w-sm">
            Sin leads nuevos pendientes. Todo al día
          </p>
        ) : (
          <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3 xl:grid-cols-3">
            {atiendeAhora.map((lead) => (
              <CardLeadCola
                key={lead.id}
                lead={lead}
                subtitulo={`Asignado ${formatDistanceToNow(new Date(lead.asignado_en!), {
                  addSuffix: true,
                  locale: es,
                })}`}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Sin respuesta: les escribiste por WhatsApp y no han contestado */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle aria-hidden className="size-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Sin respuesta</h2>
          {sinRespuesta.length > 0 ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {sinRespuesta.length}
            </span>
          ) : null}
        </div>

        {sinRespuesta.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500 lg:max-w-sm">
            Nadie te quedó a deber respuesta
          </p>
        ) : (
          <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3 xl:grid-cols-3">
            {sinRespuesta.map((lead) => (
              <CardLeadCola
                key={lead.id}
                lead={lead}
                subtitulo={`Le escribiste ${formatDistanceToNow(
                  new Date(ultimoContacto.get(lead.id)!),
                  { addSuffix: true, locale: es }
                )}`}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Necesitan seguimiento */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle aria-hidden className="size-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-900">Necesitan seguimiento</h2>
          {necesitanSeguimiento.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {necesitanSeguimiento.length}
            </span>
          ) : null}
        </div>

        {necesitanSeguimiento.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500 lg:max-w-sm">
            Ningún lead lleva más de 24 h sin seguimiento
          </p>
        ) : (
          <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3 xl:grid-cols-3">
            {necesitanSeguimiento.map((lead) => (
              <CardLeadCola
                key={lead.id}
                lead={lead}
                subtitulo={`Último contacto ${formatDistanceToNow(
                  new Date(ultimoSeguimiento.get(lead.id)!),
                  { addSuffix: true, locale: es }
                )}`}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Próximas visitas */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays aria-hidden className="size-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Próximas visitas</h2>
          {visitasProximas.length > 0 ? (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
              {visitasProximas.length}
            </span>
          ) : null}
        </div>

        {visitasProximas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500 lg:max-w-sm">
            Sin visitas agendadas
          </p>
        ) : (
          <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3 xl:grid-cols-3">
            {visitasProximas.map((visita) => (
              <li key={visita.id}>
                <Link
                  href={`/asesor/leads/${visita.leadId}`}
                  className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-xs ring-1 ring-sky-200 transition-colors active:bg-sky-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {visita.leadNombre}
                    </p>
                    <p suppressHydrationWarning className="mt-0.5 text-xs text-slate-500">
                      {formatearFechaHoraMonterrey(visita.fecha)}
                      {visita.propiedadTitulo ? ` · ${visita.propiedadTitulo}` : ''}
                    </p>
                  </div>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Google Calendar (Task 7). La card solo se muestra si la app OAuth ya
          está configurada: sin GOOGLE_CLIENT_ID el botón «Conectar» llevaría a
          una pantalla de error de Google. Así el resto del dashboard puede
          desplegarse antes de terminar el alta en Google Cloud. */}
      {googleConfigurado ? (
        <CardConexionGoogle
          estado={estadoGoogle}
          googleEmail={conexionGoogle?.google_email ?? null}
          aviso={avisoGoogle}
        />
      ) : null}

      {/* Mis números del mes */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp aria-hidden className="size-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Mis números del mes</h2>
        </div>
        {/* Cada cifra navega a los leads que la componen (pedido del Live
            test: «poder ver a los leads que se refiere»). */}
        <div className="grid grid-cols-3 gap-2 lg:max-w-xl lg:gap-3">
          <Link
            href="/asesor/leads"
            className="rounded-xl bg-white p-3 text-center shadow-xs ring-1 ring-slate-200 transition-colors active:bg-slate-50"
          >
            <p className="text-xl font-semibold tracking-tight text-slate-900">{leadsActivos}</p>
            <p className="mt-0.5 text-[0.6875rem] leading-tight text-slate-500">Leads activos</p>
          </Link>
          <Link
            href="/asesor/leads"
            className="rounded-xl bg-white p-3 text-center shadow-xs ring-1 ring-slate-200 transition-colors active:bg-slate-50"
          >
            <p className="text-xl font-semibold tracking-tight text-slate-900">
              {leadsNuevosMes ?? 0}
            </p>
            <p className="mt-0.5 text-[0.6875rem] leading-tight text-slate-500">Nuevos del mes</p>
          </Link>
          <Link
            href="/asesor/leads?vista=cerrados"
            className="rounded-xl bg-white p-3 text-center shadow-xs ring-1 ring-slate-200 transition-colors active:bg-slate-50"
          >
            <p className="text-xl font-semibold tracking-tight text-slate-900">
              {cerradosGanadosMes}
            </p>
            <p className="mt-0.5 text-[0.6875rem] leading-tight text-slate-500">
              Cerrados ganados
            </p>
          </Link>
        </div>
      </div>
    </section>
  )
}
