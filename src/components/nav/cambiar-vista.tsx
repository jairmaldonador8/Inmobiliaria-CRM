import Link from 'next/link'
import { ArrowLeftRight } from 'lucide-react'

import type { Rol } from '@/lib/auth/usuario-actual'

/**
 * Cambio de vista admin ↔ asesor, solo para admins.
 *
 * Para qué: la dirección necesita poder pararse en la pantalla del asesor
 * para verificar el producto tal como lo ve el equipo, sin cerrar sesión ni
 * mantener una segunda cuenta.
 *
 * NO es impersonación: en la vista de asesor el admin sigue siendo él mismo y
 * ve SUS propios leads (los que tenga asignados), no los de otra persona. Por
 * eso el aviso lo dice explícitamente — si no, es facilísimo confundir «mi
 * pipeline vacío» con «el equipo no tiene leads» y salir a cazar un bug que
 * no existe.
 *
 * Ver a un asesor concreto (soporte / supervisión) es otra cosa y va aparte:
 * tiene que ser de solo lectura para no ensuciar el actor del histórico.
 *
 * Server Component: es un Link, no necesita estado ni cliente.
 */
export function CambiarVista({
  vista,
  rol,
}: {
  vista: 'admin' | 'asesor'
  rol: Rol
}) {
  if (rol !== 'admin') return null

  const enAsesor = vista === 'asesor'

  return (
    <div
      className={`mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-4 py-2.5 text-sm ${
        enAsesor
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-slate-200 bg-white text-slate-600'
      }`}
    >
      <p className="min-w-0">
        {enAsesor ? (
          <>
            <span className="font-semibold">Vista de asesor.</span> Ves tus
            propios leads, no los del equipo.
          </>
        ) : (
          <>
            <span className="font-semibold">Vista de dirección.</span> Ves todo
            lo de la agencia.
          </>
        )}
      </p>

      <Link
        href={enAsesor ? '/admin' : '/asesor'}
        className={`flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 font-medium transition-colors ${
          enAsesor
            ? 'text-amber-900 hover:bg-amber-100'
            : 'text-slate-900 hover:bg-slate-100'
        }`}
      >
        <ArrowLeftRight className="size-4 shrink-0" aria-hidden />
        {enAsesor ? 'Volver a dirección' : 'Ver como asesor'}
      </Link>
    </div>
  )
}
