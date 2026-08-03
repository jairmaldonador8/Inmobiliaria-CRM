'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { cerrarSesion } from '@/lib/auth/acciones'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

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
  { href: '/admin/asesores', etiqueta: 'Asesores', Icono: UserRound },
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
                  'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors lg:min-h-9',
                  activo
                    ? 'bg-slate-800 text-white'
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

/** Barra superior móvil con menú lateral (drawer). Oculta en escritorio. */
export function BarraMovilAdmin({ nombre }: { nombre: string }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-slate-800 bg-slate-950 px-2 text-slate-100 lg:hidden">
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetTrigger
          aria-label="Abrir menú"
          className="flex size-11 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-900 hover:text-white"
        >
          <Menu className="size-5" aria-hidden />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-72 gap-0 border-slate-800 bg-slate-950 p-0 text-slate-100 [&_[data-slot=sheet-close]]:text-slate-300 [&_[data-slot=sheet-close]]:hover:bg-slate-900 [&_[data-slot=sheet-close]]:hover:text-white"
        >
          <SheetHeader className="px-6 pt-6 pb-2">
            <SheetTitle className="text-base font-semibold tracking-tight text-white">
              Montana Realty
            </SheetTitle>
          </SheetHeader>
          <NavAdmin onNavigate={() => setAbierto(false)} />
          <PieSesion nombre={nombre} />
        </SheetContent>
      </Sheet>
      <span className="text-sm font-semibold tracking-tight">Montana Realty</span>
    </header>
  )
}
