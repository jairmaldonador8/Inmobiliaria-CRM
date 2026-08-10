import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { Wordmark } from '@/components/marca/wordmark'

export const metadata: Metadata = {
  title: 'Klo-Ser — Un buen cierre se construye',
  description:
    'CRM inmobiliario: todos tus leads en una sola cola, guardias con escalamiento y la historia completa de cada cliente.',
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
    t: 'Alguien lo toma',
    d: 'La guardia del turno lo recibe al instante, con aviso al teléfono del asesor.',
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
    d: 'Velocidad de respuesta, embudo y fuentes: el tablero que la dirección lee cada lunes.',
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
 * Landing pública «galería» (rebranding B&N): intro editorial de la v1 +
 * secciones comerciales de la v2 (métricas, cómo funciona, FAQ, contacto).
 * Fusión aprobada 2026-08-10; mockups fuente en docs/diseno/.
 */
export default function PaginaLanding() {
  return (
    <div className="min-h-dvh bg-[#FCFCFA] text-[#141414]">
      {/* ───── Nav ───── */}
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-7">
        <Wordmark className="text-[16px]" />
        <nav className="flex items-center gap-7 text-[11px] font-semibold tracking-[0.16em] uppercase">
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
        {/* ───── Hero (intro v1, intacta) ───── */}
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 sm:pt-24">
          <p className="text-[11px] font-semibold tracking-[0.26em] uppercase text-[#8C8A84]">
            CRM inmobiliario
          </p>
          <h1 className="font-logo mt-6 max-w-4xl text-5xl leading-[1.04] font-extralight tracking-tight text-balance sm:text-7xl">
            Un buen cierre
            <br />
            se construye.
          </h1>
          <p className="mt-8 max-w-xl text-base leading-relaxed text-[#6E6C66]">
            Klo-Ser junta tus leads de EasyBroker, WhatsApp y referidos en una
            sola cola, cuida que nadie se quede sin respuesta y guarda la
            historia completa de cada cliente — para siempre.
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

        {/* ───── Foto editorial (v1, intacta) ───── */}
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
          <p className="mt-3 text-[10px] tracking-[0.2em] uppercase text-[#A5A29A]">
            Obra 01 · Monterrey, MX
          </p>
        </section>

        {/* ───── Métricas gigantes (v2) ───── */}
        <section className="mx-auto max-w-6xl px-6 pt-24">
          <div className="grid border-t border-[#E3E1DB] sm:grid-cols-3">
            {[
              ['15', 'min', 'y el sistema escala solo un lead sin respuesta — a otro asesor, a todos, al dueño.'],
              ['100', '%', 'de la historia de cada cliente queda escrita: llamadas, mensajes, visitas, etapas. Nada vive en la memoria de nadie.'],
              ['1', 'cola', 'para portales, WhatsApp y referidos. Un solo lugar donde ningún prospecto se pierde.'],
            ].map(([v, u, d], i) => (
              <div
                key={u}
                className={
                  i === 0
                    ? 'py-9 pr-8'
                    : 'border-t border-[#E3E1DB] py-9 sm:border-t-0 sm:border-l sm:pl-8 sm:pr-8'
                }
              >
                <p className="font-logo text-6xl font-extralight tabular-nums">
                  {v}
                  <span className="text-2xl text-[#6E6C66]"> {u}</span>
                </p>
                <p className="mt-3 max-w-[28ch] text-sm leading-relaxed text-[#6E6C66]">{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ───── Cómo funciona (v2) ───── */}
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

        {/* ───── Banda negra: la métrica estrella (v2) ───── */}
        <section className="bg-[#0E0D0B] text-[#F2F0EA]">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 lg:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.26em] uppercase text-[#8C8A84]">
                La métrica que cambia el negocio
              </p>
              <h2 className="font-logo mt-5 text-4xl leading-tight font-extralight text-balance sm:text-5xl">
                ¿Cuánto tardas hoy
                <br />
                en contestar un lead?
              </h2>
              <p className="mt-6 max-w-md text-sm leading-relaxed text-[#A5A29A]">
                La mayoría de los compradores se queda con el primero que
                responde. Klo-Ser mide tu velocidad real de primera respuesta —
                y la baja, turno a turno, con guardias y escalamiento
                automático.
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
          <p className="mt-3 text-[10px] tracking-[0.2em] uppercase text-[#A5A29A]">
            Obra 02 · Monterrey, MX
          </p>
        </section>

        {/* ───── Preguntas (v2) ───── */}
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

        {/* ───── Contacto (v2) ───── */}
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

        {/* ───── Cierre (v1) ───── */}
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
