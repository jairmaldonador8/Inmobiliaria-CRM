// Seed de desarrollo para CRM Montana Realty (Fase 1, Task 5).
//
// IDEMPOTENTE: seguro de correr repetidas veces (check-before-insert / upsert
// en todos los pasos). Corre contra el proyecto Supabase configurado en
// .env.local (puede ser local o el proyecto cloud "live").
//
// Uso: npm run seed

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

// Cliente admin (service-role / secret key): ignora RLS, gestiona auth.users.
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'Password123!';

type SeedUser = {
  email: string;
  nombre: string;
  rol: 'admin' | 'asesor';
};

const SEED_USERS: SeedUser[] = [
  { email: 'admin@montana.test', nombre: 'Admin Montana', rol: 'admin' },
  { email: 'asesor1@montana.test', nombre: 'Asesor Uno', rol: 'asesor' },
  { email: 'asesor2@montana.test', nombre: 'Asesor Dos', rol: 'asesor' },
];

let failed = false;

function fail(msg: string) {
  console.error(`FALLO: ${msg}`);
  failed = true;
}

// =====================================================================
// 1. Agencia "Montana Realty"
// =====================================================================
async function seedAgencia(): Promise<string> {
  const { data: existing, error: selectError } = await admin
    .from('agencias')
    .select('id')
    .eq('nombre', 'Montana Realty')
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    console.log(`Agencia "Montana Realty" ya existe (id=${existing.id})`);
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
// 2. Auth users + filas en usuarios
// =====================================================================
async function findAuthUserByEmail(email: string) {
  // auth.admin.listUsers no soporta filtro por email directo en todas las
  // versiones; paginamos y filtramos en memoria (la lista es pequeña en dev).
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

async function seedUser(agenciaId: string, seedUser: SeedUser): Promise<string> {
  let authUserId: string;

  const { data: createData, error: createError } = await admin.auth.admin.createUser({
    email: seedUser.email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (createError) {
    // Ya existe: lo buscamos en vez de fallar (idempotencia).
    const existing = await findAuthUserByEmail(seedUser.email);
    if (!existing) {
      throw new Error(
        `createUser fallo para ${seedUser.email} (${createError.message}) y no se encontro via listUsers`
      );
    }
    authUserId = existing.id;
    console.log(`Auth user ${seedUser.email} ya existia (id=${authUserId})`);
  } else {
    authUserId = createData.user.id;
    console.log(`Auth user ${seedUser.email} creado (id=${authUserId})`);
  }

  // Fila en usuarios: check-before-insert / update si ya existe.
  const { data: existingUsuario, error: selectError } = await admin
    .from('usuarios')
    .select('user_id')
    .eq('user_id', authUserId)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existingUsuario) {
    const { error: updateError } = await admin
      .from('usuarios')
      .update({ agencia_id: agenciaId, rol: seedUser.rol, nombre: seedUser.nombre, activo: true })
      .eq('user_id', authUserId);
    if (updateError) throw updateError;
    console.log(`Fila usuarios para ${seedUser.email} actualizada (rol=${seedUser.rol})`);
  } else {
    const { error: insertError } = await admin.from('usuarios').insert({
      user_id: authUserId,
      agencia_id: agenciaId,
      rol: seedUser.rol,
      nombre: seedUser.nombre,
    });
    if (insertError) throw insertError;
    console.log(`Fila usuarios para ${seedUser.email} creada (rol=${seedUser.rol})`);
  }

  return authUserId;
}

// =====================================================================
// 3. Leads de prueba en bandeja (asesor_id null)
// =====================================================================
type SeedLead = {
  nombre: string;
  telefono: string;
  email: string | null;
  fuente: 'portal' | 'whatsapp' | 'referido' | 'redes' | 'walk_in' | 'otro';
  zona_interes?: string;
};

const SEED_LEADS: SeedLead[] = [
  {
    nombre: 'Roberto Sanchez',
    telefono: '5551001001',
    email: 'roberto.sanchez@example.com',
    fuente: 'portal',
    zona_interes: 'Polanco',
  },
  {
    nombre: 'Fernanda Lopez',
    telefono: '5551001002',
    email: 'fernanda.lopez@example.com',
    fuente: 'whatsapp',
  },
  {
    nombre: 'Carlos Medina',
    telefono: '5551001003',
    email: null,
    fuente: 'referido',
  },
];

async function seedLeads(agenciaId: string): Promise<number> {
  let count = 0;
  for (const lead of SEED_LEADS) {
    const { data: existing, error: selectError } = await admin
      .from('leads')
      .select('id')
      .eq('agencia_id', agenciaId)
      .eq('telefono', lead.telefono)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing) {
      console.log(`Lead "${lead.nombre}" (${lead.telefono}) ya existe (id=${existing.id})`);
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
        zona_interes: lead.zona_interes ?? null,
        asesor_id: null,
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    console.log(`Lead "${lead.nombre}" (${lead.telefono}) creado (id=${created.id})`);
    count += 1;
  }
  return count;
}

// =====================================================================
// 4. Plantillas WhatsApp
// =====================================================================
type SeedPlantilla = { nombre: string; texto: string };

const SEED_PLANTILLAS: SeedPlantilla[] = [
  {
    nombre: 'Primer contacto',
    texto:
      'Hola {nombre}, soy {asesor} de Montana Realty. Recibimos tu interés, ¿te gustaría agendar una visita?',
  },
  {
    nombre: 'Compartir propiedad',
    texto: 'Hola {nombre}, te comparto: {propiedad} en {zona} — {precio}. ¿Te interesa verla?',
  },
];

async function seedPlantillas(agenciaId: string): Promise<void> {
  for (const plantilla of SEED_PLANTILLAS) {
    const { data: existing, error: selectError } = await admin
      .from('plantillas_mensajes')
      .select('id')
      .eq('agencia_id', agenciaId)
      .eq('nombre', plantilla.nombre)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing) {
      console.log(`Plantilla "${plantilla.nombre}" ya existe (id=${existing.id})`);
      continue;
    }

    const { data: created, error: insertError } = await admin
      .from('plantillas_mensajes')
      .insert({ agencia_id: agenciaId, nombre: plantilla.nombre, texto: plantilla.texto })
      .select('id')
      .single();

    if (insertError) throw insertError;

    console.log(`Plantilla "${plantilla.nombre}" creada (id=${created.id})`);
  }
}

// =====================================================================
// 5. Verificacion end-to-end: auth hook (user_role en JWT) + RLS smoke test
// =====================================================================

function decodeJwtPayload(accessToken: string): Record<string, unknown> {
  const parts = accessToken.split('.');
  if (parts.length !== 3) throw new Error('access_token no tiene forma de JWT (header.payload.signature)');
  const base64url = parts[1];
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const json = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(json);
}

async function verifyAuthHookAndRls(): Promise<void> {
  console.log('\n--- Verificacion end-to-end: auth hook + RLS ---');

  // --- admin ---
  const adminClient = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!);
  const { data: adminSignIn, error: adminSignInError } = await adminClient.auth.signInWithPassword({
    email: 'admin@montana.test',
    password: PASSWORD,
  });
  if (adminSignInError || !adminSignIn.session) {
    fail(`sign-in admin@montana.test fallo: ${adminSignInError?.message}`);
  } else {
    const payload = decodeJwtPayload(adminSignIn.session.access_token);
    console.log(`admin@montana.test -> user_role en JWT: ${payload.user_role ?? '(ausente)'}`);
    if (payload.user_role !== 'admin') {
      fail(
        `JWT de admin@montana.test no tiene user_role === "admin" (valor: ${JSON.stringify(payload.user_role)}). El auth hook desplegado no esta funcionando correctamente.`
      );
    } else {
      console.log('OK: user_role === "admin" confirmado en el JWT de admin@montana.test');
    }
  }

  // --- asesor1 ---
  const asesor1Client = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!);
  const { data: asesor1SignIn, error: asesor1SignInError } = await asesor1Client.auth.signInWithPassword({
    email: 'asesor1@montana.test',
    password: PASSWORD,
  });
  if (asesor1SignInError || !asesor1SignIn.session) {
    fail(`sign-in asesor1@montana.test fallo: ${asesor1SignInError?.message}`);
  } else {
    const payload = decodeJwtPayload(asesor1SignIn.session.access_token);
    console.log(`asesor1@montana.test -> user_role en JWT: ${payload.user_role ?? '(ausente)'}`);
    if (payload.user_role !== 'asesor') {
      fail(
        `JWT de asesor1@montana.test no tiene user_role === "asesor" (valor: ${JSON.stringify(payload.user_role)}). El auth hook desplegado no esta funcionando correctamente.`
      );
    } else {
      console.log('OK: user_role === "asesor" confirmado en el JWT de asesor1@montana.test');
    }
  }

  // --- RLS smoke test ---
  // asesor1: los 3 leads de seed estan en bandeja (asesor_id null) -> no le pertenecen -> debe ver 0.
  const { data: leadsAsesor1, error: leadsAsesor1Error } = await asesor1Client.from('leads').select('id');
  if (leadsAsesor1Error) {
    fail(`select leads como asesor1 fallo: ${leadsAsesor1Error.message}`);
  } else {
    console.log(`RLS: asesor1 ve ${leadsAsesor1.length} leads (esperado: 0, bandeja no pertenece a nadie)`);
    if (leadsAsesor1.length !== 0) {
      fail(`RLS incorrecto: asesor1 deberia ver 0 leads (bandeja) pero vio ${leadsAsesor1.length}`);
    } else {
      console.log('OK: asesor1 ve 0 leads (RLS ownership funcionando)');
    }
  }

  // admin: via policy is_admin() debe ver todos los leads de seed (>= 3).
  const { data: leadsAdmin, error: leadsAdminError } = await adminClient.from('leads').select('id');
  if (leadsAdminError) {
    fail(`select leads como admin fallo: ${leadsAdminError.message}`);
  } else {
    console.log(`RLS: admin ve ${leadsAdmin.length} leads (esperado: >= 3, via policy is_admin())`);
    if (leadsAdmin.length < 3) {
      fail(`RLS incorrecto: admin deberia ver al menos 3 leads pero vio ${leadsAdmin.length}`);
    } else {
      console.log(`OK: admin ve ${leadsAdmin.length} leads (RLS is_admin() funcionando)`);
    }
  }

  await adminClient.auth.signOut();
  await asesor1Client.auth.signOut();
}

// =====================================================================
// main
// =====================================================================
async function main() {
  console.log(`Seeding contra ${SUPABASE_URL}\n`);

  const agenciaId = await seedAgencia();

  for (const u of SEED_USERS) {
    await seedUser(agenciaId, u);
  }

  const leadCount = await seedLeads(agenciaId);
  await seedPlantillas(agenciaId);

  console.log(`\nLeads en bandeja: ${leadCount}`);

  await verifyAuthHookAndRls();

  if (failed) {
    console.error('\nSeed completo CON FALLOS en la verificacion end-to-end. Ver mensajes FALLO arriba.');
    process.exit(1);
  }

  console.log('\nSeed completo. Todas las verificaciones (auth hook + RLS) pasaron.');
}

main().catch((err) => {
  console.error('Seed abortado por error inesperado:', err);
  process.exit(1);
});
