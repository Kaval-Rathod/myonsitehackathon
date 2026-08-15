/**
 * GreenLink Supabase Migration & Verification Script
 * - Applies migration from supabase/migrations/00000000000000_initial_schema.sql
 * - Verifies tables, columns, constraints, indexes, and RLS
 * - READ-SAFE: Uses IF NOT EXISTS, will not drop or modify existing data
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const projectRef = 'kevfmyczyhcpkvsdxzux';

class DummyWebSocket {}
const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: { transport: DummyWebSocket as any },
});

// ─── Helpers ────────────────────────────────────────────────────────────

async function rpcQuery(sql: string): Promise<any> {
  // Use the Supabase HTTP API to execute SQL via the pg-meta endpoint
  const resp = await fetch(`${supabaseUrl}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'X-Supabase-Api-Version': '2024-01-01',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SQL query failed (${resp.status}): ${text}`);
  }

  return resp.json();
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   GreenLink Supabase Migration & Verification Report    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // ── Step 1: Confirm project ────────────────────────────────────────
  console.log('1. PROJECT IDENTIFICATION');
  console.log(`   Project Ref:  ${projectRef}`);
  console.log(`   Project URL:  ${supabaseUrl}`);
  console.log(`   Service Key:  ${supabaseKey.substring(0, 12)}...`);
  console.log('');

  // ── Step 2: Check current schema BEFORE migration ──────────────────
  console.log('2. PRE-MIGRATION SCHEMA INSPECTION');
  
  let tablesExistBefore: Record<string, boolean> = {};
  const targetTables = ['verification_events', 'verification_decisions', 'audit_logs'];
  
  try {
    const result = await rpcQuery(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('verification_events', 'verification_decisions', 'audit_logs')
      ORDER BY table_name;
    `);
    
    const existingTables = (result || []).flatMap((r: any) => r.rows || r).map((r: any) => r.table_name);
    for (const t of targetTables) {
      tablesExistBefore[t] = existingTables.includes(t);
      console.log(`   ${tablesExistBefore[t] ? '✅' : '❌'} ${t}: ${tablesExistBefore[t] ? 'EXISTS' : 'MISSING'}`);
    }
  } catch (e: any) {
    console.log(`   ⚠️  Could not query information_schema via pg/query: ${e.message}`);
    console.log('   Falling back to PostgREST HEAD check...');
    
    for (const t of targetTables) {
      const { error } = await supabase.from(t).select('*', { count: 'exact', head: true });
      // Note: HEAD check can be unreliable - "schema cache" error = table not exposed
      tablesExistBefore[t] = !error;
      console.log(`   ${!error ? '⚠️  (HEAD OK)' : '❌'} ${t}: ${!error ? 'HEAD returns OK (but may not be in schema cache)' : error.message}`);
    }
  }
  console.log('');

  // ── Step 3: Check remote migration history ─────────────────────────
  console.log('3. REMOTE MIGRATION HISTORY');
  try {
    const result = await rpcQuery(`
      SELECT version, name, statements_applied_at 
      FROM supabase_migrations.schema_migrations 
      ORDER BY version;
    `);
    const migrations = (result || []).flatMap((r: any) => r.rows || r);
    if (migrations.length === 0) {
      console.log('   No migrations recorded in schema_migrations table.');
    } else {
      for (const m of migrations) {
        console.log(`   ${m.version} | ${m.name || '(unnamed)'} | ${m.statements_applied_at || ''}`);
      }
    }
  } catch (e: any) {
    console.log(`   ⚠️  Could not query migration history: ${e.message}`);
  }
  console.log('');

  // ── Step 4: Apply migration ────────────────────────────────────────
  console.log('4. APPLYING MIGRATION');
  const migrationPath = path.resolve(__dirname, '..', 'supabase', 'migrations', '00000000000000_initial_schema.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  console.log(`   Source: ${migrationPath}`);
  console.log(`   SQL length: ${migrationSql.length} bytes`);
  console.log('   All statements use IF NOT EXISTS - safe for re-runs.');
  console.log('');

  try {
    const result = await rpcQuery(migrationSql);
    console.log('   ✅ Migration applied successfully.');
  } catch (e: any) {
    console.log(`   ❌ Migration failed: ${e.message}`);
    // If pg/query fails, output the SQL for manual execution
    console.log('');
    console.log('   === MANUAL SQL (paste in Supabase SQL Editor) ===');
    console.log(migrationSql);
    console.log('   === END SQL ===');
  }
  console.log('');

  // ── Step 5: Post-migration verification ────────────────────────────
  console.log('5. POST-MIGRATION VERIFICATION');
  
  // 5a. Table existence
  console.log('   5a. Table Existence:');
  try {
    const result = await rpcQuery(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('verification_events', 'verification_decisions', 'audit_logs')
      ORDER BY table_name;
    `);
    const existingTables = (result || []).flatMap((r: any) => r.rows || r).map((r: any) => r.table_name);
    for (const t of targetTables) {
      const exists = existingTables.includes(t);
      console.log(`       ${exists ? '✅' : '❌'} public.${t}: ${exists ? 'EXISTS' : 'MISSING'}`);
    }
  } catch (e: any) {
    console.log(`       ⚠️  Could not verify via information_schema: ${e.message}`);
  }
  console.log('');

  // 5b. Column details
  console.log('   5b. Column Details:');
  try {
    const result = await rpcQuery(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('verification_events', 'verification_decisions', 'audit_logs')
      ORDER BY table_name, ordinal_position;
    `);
    const columns = (result || []).flatMap((r: any) => r.rows || r);
    let currentTable = '';
    for (const col of columns) {
      if (col.table_name !== currentTable) {
        currentTable = col.table_name;
        console.log(`       ── ${currentTable} ──`);
      }
      console.log(`         ${col.column_name.padEnd(22)} ${col.data_type.padEnd(30)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE'} ${col.column_default || ''}`);
    }
  } catch (e: any) {
    console.log(`       ⚠️  Could not verify columns: ${e.message}`);
  }
  console.log('');

  // 5c. Constraints (PK, UNIQUE)
  console.log('   5c. Constraints (PK, UNIQUE):');
  try {
    const result = await rpcQuery(`
      SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
             string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name IN ('verification_events', 'verification_decisions', 'audit_logs')
        AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
      GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
      ORDER BY tc.table_name, tc.constraint_type;
    `);
    const constraints = (result || []).flatMap((r: any) => r.rows || r);
    for (const c of constraints) {
      console.log(`       ✅ ${c.table_name}: ${c.constraint_type} (${c.columns}) [${c.constraint_name}]`);
    }
    if (constraints.length === 0) console.log('       ⚠️  No constraints found');
  } catch (e: any) {
    console.log(`       ⚠️  Could not verify constraints: ${e.message}`);
  }
  console.log('');

  // 5d. Indexes
  console.log('   5d. Indexes:');
  try {
    const result = await rpcQuery(`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('verification_events', 'verification_decisions', 'audit_logs')
      ORDER BY tablename, indexname;
    `);
    const indexes = (result || []).flatMap((r: any) => r.rows || r);
    for (const idx of indexes) {
      console.log(`       ✅ ${idx.tablename}: ${idx.indexname}`);
    }
    if (indexes.length === 0) console.log('       ⚠️  No indexes found');
  } catch (e: any) {
    console.log(`       ⚠️  Could not verify indexes: ${e.message}`);
  }
  console.log('');

  // 5e. RLS status
  console.log('   5e. RLS Status:');
  try {
    const result = await rpcQuery(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('verification_events', 'verification_decisions', 'audit_logs')
      ORDER BY tablename;
    `);
    const rlsData = (result || []).flatMap((r: any) => r.rows || r);
    for (const row of rlsData) {
      console.log(`       ${row.rowsecurity ? '🔒' : '🔓'} ${row.tablename}: RLS ${row.rowsecurity ? 'ENABLED' : 'DISABLED'}`);
    }
    if (rlsData.length === 0) console.log('       ⚠️  No RLS data found');
  } catch (e: any) {
    console.log(`       ⚠️  Could not verify RLS: ${e.message}`);
  }
  console.log('');

  // 5f. RLS Policies
  console.log('   5f. RLS Policies:');
  try {
    const result = await rpcQuery(`
      SELECT schemaname, tablename, policyname, permissive, roles, cmd
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('verification_events', 'verification_decisions', 'audit_logs')
      ORDER BY tablename, policyname;
    `);
    const policies = (result || []).flatMap((r: any) => r.rows || r);
    if (policies.length === 0) {
      console.log('       ℹ️  No RLS policies defined on these tables.');
    } else {
      for (const p of policies) {
        console.log(`       ${p.tablename}: ${p.policyname} (${p.cmd}, ${p.permissive}, roles: ${p.roles})`);
      }
    }
  } catch (e: any) {
    console.log(`       ⚠️  Could not query policies: ${e.message}`);
  }
  console.log('');

  // ── Step 6: Refresh PostgREST schema cache ─────────────────────────
  console.log('6. POSTGREST SCHEMA CACHE REFRESH');
  try {
    // Send NOTIFY to reload PostgREST schema cache
    await rpcQuery(`NOTIFY pgrst, 'reload schema';`);
    console.log('   ✅ Sent NOTIFY pgrst reload schema command.');
  } catch (e: any) {
    console.log(`   ⚠️  Could not send NOTIFY: ${e.message}`);
    console.log('   You can manually reload from: Supabase Dashboard > Settings > API > Reload Schema Cache');
  }
  console.log('');

  // ── Step 7: Final PostgREST verification ───────────────────────────
  console.log('7. FINAL POSTGREST VERIFICATION');
  // Wait a moment for schema cache to refresh
  await new Promise(r => setTimeout(r, 2000));

  for (const t of targetTables) {
    const { data, error } = await supabase.from(t).select('*').limit(0);
    if (error) {
      console.log(`   ❌ ${t}: PostgREST still cannot access - ${error.message}`);
    } else {
      console.log(`   ✅ ${t}: PostgREST accessible`);
    }
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                    REPORT COMPLETE                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
