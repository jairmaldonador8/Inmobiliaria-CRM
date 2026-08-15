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

import clara from '@/app/(admin)/admin/bandeja/clara.module.css'
import tinta from '@/app/(admin)/admin/bandeja/tinta.module.css'
import obsidiana from '@/app/(admin)/admin/bandeja/obsidiana.module.css'
import pluma from '@/app/(admin)/admin/bandeja/pluma.module.css'

/*
 * Panel de bandeja parametrizable por PIEL: la MISMA información y
 * estructura que PanelAscua (cola por espera, entrada de la semana, arco de
 * primera respuesta, carga del equipo, guardia); los colores viven COMPLETOS
 * en el módulo CSS de cada piel (clases + variables --sw/--carga/--arco/
 * --sem/--waffle). Comparación en local con ?piel=clara|tinta|obsidiana|ascua.
 */

export type PielBandeja = 'pluma' | 'clara' | 'tinta' | 'obsidiana'

const PIELES: Record<PielBandeja, Record<string, string>> = {
  pluma,
  clara,
  tinta,
  obsidiana,
}

/** Tope de leads abiertos por asesor. Provisional, va a Ajustes junto con el compromiso. */
const TOPE_ABIERTOS = 10

function etiquetasBanda(css: Record<string, string>): Record<Banda, { titulo: string; chip: string; clase: string }> {
  return {
    alerta: { titulo: 'Pasaron el compromiso', chip: 'Ahora', clase: css.chipVencido },
    aviso: { titulo: 'Llevan más de una hora', chip: 'Hoy', clase: css.chipCurso },
    ok: { titulo: 'Dentro de tiempo', chip: 'En cola', clase: css.chipCola },
  }
}

/* ────────────────────────── fila de la cola ────────────────────────── */

function Fila({
  lead,
  banda,
  ahora,
  asesores,
  css,
}: {
  lead: LeadBandeja
  banda: Banda
  ahora: number
  asesores: OpcionAsesor[]
  css: Record<string, string>
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
function Arco({ minutos, css, piel }: { minutos: number | null; css: Record<string, string>; piel: PielBandeja }) {
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
            <linearGradient id={`arco-${piel}`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--arco-1)' }} />
              <stop offset="1" style={{ stopColor: 'var(--arco-2)' }} />
            </linearGradient>
            <filter id={`halo-${piel}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          <path
            d={traza(A0, A0 + BARRIDO)}
            fill="none"
            style={{ stroke: 'var(--arco-pista)' }}
            strokeWidth={grosor}
            strokeLinecap="round"
          />

          {minutos !== null ? (
            <>
              <path
                d={traza(A0, gVal)}
                fill="none"
                style={{ stroke: 'var(--arco-halo)' }}
                strokeWidth={grosor}
                strokeLinecap="round"
                filter={`url(#halo-${piel})`}
                opacity={0.35}
              />
              <path
                d={traza(A0, gVal)}
                fill="none"
                stroke={`url(#arco-${piel})`}
                strokeWidth={grosor}
                strokeLinecap="round"
              />
              <circle cx={nx} cy={ny} r={9} style={{ fill: 'var(--arco-halo)' }} filter={`url(#halo-${piel})`} opacity={0.6} />
              <circle cx={nx} cy={ny} r={4} style={{ fill: 'var(--arco-punto)' }} />
            </>
          ) : null}

          <line
            x1={mx0}
            y1={my0}
            x2={mx1}
            y2={my1}
            style={{ stroke: 'var(--arco-meta)' }}
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
          <i style={{ background: 'var(--sw-ahora)' }} />
          Ahora
        </span>
        <span>
          <i style={{ background: 'var(--arco-meta)' }} />
          Meta {COMPROMISO_MIN} min
        </span>
      </div>
    </>
  )
}

/* ────────────────────────── el panel ────────────────────────── */

export function PanelBandeja({
  piel,
  leads,
  asesores,
  carga,
  semana,
  medianaMin,
  guardia,
  ahora,
  registrarLead,
}: {
  piel: PielBandeja
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
  const css = PIELES[piel]
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
                      <div
                        key={`${d}-${f}`}
                        className={d === hoyClave ? `${css.celda} ${css.celdaHoy}` : css.celda}
                      >
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
              <i style={{ background: 'var(--sem-vencido)' }} />
              Sin dueño y vencido
            </span>
            <span>
              <i style={{ background: 'var(--sem-hecho)' }} />
              Ya asignado
            </span>
            <span>
              <i
                style={{
                  background: 'var(--sem-cola)',
                  boxShadow: 'inset 0 0 0 1px var(--sem-cola-ring)',
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
                    style={{ color: i < conDueno ? 'var(--waffle-on)' : 'var(--waffle-off)' }}
                  />
                ))}
              </div>
              <p className={`mt-3.5 max-w-[42ch] text-[12.5px] leading-[1.5] ${css.fuegoNota}`}>
                Cada punto es un lead de esta semana. {conDueno} de {totalSemana}
                {' '}ya tienen dueño &mdash; {pctAsignados} %.
              </p>
            </>
          ) : null}

          <div className={`mt-auto pt-5 ${css.cta}`}>{registrarLead}</div>
        </section>

        {/* ── la cola ── */}
        <section className={`${css.card} col-span-2`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[16.5px] font-semibold tracking-[-0.02em]">La cola</h2>
              <p className="mt-1 max-w-[48ch] text-[12.5px] leading-[1.5] text-[var(--mute)]">
                Ordenada por tiempo de espera, no por llegada.
              </p>
            </div>
          </div>

          {leads.length === 0 ? (
            <div className="mt-6 flex min-h-32 flex-col items-center justify-center gap-1 rounded-2xl bg-[var(--tile)] py-8">
              <p className="text-[15px] font-semibold">Bandeja limpia</p>
              <p className="text-[12.5px] text-[var(--mute)]">No hay leads esperando asignación</p>
            </div>
          ) : (
            (['alerta', 'aviso', 'ok'] as const).map((banda) => {
              const grupo = porBanda[banda]
              if (grupo.length === 0) return null
              const { titulo, chip, clase } = etiquetasBanda(css)[banda]
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
                      css={css}
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
            <Arco minutos={medianaMin} css={css} piel={piel} />
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
                            ? 'var(--carga-tope)'
                            : cargado
                              ? 'var(--carga-cargado)'
                              : 'var(--carga-libre)',
                          boxShadow: alTope ? 'var(--carga-tope-glow)' : undefined,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}

            <div className={css.leyenda}>
              <span>
                <i style={{ background: 'var(--carga-libre)' }} />
                Con espacio
              </span>
              <span>
                <i style={{ background: 'var(--carga-cargado)' }} />
                Cargado
              </span>
              <span>
                <i style={{ background: 'var(--carga-tope)' }} />
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
