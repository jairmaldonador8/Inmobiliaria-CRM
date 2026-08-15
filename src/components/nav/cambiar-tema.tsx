'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Switch de tema PLUMA (blanco galería ↔ negro editorial). Alterna la clase
 * `dark` en <html> — la escala galería es de variables vivas, así que TODA
 * la app se re-viste al instante — y persiste en la cookie `tema`, que el
 * RootLayout lee en el servidor para que no haya parpadeo al recargar.
 *
 * La preferencia por USUARIO (guardada en su perfil, elegida en su
 * bienvenida) llega con el bloque «Bienvenida»; la cookie es el mecanismo
 * de transporte en este dispositivo.
 */
export function CambiarTema({ className }: { className?: string }) {
  // null hasta montar: el ícono depende del DOM y evita desajustes de SSR.
  const [oscuro, setOscuro] = useState<boolean | null>(null)

  useEffect(() => {
    // Lectura del DOM tras montar: en SSR no existe documento y arrancar en
    // null evita el desajuste de hidratación del ícono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOscuro(document.documentElement.classList.contains('dark'))
  }, [])

  function alternar() {
    const activado = document.documentElement.classList.toggle('dark')
    setOscuro(activado)
    document.cookie = `tema=${activado ? 'negro' : 'blanco'}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={oscuro ? 'Tema claro' : 'Tema oscuro'}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-full transition-colors',
        'text-slate-400 hover:bg-slate-100 hover:text-slate-900',
        className
      )}
    >
      {oscuro === null ? (
        <Moon className="size-4 opacity-0" aria-hidden />
      ) : oscuro ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </button>
  )
}
