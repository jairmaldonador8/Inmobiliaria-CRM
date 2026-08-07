'use client'

import { useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { Lightbulb } from 'lucide-react'

import { crearSugerencia } from '@/lib/sugerencias/acciones'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * Botón flotante 💡 discreto, presente en ambos layouts (admin y asesor).
 * Abre un dialog con una sola pregunta abierta; la pantalla actual se
 * captura sola con usePathname(), el usuario no la escribe.
 */
export function BotonSugerencia({ className }: { className?: string }) {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  function alCambiarAbierto(abrir: boolean) {
    setAbierto(abrir)
    if (!abrir) {
      setTexto('')
      setError(null)
    }
  }

  function alEnviar() {
    setError(null)
    iniciarTransicion(async () => {
      const resultado = await crearSugerencia(pathname, texto)

      if ('error' in resultado) {
        setError(resultado.error)
        return
      }

      toast.success('¡Gracias! Tu sugerencia quedó registrada')
      alCambiarAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={alCambiarAbierto}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            size="icon-lg"
            aria-label="Enviar sugerencia"
            className={cn(
              // bottom-36 por defecto: encima de la barra de pestañas
              // inferior (h-16) Y del botón «+ Registrar lead» del kanban
              // del asesor (bottom-20 + h-12) — es el valor que usa
              // asesor/layout.tsx. El admin no tiene ese segundo botón y
              // sobreescribe a bottom-24 en móvil. En escritorio (`lg`, sin
              // barra de pestañas) ambos layouts sobreescriben a bottom-6
              // vía `className` (ver admin/layout.tsx y asesor/layout.tsx).
              'fixed right-4 bottom-36 z-40 size-11 rounded-full shadow-lg',
              className
            )}
          />
        }
      >
        <Lightbulb aria-hidden />
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Tienes una sugerencia?</DialogTitle>
          <DialogDescription>¿Qué mejorarías? ¿Qué te estorba?</DialogDescription>
        </DialogHeader>

        <Textarea
          autoFocus
          rows={4}
          placeholder="Cuéntanos qué te gustaría cambiar..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={pendiente}
          maxLength={2000}
        />

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" onClick={alEnviar} disabled={pendiente || !texto.trim()}>
            {pendiente ? 'Enviando…' : 'Enviar sugerencia'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
