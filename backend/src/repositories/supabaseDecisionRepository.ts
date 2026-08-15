import { Decision } from '@greenlink/shared';
import { DecisionRepository } from './interfaces';
import { supabase } from './supabaseClient';

export class SupabaseDecisionRepository implements DecisionRepository {
  async getLatestDecision(verificationId: string): Promise<Decision | null> {
    const { data, error } = await supabase
      .from('verification_decisions')
      .select('*')
      .eq('verification_id', verificationId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error('Failed to fetch latest decision: ' + error.message);
    }

    return data as Decision | null;
  }

  async saveDecision(decision: Decision): Promise<Decision> {
    const { data, error } = await supabase
      .from('verification_decisions')
      .insert({
        verification_id: decision.verification_id,
        version: decision.version,
        status: decision.status,
        reason: decision.reason,
        state_hash: decision.state_hash,
        decision_timestamp: decision.decision_timestamp,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate key')) {
        throw new Error(`Unique constraint violation: decision version ${decision.version} already exists for verification ${decision.verification_id}`);
      }
      throw new Error('Failed to save decision: ' + error.message);
    }

    return data as Decision;
  }
}
