// Perfil de trabajo de Jair: una cuenta admin y una cuenta asesor, para poder
// ver los dos lados del sistema al mismo tiempo (admin en la ventana normal,
// asesor en una de incognito) y cazar bugs de adopcion.
//
// Por que dos cuentas y no una con los dos roles: `usuarios` tiene PK user_id
// y `rol` es un enum de un solo valor (0001_schema.sql:7,33); RLS cuelga de esa
// misma fila via private.is_admin() (0002_rls.sql:17) y requireAsesor() rechaza
// explicitamente a un admin (src/lib/auth/usuario-actual.ts:63). Meter un rol
// combinado obliga a tocar enum + auth hook + helpers + proxy + cada policy.
//
// IDEMPOTENTE: seguro de correr repetidas veces.
//
// GUARDA: aborta si apunta al proyecto de PRODUCCION salvo PERMITIR_PROD=1.
//
// Uso: npm run perfil:jair

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) {
  console.error(
    'Faltan variables de entorno. Se requieren NEXT_PUBLIC_SUPABASE_URL, ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY en .env.local'
  );
  process.exit(1);
}

// =====================================================================
// Guarda de entorno
// =====================================================================
const REF_PROD = 'sdyyczntaydzodyjtpgc';
const refDestino = new URL(SUPABASE_URL).hostname.split('.')[0];

if (refDestino === REF_PROD && process.env.PERMITIR_PROD !== '1') {
  console.error(
    `ABORTADO: ${SUPABASE_URL} es el proyecto de PRODUCCION.\n` +
      'Este script crea leads de prueba; en produccion eso ensucia datos reales.\n' +
      'Si de verdad lo quieres en prod, corre con PERMITIR_PROD=1 y SIN_LEADS=1.'
  );
  process.exit(1);
}

// Cliente admin (service-role / secret key): ignora RLS, gestiona auth.users.
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Mismo password que el seed de desarrollo. En produccion se define aparte:
// PERFIL_PASSWORD=... npm run perfil:jair
const PASSWORD = process.env.PERFIL_PASSWORD ?? 'Password123!';
const SIN_LEADS = process.env.SIN_LEADS === '1';

const EMAIL_ADMIN = 'jairmaldonador8@gmail.com';
// Plus-addressing: Gmail entrega los "+" al mismo buzon, asi que los correos y
// notificaciones de la cuenta asesor llegan a la misma bandeja.
const EMAIL_ASESOR = 'jairmaldonador8+asesor@gmail.com';

type PerfilUser = { email: string; nombre: string; rol: 'admin' | 'asesor' };

const PERFILES: PerfilUser[] = [
  { email: EMAIL_ADMIN, nombre: 'Jair Maldonado', rol: 'admin' },
  { email: EMAIL_ASESOR, nombre: 'Jair (asesor de prueba)', rol: 'asesor' },
];

let failed = false;

function fail(msg: string) {
  console.error(`FALLO: ${msg}`);
  failed = true;
}

// =====================================================================
// 1. Agencia
// =====================================================================
async function obtenerAgencia(): Promise<string> {
  const { data: existing, error } = await admin
    .from('agencias')
    .select('id')
    .eq('nombre', 'Montana Realty')
    .maybeSingle();

  if (error) throw error;

  if (existing) {
    console.log(`Agencia "Montana Realty" encontrada (id=${existing.id})`);
    return existing.id;
  }

  const { data: created, error: insertError } = await admin
    .from('agencias')
    .insert({ nombre: 'Montana Realty' })
    .select('id')
    .single();

  if (insertError) throw insertError;

  console.log(`Agencia "Montana Realty" creada (id=${created.id})`);
  return created.id;
}

// =====================================================================
// 2. Cuentas
// =====================================================================
async function findAuthUserByEmail(email: string) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function crearPerfil(agenciaId: string, perfil: PerfilUser): Promise<string> {
  let authUserId: string;

  const { data: createData, error: createError } = await admin.auth.admin.createUser({
    email: perfil.email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (createError) {
    const existing = await findAuthUserByEmail(perfil.email);
    if (!existing) {
      throw new Error(
        `createUser fallo para ${perfil.email} (${createError.message}) y no se encontro via listUsers`
      );
    }
    authUserId = existing.id;
    console.log(`Auth user ${perfil.email} ya existia (id=${authUserId})`);

    // Password conocido para poder entrar; en prod se pasa PERFIL_PASSWORD.
    const { error: updateAuthError } = await admin.auth.admin.updateUserById(authUserId, {
      password: PASSWORD,
    });
    if (updateAuthError) throw updateAuthError;
    console.log(`Password de ${perfil.email} actualizado`);
  } else {
    authUserId = createData.user.id;
    console.log(`Auth user ${perfil.email} creado (id=${authUserId})`);
  }

  const { data: existingUsuario, error: selectError } = await admin
    .from('usuarios')
    .select('user_id')
    .eq('user_id', authUserId)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existingUsuario) {
    const { error: updateError } = await admin
      .from('usuarios')
      .update({ agencia_id: agenciaId, rol: perfil.rol, nombre: perfil.nombre, activo: true })
      .eq('user_id', authUserId);
    if (updateError) throw updateError;
    console.log(`Fila usuarios de ${perfil.email} actualizada (rol=${perfil.rol}, activo=true)`);
  } else {
    const { error: insertError } = await admin.from('usuarios').insert({
      user_id: authUserId,
      agencia_id: agenciaId,
      rol: perfil.rol,
      nombre: perfil.nombre,
    });
    if (insertError) throw insertError;
    console.log(`Fila usuarios de ${perfil.email} creada (rol=${perfil.rol})`);
  }

  return authUserId;
}

// =====================================================================
// 3. Leads del asesor de prueba
// =====================================================================
// Los 3 leads del seed se quedan en bandeja (asesor_id null) a proposito: son
// los que sirven para probar el flujo "admin asigna -> al asesor le llega".
// Estos otros nacen ya asignados y repartidos por etapa, para que el kanban y
// el pipeline del asesor tengan contenido desde el primer login.
type LeadPrueba = {
  nombre: string;
  telefono: string;
  email: string | null;
  fuente: 'portal' | 'whatsapp' | 'referido' | 'redes' | 'walk_in' | 'otro';
  etapa: 'nuevo' | 'contactado' | 'cita_agendada' | 'visita_realizada' | 'negociacion';
  interes: 'compra' | 'renta';
  presupuesto: number | null;
  zona_interes: string | null;
};

const LEADS_PRUEBA: LeadPrueba[] = [
  {
    nombre: 'Mariana Quiroga',
    telefono: '5559000001',
    email: 'mariana.quiroga@example.com',
    fuente: 'portal',
    etapa: 'nuevo',
    interes: 'compra',
    presupuesto: 8500000,
    zona_interes: 'Valle Oriente',
  },
  {
    nombre: 'Diego Fuentes',
    telefono: '5559000002',
    email: 'diego.fuentes@example.com',
    fuente: 'whatsapp',
    etapa: 'contactado',
    interes: 'compra',
    presupuesto: 12000000,
    zona_interes: 'Carrizalejo',
  },
  {
    nombre: 'Paulina Estrada',
    telefono: '5559000003',
    email: 'paulina.estrada@example.com',
    fuente: 'referido',
    etapa: 'cita_agendada',
    interes: 'compra',
    presupuesto: 6200000,
    zona_interes: 'Del Valle',
  },
  {
    nombre: 'Ricardo Ibarra',
    telefono: '5559000004',
    email: null,
    fuente: 'redes',
    etapa: 'visita_realizada',
    interes: 'renta',
    presupuesto: 45000,
    zona_interes: 'San Jeronimo',
  },
  {
    nombre: 'Sofia Cantu',
    telefono: '5559000005',
    email: 'sofia.cantu@example.com',
    fuente: 'portal',
    etapa: 'negociacion',
    interes: 'compra',
    presupuesto: 15800000,
    zona_interes: 'Valle Poniente',
  },
];

// Leads propios de la cuenta ADMIN. Sin esto, al usar el switcher "Ver como
// asesor" la pantalla sale vacia (los de arriba son de la cuenta +asesor) y es
// facilisimo leer "mi pipeline vacio" como "el sistema no trae leads".
const LEADS_ADMIN: LeadPrueba[] = [
  {
    nombre: 'Alejandro Villarreal',
    telefono: '5559100001',
    email: 'alejandro.villarreal@example.com',
    fuente: 'referido',
    etapa: 'contactado',
    interes: 'compra',
    presupuesto: 19500000,
    zona_interes: 'Sierra Madre',
  },
  {
    nombre: 'Renata Solis',
    telefono: '5559100002',
    email: 'renata.solis@example.com',
    fuente: 'portal',
    etapa: 'cita_agendada',
    interes: 'compra',
    presupuesto: 9800000,
    zona_interes: 'Cumbres',
  },
  {
    nombre: 'Tomas Berlanga',
    telefono: '5559100003',
    email: null,
    fuente: 'walk_in',
    etapa: 'negociacion',
    interes: 'renta',
    presupuesto: 62000,
    zona_interes: 'Centrito Valle',
  },
];

const NOTA_PRUEBA = 'Lead de prueba — creado por scripts/perfil-jair.ts';

async function crearLeads(
  agenciaId: string,
  asesorId: string,
  lista: LeadPrueba[]
): Promise<number> {
  let count = 0;
  for (const lead of lista) {
    const { data: existing, error: selectError } = await admin
      .from('leads')
      .select('id')
      .eq('agencia_id', agenciaId)
      .eq('telefono', lead.telefono)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing) {
      // Reafirmamos ownership y etapa: si una corrida anterior los movio, el
      // script vuelve a dejar el tablero en el estado conocido.
      const { error: updateError } = await admin
        .from('leads')
        .update({ asesor_id: asesorId, etapa: lead.etapa })
        .eq('id', existing.id);
      if (updateError) throw updateError;
      console.log(`Lead "${lead.nombre}" ya existia (id=${existing.id}) -> etapa=${lead.etapa}`);
      count += 1;
      continue;
    }

    const { data: created, error: insertError } = await admin
      .from('leads')
      .insert({
        agencia_id: agenciaId,
        nombre: lead.nombre,
        telefono: lead.telefono,
        email: lead.email,
        fuente: lead.fuente,
        etapa: lead.etapa,
        interes: lead.interes,
        presupuesto: lead.presupuesto,
        zona_interes: lead.zona_interes,
        notas: NOTA_PRUEBA,
        asesor_id: asesorId,
        asignado_en: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    console.log(`Lead "${lead.nombre}" creado (id=${created.id}, etapa=${lead.etapa})`);
    count += 1;
  }
  return count;
}

// =====================================================================
// 4. Verificacion end-to-end: auth hook + RLS
// =====================================================================
function decodeJwtPayload(accessToken: string): Record<string, unknown> {
  const parts = accessToken.split('.');
  if (parts.length !== 3) throw new Error('access_token no tiene forma de JWT (header.payload.signature)');
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

async function verificar(leadsEsperadosAsesor: number): Promise<void> {
  console.log('\n--- Verificacion end-to-end: auth hook + RLS ---');

  const clientes: Array<{ email: string; rolEsperado: 'admin' | 'asesor'; client: ReturnType<typeof createClient> }> =
    PERFILES.map((p) => ({
      email: p.email,
      rolEsperado: p.rol,
      client: createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!),
    }));

  for (const c of clientes) {
    const { data, error } = await c.client.auth.signInWithPassword({
      email: c.email,
      password: PASSWORD,
    });

    if (error || !data.session) {
      fail(`sign-in ${c.email} fallo: ${error?.message}`);
      continue;
    }

    const payload = decodeJwtPayload(data.session.access_token);
    if (payload.user_role !== c.rolEsperado) {
      fail(
        `JWT de ${c.email} no trae user_role === "${c.rolEsperado}" (valor: ${JSON.stringify(payload.user_role)}). El auth hook no esta funcionando.`
      );
    } else {
      console.log(`OK: ${c.email} -> user_role === "${c.rolEsperado}" en el JWT`);
    }
  }

  const clienteAdmin = clientes.find((c) => c.rolEsperado === 'admin')!.client;
  const clienteAsesor = clientes.find((c) => c.rolEsperado === 'asesor')!.client;

  // El asesor solo debe ver los suyos (los 3 de bandeja del seed no le tocan).
  const { data: leadsAsesor, error: errAsesor } = await clienteAsesor.from('leads').select('id');
  if (errAsesor) {
    fail(`select leads como asesor fallo: ${errAsesor.message}`);
  } else if (leadsAsesor.length !== leadsEsperadosAsesor) {
    fail(
      `RLS: el asesor ve ${leadsAsesor.length} leads, esperados ${leadsEsperadosAsesor} (solo los propios; la bandeja no le pertenece)`
    );
  } else {
    console.log(`OK: el asesor ve ${leadsAsesor.length} leads (solo los suyos, RLS por ownership)`);
  }

  // El admin ve todo via policy is_admin().
  const { data: leadsAdmin, error: errAdmin } = await clienteAdmin.from('leads').select('id');
  if (errAdmin) {
    fail(`select leads como admin fallo: ${errAdmin.message}`);
  } else if (leadsAdmin.length < leadsEsperadosAsesor) {
    fail(`RLS: el admin ve ${leadsAdmin.length} leads, deberia ver al menos ${leadsEsperadosAsesor}`);
  } else {
    console.log(`OK: el admin ve ${leadsAdmin.length} leads (RLS is_admin())`);
  }

  await Promise.all(clientes.map((c) => c.client.auth.signOut()));
}

// =====================================================================
// main
// =====================================================================
async function main() {
  console.log(`Destino: ${SUPABASE_URL} (ref ${refDestino})\n`);

  const agenciaId = await obtenerAgencia();

  const ids = new Map<string, string>();
  for (const perfil of PERFILES) {
    ids.set(perfil.rol, await crearPerfil(agenciaId, perfil));
  }

  let leadsDelAsesor = 0;
  let leadsDelAdmin = 0;
  if (SIN_LEADS) {
    console.log('\nSIN_LEADS=1: no se crean leads de prueba.');
  } else {
    leadsDelAsesor = await crearLeads(agenciaId, ids.get('asesor')!, LEADS_PRUEBA);
    console.log(`\nLeads de la cuenta asesor: ${leadsDelAsesor}`);
    leadsDelAdmin = await crearLeads(agenciaId, ids.get('admin')!, LEADS_ADMIN);
    console.log(`Leads propios de la cuenta admin (para «Ver como asesor»): ${leadsDelAdmin}`);
  }

  await verificar(leadsDelAsesor);

  if (failed) {
    console.error('\nPerfil creado CON FALLOS en la verificacion. Ver mensajes FALLO arriba.');
    process.exit(1);
  }

  console.log('\nListo. Entra con:');
  console.log(`  admin  -> ${EMAIL_ADMIN}`);
  console.log(`  asesor -> ${EMAIL_ASESOR}`);
  console.log('Abre uno en tu ventana normal y el otro en una de incognito.');
}

main().catch((err) => {
  console.error('Abortado por error inesperado:', err);
  process.exit(1);
});
