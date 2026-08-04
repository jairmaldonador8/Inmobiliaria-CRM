import Link from 'next/link'
import { Bell } from 'lucide-react'

import { cn } from '@/lib/utils'
import { conteoNoLeidas } from '@/lib/notificaciones/consultas'

/**
 * Campana de notificaciones: Server Component que lee el conteo sin leer
 * con el cliente de sesión (RLS lo limita a las propias) y enlaza a la
 * pantalla de notificaciones del rol correspondiente. Compartida por
 * asesor (`/asesor/notificaciones`) y admin (`/admin/notificaciones`) —
 * cada layout la coloca y le pasa el `href` y los colores que le tocan.
 */
export async function Campana({ href, className }: { href: string; className?: string }) {
  const conteo = await conteoNoLeidas()

  return (
    <Link
      href={href}
      aria-label={conteo > 0 ? `Notificaciones, ${conteo} sin leer` : 'Notificaciones'}
      className={cn(
        'relative flex size-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900',
        className
      )}
    >
      <Bell aria-hidden className="size-5" />
      {conteo > 0 ? (
        <span
          aria-hidden
          className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[0.625rem] font-semibold text-white"
        >
          {conteo > 9 ? '9+' : conteo}
        </span>
      ) : null}
    </Link>
  )
}
