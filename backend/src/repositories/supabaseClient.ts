import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Use placeholder values if not provided, to prevent createClient from crashing 
// during fast in-memory tests where these env vars are intentionally omitted.
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'placeholder';

// We do not use WebSockets/Realtime in this backend.
// Supabase-js natively checks for a WebSocket constructor and throws in Node < 22.
// Passing a dummy class bypasses this check without needing to install "ws".
class DummyWebSocket {}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    transport: DummyWebSocket as any,
  },
});
