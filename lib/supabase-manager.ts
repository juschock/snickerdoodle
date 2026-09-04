import { createClient } from '@supabase/supabase-js';

type PublicSupabaseConfig = { url: string; anonKey: string };

function legacyJwtRole(key: string) {
  const segments = key.split('.');
  if (segments.length !== 3 || segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) return null;
  try {
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = globalThis.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const payload = JSON.parse(decoded) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function isRecognizedPublicSupabaseKey(key: string) {
  if (key.length < 20 || key.length > 4096) return false;
  if (/^sb_secret_/i.test(key)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  return legacyJwtRole(key) === 'anon';
}

export function readPublicSupabaseConfig(url: string | undefined, anonKey: string | undefined): PublicSupabaseConfig | null {
  if (!url || !anonKey || !isRecognizedPublicSupabaseKey(anonKey)) return null;
  try {
    const parsed = new URL(url);
    const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    if (
      (parsed.protocol !== 'https:' && !(isLoopback && parsed.protocol === 'http:')) ||
      parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash ||
      parsed.origin !== url.replace(/\/$/, '')
    ) return null;
    return { url: parsed.origin, anonKey };
  } catch {
    return null;
  }
}

export function createSupabaseOwnerAuthClient(url: string, anonKey: string) {
  const config = readPublicSupabaseConfig(url, anonKey);
  if (!config) throw new Error('Manager authentication is not configured.');
  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

export function createSupabaseOwnerRecoveryClient(url: string, anonKey: string) {
  const config = readPublicSupabaseConfig(url, anonKey);
  if (!config) throw new Error('Owner password recovery is not configured.');

  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: (callbackUrl, params) =>
        callbackUrl.pathname === '/snickerdoodle/auth/recovery' &&
        params.type === 'recovery',
      flowType: 'implicit'
    }
  });
}

export function getSupabaseManagerClient(accessToken: string) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const config = readPublicSupabaseConfig(url, anonKey);
  if (!config) throw new Error('Manager queue is not configured.');

  return createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

export async function verifySupabaseOwnerAal2(accessToken: string) {
  const client = getSupabaseManagerClient(accessToken);
  const [{ data: userData, error: userError }, { data: aalData, error: aalError }] =
    await Promise.all([
      client.auth.getUser(accessToken),
      client.auth.mfa.getAuthenticatorAssuranceLevel(accessToken)
    ]);

  return !userError && !aalError && Boolean(userData.user) && aalData.currentLevel === 'aal2';
}

export async function verifySupabaseActiveOwnerAal2(accessToken: string) {
  if (!await verifySupabaseOwnerAal2(accessToken)) return false;

  const client = getSupabaseManagerClient(accessToken);
  const { error } = await client.rpc('read_intake_manager_queue', {
    p_limit: 1,
    p_before_updated_at: null,
    p_before_queue_receipt_id: null
  });
  return !error;
}
