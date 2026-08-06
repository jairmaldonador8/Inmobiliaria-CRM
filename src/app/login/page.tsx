import { FormLogin } from '@/components/auth/form-login'
import { Wordmark } from '@/components/marca/wordmark'

export const metadata = {
  title: 'Iniciar sesión · Klo-Ser',
}

/**
 * Login del equipo. La landing pública vive en /; el proxy manda aquí a
 * quien intenta entrar a un área protegida sin sesión, y de aquí al área
 * del rol cuando la sesión ya existe.
 */
export default function PaginaLogin() {
  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-12">
      <main className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <h1>
            <span className="sr-only">Klo-Ser — Sistema interno de Montana Realty</span>
            <Wordmark aria-hidden className="text-[27px] text-slate-900" />
          </h1>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">
            Montana Realty
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
          <FormLogin />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Acceso exclusivo para el equipo de Montana Realty
        </p>
      </main>
    </div>
  )
}
