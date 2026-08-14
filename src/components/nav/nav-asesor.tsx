'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  CircleUserRound,
  ClipboardList,
  House,
  LogOut,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { cerrarSesion } from '@/lib/auth/acciones'
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
  { href: '/asesor/captaciones', etiqueta: 'Captaciones', Icono: ClipboardList },
  { href: '/asesor/perfil', etiqueta: 'Perfil', Icono: CircleUserRound },
]

function esActiva(pathname: string, href: string, exacta?: boolean): boolean {
  if (exacta) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Barra de pestañas inferior del asesor — patrón de teléfono. Se oculta
 * desde `lg` (ver `NavAsesorSidebar`, que la sustituye en escritorio): una
 * barra fija abajo se ve fuera de lugar en una pantalla ancha, y el mismo
 * espacio horizontal alcanza sobrado para una lista lateral.
 */
export function NavAsesor() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
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

/**
 * Lista de navegación vertical del sidebar de escritorio (desde `lg`).
 * Mismos 4 destinos y mismo criterio de "activo" que `NavAsesor` — un
 * asesor nunca ve un ítem distinto resaltado al cruzar el breakpoint.
 */
export function NavAsesorSidebar() {
  const pathname = usePathname()

  return (
    <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 py-2">
      <ul className="grid gap-1">
        {PESTANAS.map(({ href, etiqueta, Icono, exacta }) => {
          const activa = esActiva(pathname, href, exacta)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={activa ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors',
                  activa
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <Icono className="size-4 shrink-0" aria-hidden />
                {etiqueta}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Pie del sidebar de escritorio: nombre del asesor + cerrar sesión. */
export function PieSesionAsesor({ nombre }: { nombre: string }) {
  return (
    <div className="border-t border-slate-200 p-3">
      <p className="truncate px-3 py-1 text-sm font-medium text-slate-500" title={nombre}>
        {nombre}
      </p>
      <form action={cerrarSesion}>
        <button
          type="submit"
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          Salir
        </button>
      </form>
    </div>
  )
}
