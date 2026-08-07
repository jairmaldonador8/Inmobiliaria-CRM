/**
 * Aplica un archivo .sql al proyecto Supabase vía Management API.
 *
 * Es el flujo con el que se aplicó 0007 (ver docs/decisiones.md); este script
 * lo deja repetible en vez de pegar SQL a mano en el editor web.
 *
 *   node scripts/aplicar-migracion.mjs supabase/migrations/0008_visitas_gcal.sql
 *   node scripts/aplicar-migracion.mjs --sql "select 1"     # consulta suelta
 *
 * Requiere SUPABASE_ACCESS_TOKEN en .env.local (token personal de Supabase).
 * El token nunca se imprime.
 */
import { config } from 'dotenv'
import { readFile } from 'node:fs/promises'

// El proyecto guarda sus secretos en .env.local (dotenv lee .env por default).
config({ path: '.env.local', quiet: true })

const REF_PRODUCCION = 'sdyyczntaydzodyjtpgc'

// Por defecto se apunta a DESARROLLO. Tocar producción exige decirlo en voz
// alta con --prod (o SUPABASE_PROJECT_REF explícito): este script ejecuta SQL
// arbitrario y el proyecto de producción tiene datos reales de clientes.
const pidioProd = process.argv.includes('--prod')
const PROJECT_REF = pidioProd
  ? REF_PRODUCCION
  : (process.env.SUPABASE_PROJECT_REF ?? process.env.SUPABASE_DEV_REF)

if (!PROJECT_REF) {
  console.error(
    'No sé a qué proyecto apuntar. Define SUPABASE_DEV_REF en .env.local, ' +
      'o pasa SUPABASE_PROJECT_REF=<ref>, o usa --prod para producción.'
  )
  process.exit(1)
}

async function ejecutar(sql) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    throw new Error('Falta SUPABASE_ACCESS_TOKEN en .env.local')
  }

  const respuesta = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  )

  const texto = await respuesta.text()
  if (!respuesta.ok) {
    throw new Error(`Supabase respondió ${respuesta.status}: ${texto}`)
  }

  try {
    return JSON.parse(texto)
  } catch {
    return texto
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--prod')
  if (args.length === 0) {
    console.error(
      'Uso: node scripts/aplicar-migracion.mjs [--prod] <archivo.sql | --sql "SELECT ...">\n' +
        'Sin --prod apunta al proyecto de DESARROLLO (SUPABASE_DEV_REF).'
    )
    process.exit(1)
  }

  const [primero, ...resto] = args
  const sql =
    primero === '--sql' ? resto.join(' ') : await readFile(primero, 'utf8')
  const origen = primero === '--sql' ? 'consulta directa' : primero

  const etiqueta = PROJECT_REF === REF_PRODUCCION ? 'PRODUCCIÓN ⚠️' : 'desarrollo'
  console.log(`[migracion] ejecutando ${origen} en ${etiqueta} (${PROJECT_REF})…`)
  const resultado = await ejecutar(sql)
  console.log('[migracion] OK')
  console.log(JSON.stringify(resultado, null, 2))
}

main().catch((error) => {
  console.error('[migracion] FALLÓ:', error.message)
  process.exit(1)
})
