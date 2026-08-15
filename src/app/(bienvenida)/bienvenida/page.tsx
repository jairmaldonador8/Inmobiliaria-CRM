import { redirect } from 'next/navigation'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { FlujoBienvenida } from '@/components/bienvenida/flujo-bienvenida'

/**
 * La introducción del asesor: la primera pantalla que ve al entrar por
 * primera vez. Elige su tema PLUMA, activa sus avisos y conoce las tres
 * promesas del sistema — con Klo recibiéndolo. Fuera del layout del asesor
 * a propósito (sin nav): es un momento, no una pantalla más.
 */
export default async function PaginaBienvenida() {
  const usuario = await requireAsesor()
  if (usuario.bienvenida_completada) redirect('/asesor')

  return <FlujoBienvenida nombre={usuario.nombre} temaInicial={usuario.tema} />
}
