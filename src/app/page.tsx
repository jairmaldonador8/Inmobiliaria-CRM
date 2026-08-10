import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { Wordmark } from '@/components/marca/wordmark'

export const metadata: Metadata = {
  title: 'Klo-Ser — Un buen cierre se construye',
  description:
    'CRM inmobiliario: todos tus leads en una sola cola, guardias con escalamiento y la historia completa de cada cliente.',
}

/**
 * Landing pública «galería» (rebranding B&N 2026-08-10): blanco, tinta y
 * líneas de pelo; las fotos mood van en grayscale por decisión de marca.
 * Sustituye al port «Muro» (arena/café); el anterior vive en git.
 */
export default function PaginaLanding() {
  return (
    <div className="min-h-dvh bg-[#FCFCFA] text-[#141414]">
      {/* ───── Nav ───── */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
        <Wordmark className="text-[16px]" />
        <Link
          href="/login"
          className="text-[11px] font-semibold tracking-[0.18em] uppercase underline-offset-8 hover:underline"
        >
          Iniciar sesión
        </Link>
      </header>

      <main>
        {/* ───── Hero ───── */}
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
            <Link
              href="/login"
              className="bg-[#141414] px-8 py-4 text-[11px] font-semibold tracking-[0.18em] uppercase text-[#FCFCFA] transition-opacity hover:opacity-85"
            >
              Entrar al sistema
            </Link>
            <span className="text-xs text-[#8C8A84]">Solo con invitación</span>
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
          <p className="mt-3 text-[10px] tracking-[0.2em] uppercase text-[#A5A29A]">
            Obra 01 · Monterrey, MX
          </p>
        </section>

        {/* ───── Qué hace ───── */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-x-10 gap-y-14 border-t border-[#E3E1DB] pt-14 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: '01',
                t: 'Una sola cola',
                d: 'Portales, WhatsApp y referidos entran al mismo lugar. Nada se pierde en el teléfono de nadie.',
              },
              {
                n: '02',
                t: 'Nadie sin respuesta',
                d: 'Guardias por turno y escalamiento automático: si un lead espera, el sistema insiste hasta que alguien lo toma.',
              },
              {
                n: '03',
                t: 'Historia completa',
                d: 'Cada llamada, mensaje, visita y cambio de etapa queda escrito. El expediente del cliente no depende de la memoria.',
              },
              {
                n: '04',
                t: 'Dirección con datos',
                d: 'Velocidad de respuesta, embudo y fuentes en el tablero. La junta del lunes empieza con hechos.',
              },
            ].map((f) => (
              <div key={f.n} className="flex flex-col gap-3">
                <span className="text-[10px] tracking-[0.22em] text-[#A5A29A]">{f.n}</span>
                <h2 className="font-logo text-xl font-light">{f.t}</h2>
                <p className="text-sm leading-relaxed text-[#6E6C66]">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ───── Banda negra ───── */}
        <section className="bg-[#0E0D0B] text-[#F2F0EA]">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.26em] uppercase text-[#8C8A84]">
                Hecho por inmobiliarios
              </p>
              <p className="font-logo mt-6 text-3xl leading-snug font-extralight text-balance sm:text-4xl">
                El sistema no vende por ti.
                <br />
                Se asegura de que tú sí puedas.
              </p>
              <p className="mt-6 max-w-md text-sm leading-relaxed text-[#A5A29A]">
                Nacido en el piso de ventas de Montana Realty: cada regla del
                sistema existe porque un cierre se perdió sin ella.
              </p>
            </div>
            <div className="relative aspect-[4/5] max-h-[420px] w-full overflow-hidden justify-self-end lg:w-[340px]">
              <Image
                src="/landing/mood-05.jpg"
                alt="Volúmenes de concreto"
                fill
                sizes="(max-width: 1024px) 100vw, 340px"
                className="object-cover grayscale"
              />
            </div>
          </div>
        </section>

        {/* ───── Cierre ───── */}
        <section className="mx-auto max-w-6xl px-6 py-24 text-center">
          <Wordmark className="justify-center text-[clamp(28px,5vw,46px)]" />
          <p className="mt-6 text-sm text-[#6E6C66]">Un buen cierre se construye.</p>
          <Link
            href="/login"
            className="mt-10 inline-block bg-[#141414] px-8 py-4 text-[11px] font-semibold tracking-[0.18em] uppercase text-[#FCFCFA] transition-opacity hover:opacity-85"
          >
            Iniciar sesión
          </Link>
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
