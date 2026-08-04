import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { listaSugerencias } from '@/lib/sugerencias/consultas'
import { SelectorEstadoSugerencia } from '@/components/sugerencias/selector-estado-sugerencia'

export default async function PaginaSugerencias() {
  await requireAdmin()
  const sugerencias = await listaSugerencias()

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sugerencias</h1>
        <p className="text-sm text-slate-500">
          {sugerencias.length === 0
            ? 'Sin sugerencias registradas todavía'
            : `${sugerencias.length} sugerencia${sugerencias.length === 1 ? '' : 's'} del equipo`}
        </p>
      </header>

      {sugerencias.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-white/60">
          <p className="text-2xl" aria-hidden>
            💡
          </p>
          <p className="text-sm text-slate-500">
            Aquí aparecerán las sugerencias que envíe el equipo
          </p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {sugerencias.map((sugerencia) => (
            <li
              key={sugerencia.id}
              className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-slate-900">
                    {sugerencia.autor_nombre ?? 'Usuario eliminado'}
                  </span>
                  <span className="text-slate-400">·</span>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    {sugerencia.pantalla}
                  </code>
                  <span className="text-slate-400">·</span>
                  <span suppressHydrationWarning className="text-xs text-slate-400">
                    {formatDistanceToNow(new Date(sugerencia.creada_en), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </span>
                </div>
                <SelectorEstadoSugerencia sugerenciaId={sugerencia.id} estado={sugerencia.estado} />
              </div>
              <p className="text-sm whitespace-pre-wrap text-slate-700">{sugerencia.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
