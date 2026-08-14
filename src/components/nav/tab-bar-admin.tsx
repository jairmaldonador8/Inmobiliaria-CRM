'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Ellipsis,
  House,
  Inbox,
  Lightbulb,
  LogOut,
  MessageSquareText,
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

type Pestana = {
  href: string
  etiqueta: string
  Icono: LucideIcon
  exacta?: boolean
}

/** Los 4 destinos con slot fijo en la barra (igual forma que NavAsesor). */
const PESTANAS: Pestana[] = [
  { href: '/admin', etiqueta: 'Inicio', Icono: House, exacta: true },
  { href: '/admin/bandeja', etiqueta: 'Bandeja', Icono: Inbox },
  { href: '/admin/leads', etiqueta: 'Leads', Icono: Users },
  { href: '/admin/propiedades', etiqueta: 'Propiedades', Icono: Building2 },
]

/** Los destinos de la hoja «Más» nunca necesitan match exacto (ver esActiva). */
type PestanaMas = Omit<Pestana, 'exacta'>

/**
 * Destinos que no caben en la barra y viven en la hoja «Más».
 *
 * «Plantillas» no tiene ruta propia: el CRUD de plantillas de WhatsApp vive
 * dentro de /admin/ajustes (ver PaginaAjustes), así que apunta ahí — es el
 * destino real más cercano al que describe NavAdmin.
 */
const DESTINOS_MAS: PestanaMas[] = [
  { href: '/admin/captaciones', etiqueta: 'Captaciones', Icono: ClipboardCheck },
  { href: '/admin/asesores', etiqueta: 'Asesores', Icono: UserRound },
  { href: '/admin/guardias', etiqueta: 'Guardias', Icono: CalendarClock },
  { href: '/admin/ajustes', etiqueta: 'Plantillas', Icono: MessageSquareText },
  { href: '/admin/sugerencias', etiqueta: 'Sugerencias', Icono: Lightbulb },
  { href: '/admin/notificaciones', etiqueta: 'Notificaciones', Icono: Bell },
  { href: '/admin/ajustes', etiqueta: 'Ajustes', Icono: Settings },
]

function esActiva(pathname: string, href: string, exacta?: boolean): boolean {
  if (exacta) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Barra de pestañas inferior del admin (móvil primero, estética «Fintech
 * Muro»). El wrapper `fixed` queda TRANSPARENTE a propósito: el blur real
 * vive en el hijo (pill) para evitar el jank de iOS al hacer scroll debajo
 * de un `fixed` con `backdrop-filter` (ver skill fintech-muro-ui).
 */
export function TabBarAdmin({ nombre }: { nombre: string }) {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)
  const masActiva = DESTINOS_MAS.some((destino) => esActiva(pathname, destino.href))

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div
        className={cn(
          'isolate mx-auto flex max-w-md items-stretch justify-between rounded-full',
          'border border-white/80 bg-[#FAF7F1]/70 px-2 shadow-glass',
          'backdrop-blur-glass [-webkit-backdrop-filter:blur(12px)]'
        )}
      >
        {PESTANAS.map(({ href, etiqueta, Icono, exacta }) => {
          const activa = esActiva(pathname, href, exacta)
          return (
            <Link
              key={href}
              href={href}
              aria-current={activa ? 'page' : undefined}
              className={cn(
                'flex min-h-12 min-w-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1.5 py-1.5 text-[10px] leading-none font-medium transition-colors',
                activa ? 'bg-[#141414]/8 font-semibold text-[#141414]' : 'text-slate-500'
              )}
            >
              <Icono className="size-5" aria-hidden strokeWidth={activa ? 2.25 : 2} />
              {etiqueta}
            </Link>
          )
        })}

        <Sheet open={abierto} onOpenChange={setAbierto}>
          <SheetTrigger
            aria-label="Más"
            aria-current={masActiva ? 'page' : undefined}
            className={cn(
              'flex min-h-12 min-w-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1.5 py-1.5 text-[10px] leading-none font-medium transition-colors',
              masActiva ? 'bg-[#141414]/8 font-semibold text-[#141414]' : 'text-slate-500'
            )}
          >
            <Ellipsis className="size-5" aria-hidden strokeWidth={masActiva ? 2.25 : 2} />
            Más
          </SheetTrigger>
          <SheetContent side="bottom" className="mx-auto max-w-md gap-0 rounded-t-2xl p-0">
            <SheetHeader className="px-6 pt-6 pb-2">
              <SheetTitle>Más opciones</SheetTitle>
            </SheetHeader>
            <ul className="flex flex-col gap-1 px-3 pb-3">
              {DESTINOS_MAS.map(({ href, etiqueta, Icono }) => (
                <li key={etiqueta}>
                  <Link
                    href={href}
                    onClick={() => setAbierto(false)}
                    className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    <Icono className="size-5 shrink-0" aria-hidden />
                    {etiqueta}
                  </Link>
                </li>
              ))}
            </ul>

            {/*
              Control de cierre de sesión: el drawer viejo lo tenía vía
              <PieSesion> (fondo oscuro). Esta hoja usa el fondo claro por
              defecto de <SheetContent>, así que se reconstruye la fila con
              la misma server action (`cerrarSesion`) en vez de reusar
              <PieSesion> tal cual — sus clases (border-slate-800,
              text-slate-200) están pensadas para el sidebar oscuro y
              perderían contraste aquí.
            */}
            <div className="border-t border-slate-200 px-3 pt-3 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
              <p className="truncate px-3 pb-1 text-xs font-medium text-slate-400" title={nombre}>
                {nombre}
              </p>
              <form action={cerrarSesion}>
                <button
                  type="submit"
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <LogOut className="size-5 shrink-0" aria-hidden />
                  Cerrar sesión
                </button>
              </form>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  )
}
