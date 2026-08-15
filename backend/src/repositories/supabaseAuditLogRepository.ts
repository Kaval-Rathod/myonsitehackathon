import { AuditLog, AuditLogRepository } from './interfaces';
import { supabase } from './supabaseClient';

export class SupabaseAuditLogRepository implements AuditLogRepository {
  async saveAuditLog(log: AuditLog): Promise<AuditLog> {
    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        verification_id: log.verification_id,
        decision_version: log.decision_version,
        considered_event_ids: log.considered_event_ids,
        explanation: log.explanation,
        state_hash: log.state_hash,
      })
      .select()
      .single();

    if (error) {
      throw new Error('Failed to save audit log: ' + error.message);
    }

    return data as AuditLog;
  }

  async getAuditLogsByVerificationId(verificationId: string): Promise<AuditLog[]> {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('verification_id', verificationId)
      .order('decision_version', { ascending: true });

    if (error) {
      throw new Error('Failed to fetch audit logs: ' + error.message);
    }

    return data as AuditLog[];
  }
}
