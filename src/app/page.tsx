import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { Wordmark } from '@/components/marca/wordmark'

export const metadata: Metadata = {
  title: 'Klo-Ser — Un buen cierre se construye',
  description:
    'El sistema operativo de tu inmobiliaria: leads, equipo y dirección en una sola herramienta. Lo que no se mide, no progresa.',
}

/** CTA negro reutilizable de la landing. */
function BotonTinta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-block bg-[#141414] px-8 py-4 text-[11px] font-semibold tracking-[0.18em] uppercase text-[#FCFCFA] transition-opacity hover:opacity-85"
    >
      {children}
    </Link>
  )
}

/**
 * Los tres pilares del sistema. Cada capacidad listada existe hoy en el
 * producto (bandeja, guardias, escalamiento, historia de eventos, tablero,
 * sugerencias): la landing no promete nada que no esté construido.
 */
const PILARES = [
  {
    n: '01',
    t: 'Captación y seguimiento',
    d: 'El corazón del sistema: cada prospecto entra a una sola cola y nadie se queda sin respuesta.',
    puntos: [
      'Portales, WhatsApp y referidos en una bandeja',
      'Etapas del lead en un toque',
      'Plantillas de WhatsApp y registro del desenlace',
      'Visitas agendadas desde el expediente',
      'Historia completa e inmutable de cada cliente',
    ],
  },
  {
    n: '02',
    t: 'Operación y equipo',
    d: 'La estructura de trabajo: quién responde, cuándo, y qué pasa si nadie lo hace.',
    puntos: [
      'Guardias por turno con rol mensual',
      'Escalamiento automático en tres niveles',
      'Avisos al teléfono de cada asesor',
      'Roles y permisos de dirección y asesor',
      'Catálogo de propiedades sincronizado',
    ],
  },
  {
    n: '03',
    t: 'Dirección y medición',
    d: 'El tablero: la operación deja de contarse de memoria y empieza a leerse.',
    puntos: [
      'Velocidad real de primera respuesta',
      'Embudo por etapa y fuentes de leads',
      'Leads en riesgo, antes de perderlos',
      'Actividad del equipo semana a semana',
      'Buzón de sugerencias del piso de ventas',
    ],
  },
]

const PASOS = [
  {
    n: '01',
    t: 'El lead entra',
    d: 'Portal, WhatsApp o referido: cae a la cola con su propiedad, su fuente y su mensaje.',
    svg: (
      <svg width="120" height="34" fill="none" aria-hidden>
        <circle cx="8" cy="17" r="4" stroke="#141414" strokeWidth="1.3" />
        <circle cx="8" cy="17" r="1.5" fill="#141414" />
        <path d="M14,17 H104" stroke="#D0CEC7" strokeWidth="1.2" strokeDasharray="3 4" />
        <path d="M100,13 L106,17 L100,21" stroke="#141414" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    n: '02',
    t: 'La guardia lo toma',
    d: 'El asesor de turno lo recibe al instante, con aviso en su teléfono.',
    svg: (
      <svg width="120" height="34" fill="none" aria-hidden>
        <circle cx="17" cy="17" r="9" stroke="#141414" strokeWidth="1.3" />
        <path d="M13,17.5 L16,20.5 L22,13.5" stroke="#141414" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    n: '03',
    t: 'El sistema insiste',
    d: '¿Sin respuesta en 15 min? Recordatorio. ¿Sigue igual? Se abre a todos. ¿Nada? Aviso al dueño.',
    svg: (
      <svg width="120" height="34" fill="none" aria-hidden>
        <path d="M8,26 L28,26 L28,14 L48,14 L48,20 L68,20 L68,8 L88,8" stroke="#141414" strokeWidth="1.3" />
        <circle cx="88" cy="8" r="2.5" fill="#141414" />
      </svg>
    ),
  },
  {
    n: '04',
    t: 'Todo queda medido',
    d: 'Velocidad, embudo, fuentes y actividad: el tablero que la dirección lee cada lunes.',
    svg: (
      <svg width="120" height="34" fill="none" aria-hidden>
        <rect x="8" y="18" width="7" height="10" fill="#D0CEC7" />
        <rect x="20" y="12" width="7" height="16" fill="#8C8A84" />
        <rect x="32" y="20" width="7" height="8" fill="#D0CEC7" />
        <rect x="44" y="6" width="7" height="22" fill="#141414" />
      </svg>
    ),
  },
]

const FAQ = [
  {
    q: '¿Solo sirve para dar seguimiento a prospectos?',
    a: 'No. El seguimiento es el corazón —ahí vive cada cliente y su historia—, pero Klo-Ser también organiza al equipo: turnos de guardia, reparto de leads, escalamiento cuando alguien no responde, avisos al teléfono y un tablero de dirección. Una sola herramienta en lugar de una hoja de cálculo, un grupo de WhatsApp y la memoria de cada quien.',
  },
  {
    q: '¿Tengo que dejar mis portales o mi WhatsApp?',
    a: 'No. Klo-Ser se conecta a lo que ya usas: los leads de portales entran solos y los de WhatsApp y referidos se capturan en segundos. El sistema ordena; tú sigues vendiendo donde siempre.',
  },
  {
    q: '¿Qué tan difícil es que mi equipo lo adopte?',
    a: 'Se instala como app en el teléfono de cada asesor y las acciones del día a día toman un toque: tomar un lead, registrar una llamada, agendar una visita. Sin capacitaciones eternas.',
  },
  {
    q: '¿Qué pasa si un asesor no contesta?',
    a: 'El sistema insiste solo: recordatorio al asesor, apertura del lead a todo el equipo y, si nadie responde, aviso directo al dueño. Ningún prospecto se queda esperando en silencio.',
  },
  {
    q: '¿Mis datos son míos?',
    a: 'Sí. La historia de tus clientes es inmutable —nadie puede borrarla ni editarla, ni por error— y te pertenece. Cada inmobiliaria opera con su propia información, aislada y respaldada.',
  },
  {
    q: '¿Cuánto cuesta?',
    a: 'Klo-Ser se implementa a la medida de cada inmobiliaria. Cuéntanos cómo trabaja tu equipo y te armamos una propuesta esta misma semana.',
  },
]

/**
 * Landing pública «galería» (rebranding B&N). Narrativa 2026-08-10: Klo-Ser
 * no se vende como CRM a secas, sino como el sistema operativo de la
 * inmobiliaria — captación, operación del equipo y dirección medida.
 */
export default function PaginaLanding() {
  return (
    <div className="min-h-dvh bg-[#FCFCFA] text-[#141414]">
      {/* ───── Nav ───── */}
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-7">
        <Wordmark className="text-[16px]" />
        <nav className="flex items-center gap-7 text-[11px] font-semibold tracking-[0.16em] uppercase">
          <a href="#sistema" className="hidden underline-offset-8 hover:underline sm:inline">
            El sistema
          </a>
          <a href="#como" className="hidden underline-offset-8 hover:underline sm:inline">
            Cómo funciona
          </a>
          <a href="#preguntas" className="hidden underline-offset-8 hover:underline sm:inline">
            Preguntas
          </a>
          <a href="#contacto" className="hidden underline-offset-8 hover:underline sm:inline">
            Contacto
          </a>
          <Link href="/login" className="underline-offset-8 hover:underline">
            Iniciar sesión
          </Link>
        </nav>
      </header>

      <main>
        {/* ───── Hero ───── */}
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 sm:pt-24">
          <p className="text-[11px] font-semibold tracking-[0.26em] uppercase text-[#8C8A84]">
            El sistema operativo de tu inmobiliaria
          </p>
          <h1 className="font-logo mt-6 max-w-4xl text-5xl leading-[1.04] font-extralight tracking-tight text-balance sm:text-7xl">
            Un buen cierre
            <br />
            se construye.
          </h1>
          <p className="mt-8 max-w-xl text-base leading-relaxed text-[#6E6C66]">
            Klo-Ser centraliza la operación completa: los leads de todos tus
            canales, los turnos y la respuesta de tu equipo, y las métricas que
            la dirección necesita para decidir. Un solo lugar en vez de tres
            sistemas y un grupo de WhatsApp.
          </p>
          <div className="mt-10 flex items-center gap-8">
            <BotonTinta href="#contacto">Quiero una demo</BotonTinta>
            <span className="text-xs text-[#8C8A84]">
              ¿Ya eres parte?{' '}
              <Link href="/login" className="font-semibold text-[#141414] underline-offset-4 hover:underline">
                Inicia sesión
              </Link>
            </span>
          </div>
        </section>

        {/* ───── Foto editorial ───── */}
        <section className="mx-auto max-w-6xl px-6">
          <div className="relative aspect-[21/9] w-full overflow-hidden">
            <Image
              src="/landing/mood-01.jpg"
              alt="Arquitectura en luz y sombra"
              fill
              priority
              sizes="(max-width: 1152px) 100vw, 1152px"
              className="object-cover grayscale"
              style={{ objectPosition: 'center 62%' }}
            />
          </div>
        </section>

        {/* ───── Los tres pilares ───── */}
        <section id="sistema" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-24">
          <p className="text-[11px] font-semibold tracking-[0.26em] uppercase text-[#8C8A84]">
            El sistema
          </p>
          <h2 className="font-logo mt-5 max-w-3xl text-4xl leading-tight font-extralight text-balance sm:text-5xl">
            Todo lo que pasa entre
            <br />
            el lead y el cierre.
          </h2>
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-[#6E6C66]">
            Guardar contactos es el punto de partida, no el sistema. Klo-Ser
            ordena el trabajo alrededor de cada prospecto: quién atiende, con
            qué prioridad, en cuánto tiempo y con qué resultado.
          </p>

          <div className="mt-16 grid gap-x-10 gap-y-14 border-t border-[#E3E1DB] pt-14 lg:grid-cols-3">
            {PILARES.map((p) => (
              <div key={p.n} className="flex flex-col gap-4">
                <span className="text-[10px] tracking-[0.22em] text-[#A5A29A]">{p.n}</span>
                <h3 className="font-logo text-2xl font-light">{p.t}</h3>
                <p className="text-sm leading-relaxed text-[#6E6C66]">{p.d}</p>
                <ul className="mt-2 flex flex-col gap-2.5">
                  {p.puntos.map((punto) => (
                    <li
                      key={punto}
                      className="border-t border-[#EEECE6] pt-2.5 text-[13.5px] leading-snug text-[#4A4843]"
                    >
                      {punto}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ───── Métrica de cierre de la sección ───── */}
        <section className="mx-auto max-w-6xl px-6 pb-8">
          <div className="flex flex-col gap-6 border-t border-[#E3E1DB] py-10 sm:flex-row sm:items-baseline sm:gap-14">
            <p className="font-logo shrink-0 text-6xl font-extralight tabular-nums">
              1<span className="text-2xl text-[#6E6C66]"> sistema</span>
            </p>
            <p className="max-w-[46ch] text-sm leading-relaxed text-[#6E6C66]">
              para leads, turnos, propiedades, equipo y tablero de dirección.
              Se acabaron las hojas sueltas y los pendientes que solo viven en
              la cabeza de alguien.
            </p>
          </div>
        </section>

        {/* ───── Cómo funciona ───── */}
        <section id="como" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-24">
          <p className="text-[11px] font-semibold tracking-[0.26em] uppercase text-[#8C8A84]">
            Cómo funciona
          </p>
          <h2 className="font-logo mt-5 text-4xl leading-tight font-extralight text-balance sm:text-5xl">
            Del primer mensaje
            <br />a la junta del lunes.
          </h2>
          <div className="mt-14 grid gap-x-9 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {PASOS.map((p) => (
              <div key={p.n} className="flex flex-col gap-2.5">
                <span className="text-[10px] tracking-[0.22em] text-[#A5A29A]">{p.n}</span>
                <h3 className="text-lg font-medium">{p.t}</h3>
                <p className="text-sm leading-relaxed text-[#6E6C66]">{p.d}</p>
                <div className="mt-3">{p.svg}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ───── Banda negra: la tesis ───── */}
        <section className="bg-[#0E0D0B] text-[#F2F0EA]">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 lg:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.26em] uppercase text-[#8C8A84]">
                La tesis del sistema
              </p>
              <h2 className="font-logo mt-5 text-4xl leading-tight font-extralight text-balance sm:text-5xl">
                Lo que no se mide,
                <br />
                no progresa.
              </h2>
              <p className="mt-6 max-w-md text-sm leading-relaxed text-[#A5A29A]">
                La velocidad con la que tu equipo contesta decide cuántos leads
                se vuelven citas. Klo-Ser la mide sin que nadie llene un
                reporte: la operación misma genera el dato, y el dato empuja al
                equipo semana con semana.
              </p>
            </div>
            <div>
              <div className="flex items-baseline justify-between border-b border-[#26241F] pb-3 text-[10px] tracking-[0.2em] uppercase text-[#7A776E]">
                <span>1.ª respuesta · mediana semanal</span>
                <span>ejemplo · 8 semanas</span>
              </div>
              <svg viewBox="0 0 440 150" className="mt-4 w-full" fill="none" aria-hidden>
                <path d="M0,120 H440" stroke="#26241F" strokeWidth="1" />
                <path d="M0,70 H440" stroke="#26241F" strokeWidth="1" strokeDasharray="2 5" />
                <path
                  d="M10,28 L70,42 L130,38 L190,64 L250,78 L310,92 L370,104 L430,112"
                  stroke="#F2F0EA"
                  strokeWidth="1.6"
                />
                <circle cx="430" cy="112" r="3.5" fill="#F2F0EA" />
                <text x="10" y="18" fill="#7A776E" fontSize="11">
                  4 h 20 min
                </text>
                <text x="352" y="140" fill="#F2F0EA" fontSize="12" fontWeight="600">
                  7 min ↓
                </text>
              </svg>
            </div>
          </div>
        </section>

        {/* ───── Foto editorial 2 ───── */}
        <section className="mx-auto max-w-6xl px-6 pt-24">
          <div className="relative aspect-[21/8] w-full overflow-hidden">
            <Image
              src="/landing/mood-00.jpg"
              alt="Escalera y columnas de concreto bajo luz diagonal"
              fill
              sizes="(max-width: 1152px) 100vw, 1152px"
              className="object-cover grayscale"
              style={{ objectPosition: 'center 38%' }}
            />
          </div>
        </section>

        {/* ───── Preguntas ───── */}
        <section id="preguntas" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-24">
          <p className="text-[11px] font-semibold tracking-[0.26em] uppercase text-[#8C8A84]">
            Preguntas frecuentes
          </p>
          <div className="mt-7">
            {FAQ.map((f, i) => (
              <details
                key={f.q}
                open={i === 0}
                className="group border-t border-[#E3E1DB] last:border-b"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between py-5 text-base font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden className="text-2xl font-extralight text-[#8C8A84] group-open:hidden">
                    +
                  </span>
                  <span aria-hidden className="hidden text-2xl font-extralight text-[#8C8A84] group-open:inline">
                    −
                  </span>
                </summary>
                <p className="max-w-[62ch] pb-6 text-sm leading-relaxed text-[#6E6C66]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ───── Contacto ───── */}
        <section id="contacto" className="border-t border-[#E3E1DB]">
          <div className="mx-auto grid max-w-6xl gap-14 px-6 py-24 lg:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.26em] uppercase text-[#8C8A84]">
                Contacto
              </p>
              <h2 className="font-logo mt-5 text-4xl leading-tight font-extralight text-balance sm:text-5xl">
                Hablemos de
                <br />
                tus cierres.
              </h2>
              <p className="mt-6 max-w-sm text-sm leading-relaxed text-[#6E6C66]">
                Cuéntanos cómo opera tu inmobiliaria y te enseñamos Klo-Ser
                funcionando con un caso como el tuyo.
              </p>
              <div className="mt-10 flex flex-col gap-2 text-sm">
                <span>
                  <b>Correo</b> ·{' '}
                  <a
                    href="mailto:jairmaldonador8@gmail.com?subject=Quiero%20una%20demo%20de%20Klo-Ser"
                    className="underline-offset-4 hover:underline"
                  >
                    jairmaldonador8@gmail.com
                  </a>
                </span>
                <span className="text-[#8C8A84]">Monterrey, MX</span>
              </div>
            </div>
            <form
              action="mailto:jairmaldonador8@gmail.com"
              method="post"
              encType="text/plain"
              className="flex flex-col"
            >
              {[
                ['Nombre', 'nombre', 'Tu nombre'],
                ['Inmobiliaria', 'inmobiliaria', 'Nombre de tu inmobiliaria'],
                ['Teléfono o correo', 'contacto', 'Para responderte'],
              ].map(([label, name, ph]) => (
                <label key={name} className="mb-6 flex flex-col gap-1.5">
                  <span className="text-[10.5px] font-semibold tracking-[0.18em] uppercase text-[#8C8A84]">
                    {label}
                  </span>
                  <input
                    name={name}
                    placeholder={ph}
                    className="border-b border-[#D0CEC7] bg-transparent py-2 text-[15px] outline-none placeholder:text-[#A5A29A] focus:border-[#141414]"
                  />
                </label>
              ))}
              <label className="mb-8 flex flex-col gap-1.5">
                <span className="text-[10.5px] font-semibold tracking-[0.18em] uppercase text-[#8C8A84]">
                  Cuéntanos
                </span>
                <textarea
                  name="mensaje"
                  rows={3}
                  placeholder="¿Cuántos asesores son? ¿Qué se les pierde hoy?"
                  className="resize-none border-b border-[#D0CEC7] bg-transparent py-2 text-[15px] outline-none placeholder:text-[#A5A29A] focus:border-[#141414]"
                />
              </label>
              <button
                type="submit"
                className="self-start bg-[#141414] px-8 py-4 text-[11px] font-semibold tracking-[0.18em] uppercase text-[#FCFCFA] transition-opacity hover:opacity-85"
              >
                Quiero una demo
              </button>
            </form>
          </div>
        </section>

        {/* ───── Cierre ───── */}
        <section className="border-t border-[#E3E1DB] px-6 py-24 text-center">
          <Wordmark className="justify-center text-[clamp(28px,5vw,46px)]" />
          <p className="mt-6 text-sm text-[#6E6C66]">Un buen cierre se construye.</p>
          <div className="mt-10">
            <BotonTinta href="/login">Iniciar sesión</BotonTinta>
          </div>
        </section>
      </main>

      {/* ───── Footer ───── */}
      <footer className="border-t border-[#E3E1DB]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-[11px] text-[#8C8A84] sm:flex-row">
          <span>Sistema interno de Montana Realty</span>
          <span>© {new Date().getFullYear()} Klo-Ser</span>
        </div>
      </footer>
    </div>
  )
}
