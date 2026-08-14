'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  CalendarClock,
  ClipboardCheck,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { cerrarSesion } from '@/lib/auth/acciones'
import { cn } from '@/lib/utils'
import { Wordmark } from '@/components/marca/wordmark'

type Enlace = {
  href: string
  etiqueta: string
  Icono: LucideIcon
  exacto?: boolean
}

const ENLACES: Enlace[] = [
  { href: '/admin', etiqueta: 'Dashboard', Icono: LayoutDashboard, exacto: true },
  { href: '/admin/bandeja', etiqueta: 'Bandeja', Icono: Inbox },
  { href: '/admin/leads', etiqueta: 'Leads', Icono: Users },
  { href: '/admin/propiedades', etiqueta: 'Propiedades', Icono: Building2 },
  { href: '/admin/captaciones', etiqueta: 'Captaciones', Icono: ClipboardCheck },
  { href: '/admin/asesores', etiqueta: 'Asesores', Icono: UserRound },
  { href: '/admin/guardias', etiqueta: 'Guardias', Icono: CalendarClock },
  { href: '/admin/sugerencias', etiqueta: 'Sugerencias', Icono: Lightbulb },
  { href: '/admin/ajustes', etiqueta: 'Ajustes', Icono: Settings },
]

function esActivo(pathname: string, href: string, exacto?: boolean): boolean {
  if (exacto) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Lista de navegación del admin (activa el ítem actual con usePathname). */
export function NavAdmin({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 py-2">
      <ul className="grid gap-1">
        {ENLACES.map(({ href, etiqueta, Icono, exacto }) => {
          const activo = esActivo(pathname, href, exacto)
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors lg:min-h-9',
                  activo
                    ? 'bg-white font-semibold text-slate-900'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
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

/** Bloque inferior con el nombre del usuario y el botón «Salir». */
export function PieSesion({ nombre }: { nombre: string }) {
  return (
    <div className="border-t border-slate-800 p-3">
      <p className="truncate px-3 py-1 text-sm font-medium text-slate-200" title={nombre}>
        {nombre}
      </p>
      <form action={cerrarSesion}>
        <button
          type="submit"
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-900 hover:text-slate-100 lg:min-h-9"
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          Salir
        </button>
      </form>
    </div>
  )
}

/**
 * Barra superior móvil: wordmark + campanita. Oculta en escritorio.
 *
 * La navegación móvil vive ahora en la tab bar inferior (ver
 * `TabBarAdmin`), así que esta barra ya no necesita el drawer lateral ni
 * `nombre` (se dejó de pasar `PieSesion` aquí — la sesión se cierra desde
 * la hoja «Más»/el sidebar de escritorio).
 *
 * `campana` llega como nodo ya renderizado por el layout (Server
 * Component): este archivo es 'use client' y no puede importar la Campana
 * directo (es un Server Component que lee Supabase con 'server-only').
 */
export function BarraMovilAdmin({ campana }: { campana?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 flex min-h-14 items-center gap-2 border-b border-slate-800 bg-slate-950 px-2 pt-[env(safe-area-inset-top)] text-slate-100 lg:hidden">
      <span className="flex-1 truncate">
        <Wordmark
          className="text-[14px] text-[#EFE9DD]"
        />
      </span>
      {campana}
    </header>
  )
}
