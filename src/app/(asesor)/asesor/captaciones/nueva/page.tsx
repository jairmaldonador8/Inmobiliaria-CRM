import { requireAsesor } from '@/lib/auth/usuario-actual'
import { FormCaptacion } from '@/components/captaciones/form-captacion'

/** Alta de una captación nueva (nace como borrador al primer guardado). */
export default async function PaginaNuevaCaptacion() {
  const usuario = await requireAsesor()
  return <FormCaptacion captacion={null} userId={usuario.user_id} />
}
