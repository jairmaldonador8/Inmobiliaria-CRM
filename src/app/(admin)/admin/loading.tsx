/**
 * Skeleton genérico del área admin (Task 20): se muestra mientras
 * Next.js resuelve el Server Component de la página bajo /admin durante
 * la navegación. Deliberadamente simple y compartido por todas las
 * páginas — no hay un loading.tsx por página.
 */
export default function CargandoAdmin() {
  return (
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
  )
}
