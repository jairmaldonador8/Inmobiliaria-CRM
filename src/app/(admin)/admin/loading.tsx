import FondoFintech from '@/components/fintech/fondo-fintech'
import TarjetaGlass from '@/components/fintech/tarjeta-glass'

/**
 * Skeleton genérico del área admin (Task 20): se muestra mientras
 * Next.js resuelve el Server Component de la página bajo /admin durante
 * la navegación. Deliberadamente simple y compartido por todas las
 * páginas — no hay un loading.tsx por página.
 *
 * Task FM6: par móvil/escritorio en lockstep con `page.tsx` — el móvil
 * imita la forma del dashboard fintech (héroe, fila de stats, tarjeta de
 * tinta, pipeline, lista) para que la transición no salte al llegar el
 * contenido real. El escritorio queda intacto.
 */
export default function CargandoAdmin() {
  return (
    <>
      {/* Móvil — esqueleto Fintech Muro */}
      <div className="-mx-4 -mt-6 -mb-28 lg:hidden">
        <FondoFintech className="px-4 pt-6 pb-32">
          <div className="flex animate-pulse flex-col gap-4" aria-hidden>
            <div className="h-6 w-40 rounded-md bg-[#141414]/10" />

            <TarjetaGlass variant="hero" className="flex flex-col gap-3">
              <div className="h-3 w-24 rounded-md bg-[#141414]/10" />
              <div className="h-8 w-16 rounded-md bg-[#141414]/10" />
              <div className="h-16 w-full rounded-md bg-[#141414]/10" />
            </TarjetaGlass>

            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <TarjetaGlass key={i} className="flex flex-col gap-2">
                  <div className="h-3 w-12 rounded-md bg-[#141414]/10" />
                  <div className="h-6 w-8 rounded-md bg-[#141414]/10" />
                </TarjetaGlass>
              ))}
            </div>

            <div className="h-20 rounded-2xl bg-[#141414]/15" />

            <TarjetaGlass className="flex flex-col gap-3">
              <div className="h-3 w-28 rounded-md bg-[#141414]/10" />
              <div className="h-3 w-full rounded-full bg-[#141414]/10" />
            </TarjetaGlass>

            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 rounded-2xl border border-white/80 bg-[#FAF7F1]/65" />
              ))}
            </div>
          </div>
        </FondoFintech>
      </div>

      {/* Escritorio — intacto (Task 20) */}
      <div className="hidden lg:block">
        <section className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-7 w-56 rounded-md bg-slate-200" />
        <div className="h-4 w-72 rounded-md bg-slate-200/70" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:p-5">
            <div className="h-4 w-24 rounded-md bg-slate-200" />
            <div className="h-8 w-14 rounded-md bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-white ring-1 ring-slate-200" />
        ))}
      </div>
        </section>
      </div>
    </>
  )
}
