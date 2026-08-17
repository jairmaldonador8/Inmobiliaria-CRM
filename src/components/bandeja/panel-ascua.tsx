import Link from 'next/link'
import { Building2, ChevronRight } from 'lucide-react'

import type { LeadBandeja } from '@/lib/leads/consultas'
import { etiquetaFuenteConDetalle } from '@/lib/leads/formato'
import {
  COMPROMISO_MIN,
  FRANJAS,
  bandaEspera,
  textoEspera,
  type Banda,
  type CargaAsesor,
  type EntradaSemana,
} from '@/lib/bandeja/ascua'
import { AsignarLead, type OpcionAsesor } from '@/components/leads/asignar-lead'

import css from '@/app/(admin)/admin/bandeja/ascua.module.css'

/** Tope de leads abiertos por asesor. Provisional, va a Ajustes junto con el compromiso. */
const TOPE_ABIERTOS = 10

const ETIQUETA_BANDA: Record<Banda, { titulo: string; chip: string; clase: string }> = {
  alerta: { titulo: 'Pasaron el compromiso', chip: 'Ahora', clase: css.chipVencido },
  aviso: { titulo: 'Llevan más de una hora', chip: 'Hoy', clase: css.chipCurso },
  ok: { titulo: 'Dentro de tiempo', chip: 'En cola', clase: css.chipCola },
}

/* ────────────────────────── fila de la cola ────────────────────────── */

function Fila({
  lead,
  banda,
  ahora,
  asesores,
}: {
  lead: LeadBandeja
  banda: Banda
  ahora: number
  asesores: OpcionAsesor[]
}) {
  // El medidor se llena contra el vencimiento: al 100 % el lead ya venció.
  const transcurrido = (ahora - new Date(lead.creado_en).getTime()) / (6 * 60 * 60 * 1000)
  const pct = Math.min(100, Math.max(2, transcurrido * 100))

  return (
    <div className={`${css.fila} ${banda !== 'ok' ? css[banda] : ''}`}>
      <span className={css.punto} aria-hidden />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/leads/${lead.id}`}
            className="text-[14px] font-semibold tracking-[-0.015em] underline-offset-4 hover:underline"
          >
            {lead.nombre}
          </Link>
          <span className={css.chip}>
            {etiquetaFuenteConDetalle(lead.fuente, lead.fuente_detalle)}
          </span>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-[var(--mute)]">
          {lead.propiedad ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Building2 aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{lead.propiedad.titulo}</span>
            </span>
          ) : lead.zona_interes ? (
            <span className="truncate">{lead.zona_interes}</span>
          ) : null}
        </div>

        <div className={css.medidor}>
          <div className={css.pista}>
            <div className={css.relleno} style={{ width: `${pct}%` }} />
          </div>
          <span className={css.espera} suppressHydrationWarning>
            Espera {textoEspera(lead.creado_en, ahora)}
          </span>
        </div>
      </div>

      <div className={`${css.asignar} shrink-0`}>
        <AsignarLead leadId={lead.id} leadNombre={lead.nombre} asesores={asesores} />
      </div>
    </div>
  )
}

/* ────────────────────────── el arco ────────────────────────── */

/**
 * Medidor de un valor contra un límite. El resplandor se hace dibujando el
 * mismo arco dos veces: una desenfocada por debajo (el halo) y otra nítida
 * encima. Sin JS — es marcado estático.
 */
function Arco({ minutos }: { minutos: number | null }) {
  const TOPE = 45
  const cx = 100
  const cy = 96
  const r = 66
  const grosor = 13
  const A0 = 140
  const BARRIDO = 260

  const rad = (g: number) => (g * Math.PI) / 180
  const pt = (g: number, rr = r): [number, number] => [
    cx + rr * Math.cos(rad(g)),
    cy + rr * Math.sin(rad(g)),
  ]
  const traza = (g0: number, g1: number) => {
    const [x0, y0] = pt(g0)
    const [x1, y1] = pt(g1)
    return `M ${x0} ${y0} A ${r} ${r} 0 ${g1 - g0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
  }

  const valor = minutos ?? 0
  const gVal = A0 + BARRIDO * Math.min(1, valor / TOPE)
  const gMeta = A0 + BARRIDO * (COMPROMISO_MIN / TOPE)
  const [nx, ny] = pt(gVal)
  const [mx0, my0] = pt(gMeta, r - grosor / 2 - 3)
  const [mx1, my1] = pt(gMeta, r + grosor / 2 + 3)

  // La mediana llega en minutos con decimales: sin redondear sale «0.0513 min».
  const enteros = minutos === null ? null : Math.round(minutos)
  const diferencia = minutos === null ? null : Math.round(minutos - COMPROMISO_MIN)

  return (
    <>
      <div className={css.arco}>
        <svg
          viewBox="0 0 200 152"
          role="img"
          aria-label={
            minutos === null
              ? 'Todavía no hay suficientes contactos registrados para calcular la mediana'
              : `Mediana de primera respuesta: ${minutos} minutos, contra una meta de ${COMPROMISO_MIN}`
          }
        >
          <defs>
            <linearGradient id="ascua-arco" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#e8a32c" />
              <stop offset="1" stopColor="#f2701e" />
            </linearGradient>
            <filter id="ascua-halo" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          <path
            d={traza(A0, A0 + BARRIDO)}
            fill="none"
            stroke="#2e251e"
            strokeWidth={grosor}
            strokeLinecap="round"
          />

          {minutos !== null ? (
            <>
              <path
                d={traza(A0, gVal)}
                fill="none"
                stroke="#f2701e"
                strokeWidth={grosor}
                strokeLinecap="round"
                filter="url(#ascua-halo)"
                opacity={0.55}
              />
              <path
                d={traza(A0, gVal)}
                fill="none"
                stroke="url(#ascua-arco)"
                strokeWidth={grosor}
                strokeLinecap="round"
              />
              <circle cx={nx} cy={ny} r={9} fill="#f2701e" filter="url(#ascua-halo)" opacity={0.9} />
              <circle cx={nx} cy={ny} r={4} fill="#fff3e6" />
            </>
          ) : null}

          <line
            x1={mx0}
            y1={my0}
            x2={mx1}
            y2={my1}
            stroke="#8b8378"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>

        <div className={css.arcoCentro}>
          {/* v/n son clases del módulo: en texto plano no coinciden con el
              nombre generado y el estilo se pierde en silencio. */}
          <div className={css.v}>
            {enteros === null ? '—' : enteros === 0 ? '< 1 min' : `${enteros} min`}
          </div>
          <div className={css.n}>
            {diferencia === null
              ? 'Sin datos suficientes'
              : diferencia <= 0
                ? `${Math.abs(diferencia)} min bajo la meta`
                : `${diferencia} min sobre la meta`}
          </div>
        </div>
      </div>

      <div className={`${css.leyenda} justify-center`}>
        <span>
          <i style={{ background: 'linear-gradient(90deg,#e8a32c,#f2701e)' }} />
          Ahora
        </span>
        <span>
          <i style={{ background: '#8b8378' }} />
          Meta {COMPROMISO_MIN} min
        </span>
      </div>
    </>
  )
}

/* ────────────────────────── el panel ────────────────────────── */

export function PanelAscua({
  leads,
  asesores,
  carga,
  semana,
  medianaMin,
  guardia,
  ahora,
  registrarLead,
}: {
  leads: LeadBandeja[]
  asesores: OpcionAsesor[]
  carga: CargaAsesor[]
  semana: { dias: string[]; bloques: EntradaSemana[] }
  medianaMin: number | null
  guardia: { nombre: string; hasta: string } | null
  ahora: number
  /** El diálogo de registrar lead llega ya montado: es un componente de cliente. */
  registrarLead: React.ReactNode
}) {
  const porBanda = {
    alerta: leads.filter((l) => bandaEspera(l.creado_en, ahora) === 'alerta'),
    aviso: leads.filter((l) => bandaEspera(l.creado_en, ahora) === 'aviso'),
    ok: leads.filter((l) => bandaEspera(l.creado_en, ahora) === 'ok'),
  }

  // Waffle: un punto por lead de la semana; encendidos los que ya tienen dueño.
  const totalSemana = semana.bloques.length
  const conDueno = semana.bloques.filter((b) => b.estado === 'hecho').length
  const pctAsignados = totalSemana ? Math.round((conDueno / totalSemana) * 100) : 0

  const fmtDia = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Monterrey',
    weekday: 'short',
  })
  const hoyClave = semana.dias[semana.dias.length - 1]

  return (
    <div className={css.raiz}>
      <div className="grid grid-cols-3 items-start gap-3.5">
        {/* ── entrada de la semana ── */}
        <section className={`${css.card} ${css.rayada} col-span-2`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[16.5px] font-semibold tracking-[-0.02em]">
                Entrada de la semana
              </h2>
              <p className="mt-1 max-w-[48ch] text-[12.5px] leading-[1.5] text-[var(--mute)]">
                Cada bloque es un lead, puesto a la hora en que entró. Solo se enciende lo que
                sigue sin dueño y ya pasó el compromiso.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <div className={css.rejillaCab}>
              <div />
              {semana.dias.map((d) => {
                const fecha = new Date(`${d}T12:00:00Z`)
                return (
                  <div key={d} className={d === hoyClave ? css.hoy : undefined}>
                    {fmtDia.format(fecha).replace('.', '')}
                    <b>{Number(d.slice(8))}</b>
                  </div>
                )
              })}
            </div>

            <div className={css.rejilla}>
              {FRANJAS.map((hora, f) => (
                <Fragmento key={hora}>
                  <div className={css.hora}>{hora}</div>
                  {semana.dias.map((d) => {
                    const b = semana.bloques.find((x) => x.dia === d && x.franja === f)
                    return (
                      <div key={`${d}-${f}`} className={css.celda}>
                        {b ? (
                          <div
                            className={`${css.bloque} ${
                              b.estado === 'vencido'
                                ? css.bVencido
                                : b.estado === 'hecho'
                                  ? css.bHecho
                                  : css.bCola
                            }`}
                            title={`${b.nombre} · ${b.detalle}`}
                          >
                            <b>{b.nombre}</b>
                            <span>{b.detalle}</span>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </Fragmento>
              ))}
            </div>
          </div>

          <div className={css.leyenda}>
            <span>
              <i style={{ background: 'linear-gradient(150deg,#f58c33,#e8601a)' }} />
              Sin dueño y vencido
            </span>
            <span>
              <i style={{ background: '#efeae3' }} />
              Ya asignado
            </span>
            <span>
              <i
                style={{
                  background: '#251d18',
                  boxShadow: 'inset 0 0 0 1px rgb(247 243 238 / 0.16)',
                }}
              />
              En cola, dentro de tiempo
            </span>
          </div>
        </section>

        {/* ── tarjeta de acento ── */}
        <section className={`${css.card} ${css.fuego}`}>
          <span className={css.et}>Esperando asignación</span>
          <div className={css.cifra}>{leads.length}</div>
          <div className={css.pie}>
            {porBanda.alerta.length === 0
              ? 'Ninguno pasó el compromiso de seis horas.'
              : `${porBanda.alerta.length} ${
                  porBanda.alerta.length === 1 ? 'ya pasó' : 'ya pasaron'
                } el compromiso de seis horas.`}
          </div>

          {totalSemana > 0 ? (
            <>
              <div className={css.waffle} aria-hidden>
                {Array.from({ length: totalSemana }, (_, i) => (
                  <i
                    key={i}
                    style={{ color: i < conDueno ? '#2a1207' : 'rgb(42 18 7 / 0.26)' }}
                  />
                ))}
              </div>
              <p className="mt-3.5 max-w-[42ch] text-[12.5px] leading-[1.5] text-[rgb(42_18_7_/_0.66)]">
                Cada punto es un lead de esta semana. {conDueno} de {totalSemana}
                {' '}ya tienen dueño &mdash; {pctAsignados} %.
              </p>
            </>
          ) : null}

          <div className="mt-auto pt-5">{registrarLead}</div>
        </section>

        {/* ── la cola ── */}
        <section className={`${css.card} col-span-2`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[16.5px] font-semibold tracking-[-0.02em]">La cola</h2>
              <p className="mt-1 max-w-[48ch] text-[12.5px] leading-[1.5] text-[var(--mute)]">
                Lo recién llegado hasta arriba; el color marca la urgencia.
              </p>
            </div>
          </div>

          {leads.length === 0 ? (
            <div className="mt-6 flex min-h-32 flex-col items-center justify-center gap-1 rounded-2xl bg-[var(--tile)] py-8">
              <p className="text-[15px] font-semibold">Bandeja limpia</p>
              <p className="text-[12.5px] text-[var(--mute)]">No hay leads esperando asignación</p>
            </div>
          ) : (
            // Recién llegados arriba, vencidos abajo (pedido de Renata,
            // Live test 2026-08-17); el color del chip sigue gritando la urgencia.
            (['ok', 'aviso', 'alerta'] as const).map((banda) => {
              const grupo = porBanda[banda]
              if (grupo.length === 0) return null
              const { titulo, chip, clase } = ETIQUETA_BANDA[banda]
              return (
                <div key={banda}>
                  <div className={css.banda}>
                    <span className={`${css.chip} ${clase}`}>{chip}</span>
                    <h3>{titulo}</h3>
                    <span className={css.bandaN}>{grupo.length}</span>
                    <span className={css.regla} />
                  </div>
                  {grupo.map((lead) => (
                    <Fila
                      key={lead.id}
                      lead={lead}
                      banda={banda}
                      ahora={ahora}
                      asesores={asesores}
                    />
                  ))}
                </div>
              )
            })
          )}
        </section>

        {/* ── columna derecha ── */}
        <div className="flex flex-col gap-3.5">
          <section className={`${css.card} ${css.rayada}`}>
            <h2 className="text-[16.5px] font-semibold tracking-[-0.02em]">Primera respuesta</h2>
            <p className="mt-1 text-[12.5px] leading-[1.5] text-[var(--mute)]">
              Mediana de los últimos siete días, contra la meta de {COMPROMISO_MIN} minutos.
            </p>
            <Arco minutos={medianaMin} />
          </section>

          <section className={css.card}>
            <h2 className="text-[16.5px] font-semibold tracking-[-0.02em]">El equipo, ahora</h2>
            <p className="mt-1 text-[12.5px] leading-[1.5] text-[var(--mute)]">
              Ordenado por quién debería recibir el siguiente.
            </p>

            {carga.map((a) => {
              const pct = Math.min(100, (a.abiertos / TOPE_ABIERTOS) * 100)
              const alTope = pct >= 90
              const cargado = pct >= 70
              return (
                <div key={a.userId} className="mt-3.5">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <b className="text-[13.5px] font-semibold tracking-[-0.015em]">{a.nombre}</b>
                    <span className="text-[12px] tabular-nums text-[var(--mute)]">
                      {a.abiertos}/{TOPE_ABIERTOS}
                    </span>
                  </div>
                  <div className={`${css.medidor} mt-1.5 max-w-none`}>
                    <div className={css.pista}>
                      <div
                        className={css.relleno}
                        style={{
                          width: `${pct}%`,
                          background: alTope
                            ? 'linear-gradient(90deg,#f58c33,#e8601a)'
                            : cargado
                              ? '#e8a32c'
                              : '#8b8378',
                          boxShadow: alTope ? '0 0 14px rgb(242 112 30 / 0.55)' : undefined,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}

            <div className={css.leyenda}>
              <span>
                <i style={{ background: '#8b8378' }} />
                Con espacio
              </span>
              <span>
                <i style={{ background: '#e8a32c' }} />
                Cargado
              </span>
              <span>
                <i style={{ background: 'linear-gradient(90deg,#f58c33,#e8601a)' }} />
                Al tope
              </span>
            </div>

            <div className="mt-4 border-t border-[var(--linea)] pt-4">
              <span className={css.et}>De guardia</span>
              {guardia ? (
                <>
                  <div className="mt-2 text-[14.5px] font-semibold">{guardia.nombre}</div>
                  <div className="text-[12px] text-[var(--mute)]">Turno hasta {guardia.hasta}</div>
                </>
              ) : (
                <p className="mt-2 text-[12.5px] text-[var(--mute)]">
                  Nadie de guardia en este momento.{' '}
                  <Link href="/admin/guardias" className="underline underline-offset-4">
                    Ver el rol
                    <ChevronRight aria-hidden className="inline size-3.5" />
                  </Link>
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

/** Alias corto de Fragment: la rejilla necesita emitir 8 celdas por franja sin envolverlas. */
function Fragmento({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
