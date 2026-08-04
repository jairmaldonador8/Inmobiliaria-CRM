'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { sincronizarAhora } from '@/lib/easybroker/acciones'
import { Button } from '@/components/ui/button'

/**
 * "Sincronizar ahora": corre el sync de EasyBroker bajo demanda. Puede tardar
 * ~1 min en corridas frías; el botón queda deshabilitado con spinner mientras
 * tanto y al final muestra un resumen en toast.
 */
export function BotonSincronizar() {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()

  function sincronizar() {
    iniciarTransicion(async () => {
      try {
        const resultado = await sincronizarAhora()

        if (resultado.omitido) {
          toast.info('Sincronización ya en curso')
          return
        }

        const propiedades =
          resultado.propiedades.nuevas + resultado.propiedades.actualizadas
        const resumen = `${propiedades} propiedad${propiedades === 1 ? '' : 'es'} actualizada${propiedades === 1 ? '' : 's'}, ${resultado.leads.nuevos} lead${resultado.leads.nuevos === 1 ? '' : 's'} nuevo${resultado.leads.nuevos === 1 ? '' : 's'}`

        if (resultado.errores.length > 0) {
          toast.warning(`Sincronización con errores: ${resumen}`)
        } else {
          toast.success(resumen)
        }
        router.refresh()
      } catch {
        toast.error('No se pudo sincronizar. Intenta de nuevo.')
      }
    })
  }

  return (
    <Button variant="outline" onClick={sincronizar} disabled={pendiente}>
      <RefreshCw aria-hidden data-icon="inline-start" className={pendiente ? 'animate-spin' : undefined} />
      {pendiente ? 'Sincronizando…' : 'Sincronizar ahora'}
    </Button>
  )
}
