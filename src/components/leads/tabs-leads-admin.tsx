import Link from 'next/link'

import { conteoArchivados } from '@/lib/leads/consultas'
import { cn } from '@/lib/utils'

const TABS = [
  { clave: 'todos', etiqueta: 'Todos', href: '/admin/leads' },
  { clave: 'conversaciones', etiqueta: 'En conversación', href: '/admin/leads/conversaciones' },
  { clave: 'archivados', etiqueta: 'Papelera', href: '/admin/leads/archivados' },
] as const

/**
 * Píldoras que conectan la tabla global de leads con «En conversación» y la
 * papelera. Server Component sin estado: la pestaña activa la declara cada
 * página, no la URL — así no hay usePathname ni 'use client' de más.
 *
 * El conteo de la papelera es best-effort: si la consulta falla, la píldora
 * se pinta sin número en vez de tumbar la página que la hospeda.
 */
export async function TabsLeadsAdmin({ activa }: { activa: (typeof TABS)[number]['clave'] }) {
  const enPapelera = await conteoArchivados().catch(() => null)

  return (
    <nav aria-label="Vistas de leads" className="flex flex-wrap gap-1.5">
      {TABS.map((tab) => (
        <Link
          key={tab.clave}
          href={tab.href}
          aria-current={tab.clave === activa ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors',
            tab.clave === activa
              ? 'bg-slate-900 text-slate-50'
              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
          )}
        >
          {tab.etiqueta}
          {tab.clave === 'archivados' && enPapelera ? (
            <span
              className={cn(
                'rounded-full px-1.5 text-xs tabular-nums',
                tab.clave === activa ? 'bg-white/15' : 'bg-slate-100 text-slate-500'
              )}
            >
              {enPapelera}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  )
}
