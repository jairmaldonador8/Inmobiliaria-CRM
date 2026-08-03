/** Estado vacío estándar para pantallas aún no construidas (Fase 1). */
export function Proximamente({ titulo }: { titulo: string }) {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {titulo}
      </h1>
      <div className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60">
        <p className="text-sm text-slate-500">Próximamente</p>
      </div>
    </section>
  )
}
