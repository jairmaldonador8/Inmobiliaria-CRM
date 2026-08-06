'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Aparición al hacer scroll (port del IntersectionObserver de la propuesta).
 * Recibe las clases del CSS module por props para mantener el scope.
 */
export function Reveal({
  className,
  inClassName,
  children,
}: {
  className: string
  inClassName: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return

    const io = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            entrada.target.classList.add(inClassName)
            io.unobserve(entrada.target)
          }
        }
      },
      { threshold: 0.12 }
    )

    io.observe(nodo)
    return () => io.disconnect()
  }, [inClassName])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
