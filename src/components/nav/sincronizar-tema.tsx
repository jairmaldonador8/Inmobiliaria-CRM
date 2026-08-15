'use client'

import { useEffect } from 'react'

/**
 * Alinea el tema del dispositivo con la preferencia del USUARIO (columna
 * usuarios.tema): si entra en una compu nueva donde la cookie no coincide,
 * al montar se aplica su tema y se corrige la cookie. El switch de la luna
 * guarda en ambos lados, así que nunca pelean.
 */
export function SincronizarTema({ tema }: { tema: 'blanco' | 'negro' }) {
  useEffect(() => {
    const oscuroDeseado = tema === 'negro'
    const raiz = document.documentElement
    if (raiz.classList.contains('dark') !== oscuroDeseado) {
      raiz.classList.toggle('dark', oscuroDeseado)
      document.cookie = `tema=${tema}; path=/; max-age=31536000; samesite=lax`
    }
  }, [tema])

  return null
}
