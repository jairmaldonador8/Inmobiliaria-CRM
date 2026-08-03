import { FormLogin } from '@/components/auth/form-login'

/**
 * Landing = login. Si ya hay sesión válida, el proxy redirige al área del
 * rol antes de llegar aquí.
 */
export default function PaginaLogin() {
  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-12">
      <main className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span
            aria-hidden
            className="flex size-11 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold tracking-widest text-slate-50"
          >
            MR
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
            Montana Realty
          </h1>
          <p className="mt-1 text-sm text-slate-500">Sistema interno</p>
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
