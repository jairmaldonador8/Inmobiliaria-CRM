// @vitest-environment jsdom
/**
 * Tests de `DialogEditarPlantilla`. Lo que se fija aquí es que los campos
 * nazcan con los valores VIGENTES de la plantilla en cada apertura: si el
 * asesor edita, cierra sin guardar y vuelve a abrir, no debe encontrarse su
 * borrador anterior.
 *
 * Ese reseteo solía hacerse sincronizando estado con un useEffect; ahora sale
 * del desmontaje del portal de Base UI (el estado vive dentro de
 * DialogContent). El test es agnóstico al mecanismo: solo mira lo que ve el
 * usuario, así que sigue valiendo si el componente se vuelve a refactorizar.
 *
 * Se mockea '@/lib/plantillas/acciones' porque arrastra 'server-only' — mismo
 * motivo que hoja-desenlace.test.tsx.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockEditarPlantilla = vi.fn()
vi.mock('@/lib/plantillas/acciones', () => ({
  editarPlantilla: (...args: unknown[]) => mockEditarPlantilla(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { DialogEditarPlantilla } from '@/components/plantillas/dialog-editar-plantilla'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const PLANTILLA = {
  id: 'plantilla-1',
  nombre: 'Primer contacto',
  texto: 'Hola {nombre}, soy {asesor} de Montana Realty.',
}

/** El input de nombre, ya tipado para poder leer su `.value`. */
function campoNombre() {
  return screen.getByLabelText(/nombre/i) as HTMLInputElement
}

describe('DialogEditarPlantilla', () => {
  it('cerrado no renderiza el formulario', () => {
    render(
      <DialogEditarPlantilla
        plantilla={PLANTILLA}
        abierto={false}
        onAbiertoChange={() => {}}
      />
    )

    expect(screen.queryByLabelText(/nombre/i)).not.toBeInTheDocument()
  })

  it('al abrir, los campos traen los valores de la plantilla', () => {
    render(
      <DialogEditarPlantilla
        plantilla={PLANTILLA}
        abierto
        onAbiertoChange={() => {}}
      />
    )

    expect(campoNombre().value).toBe('Primer contacto')
  })

  it('descarta el borrador: al reabrir vuelven los valores de la plantilla', () => {
    const { rerender } = render(
      <DialogEditarPlantilla
        plantilla={PLANTILLA}
        abierto
        onAbiertoChange={() => {}}
      />
    )

    // El asesor escribe algo y cierra SIN guardar.
    fireEvent.change(campoNombre(), { target: { value: 'borrador a medias' } })
    expect(campoNombre().value).toBe('borrador a medias')

    rerender(
      <DialogEditarPlantilla
        plantilla={PLANTILLA}
        abierto={false}
        onAbiertoChange={() => {}}
      />
    )
    rerender(
      <DialogEditarPlantilla
        plantilla={PLANTILLA}
        abierto
        onAbiertoChange={() => {}}
      />
    )

    expect(campoNombre().value).toBe('Primer contacto')
  })

  it('si la plantilla cambió por fuera, la siguiente apertura muestra lo nuevo', () => {
    const { rerender } = render(
      <DialogEditarPlantilla
        plantilla={PLANTILLA}
        abierto
        onAbiertoChange={() => {}}
      />
    )

    rerender(
      <DialogEditarPlantilla
        plantilla={PLANTILLA}
        abierto={false}
        onAbiertoChange={() => {}}
      />
    )
    rerender(
      <DialogEditarPlantilla
        plantilla={{ ...PLANTILLA, nombre: 'Primer contacto (v2)' }}
        abierto
        onAbiertoChange={() => {}}
      />
    )

    expect(campoNombre().value).toBe('Primer contacto (v2)')
  })
})
