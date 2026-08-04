/**
 * Skeleton genérico del área asesor (Task 20): se muestra mientras
 * Next.js resuelve el Server Component de la página bajo /asesor durante
 * la navegación. Deliberadamente simple y compartido por todas las
 * páginas — no hay un loading.tsx por página.
 */
export default function CargandoAsesor() {
  return (
    <section className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-6 w-40 rounded-md bg-slate-200" />
        <div className="h-4 w-52 rounded-md bg-slate-200/70" />
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-white shadow-xs ring-1 ring-slate-200" />
        ))}
      </div>
    </section>
  )
}
