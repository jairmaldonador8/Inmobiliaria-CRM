'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  CircleUserRound,
  House,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'

type Pestana = {
  href: string
  etiqueta: string
  Icono: LucideIcon
  exacta?: boolean
}

const PESTANAS: Pestana[] = [
  { href: '/asesor', etiqueta: 'Inicio', Icono: House, exacta: true },
  { href: '/asesor/leads', etiqueta: 'Leads', Icono: Users },
  { href: '/asesor/propiedades', etiqueta: 'Propiedades', Icono: Building2 },
  { href: '/asesor/perfil', etiqueta: 'Perfil', Icono: CircleUserRound },
]

function esActiva(pathname: string, href: string, exacta?: boolean): boolean {
  if (exacta) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Barra de pestañas inferior del asesor (móvil primero). */
export function NavAsesor() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex h-16 max-w-md items-stretch">
        {PESTANAS.map(({ href, etiqueta, Icono, exacta }) => {
          const activa = esActiva(pathname, href, exacta)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={activa ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors',
                  activa ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
                )}
              >
                <Icono className="size-5" aria-hidden strokeWidth={activa ? 2.25 : 2} />
                {etiqueta}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
