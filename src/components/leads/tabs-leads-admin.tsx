import Link from 'next/link'

import { cn } from '@/lib/utils'

const TABS = [
  { clave: 'todos', etiqueta: 'Todos', href: '/admin/leads' },
  { clave: 'conversaciones', etiqueta: 'En conversación', href: '/admin/leads/conversaciones' },
] as const

/**
 * Píldoras que conectan la tabla global de leads con la vista «En
 * conversación». Server Component sin estado: la pestaña activa la declara
 * cada página, no la URL — así no hay usePathname ni 'use client' de más.
 */
export function TabsLeadsAdmin({ activa }: { activa: (typeof TABS)[number]['clave'] }) {
  return (
    <nav aria-label="Vistas de leads" className="flex gap-1.5">
      {TABS.map((tab) => (
        <Link
          key={tab.clave}
          href={tab.href}
          aria-current={tab.clave === activa ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-9 items-center rounded-full px-4 text-sm font-medium transition-colors',
            tab.clave === activa
              ? 'bg-slate-900 text-slate-50'
              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
          )}
        >
          {tab.etiqueta}
        </Link>
      ))}
    </nav>
  )
}
