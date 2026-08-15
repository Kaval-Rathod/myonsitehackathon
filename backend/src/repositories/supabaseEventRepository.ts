import { VerificationEvent } from '@greenlink/shared';
import { EventRepository, InsertEventResult } from './interfaces';
import { supabase } from './supabaseClient';
import { DomainError } from '../domain/reconciliation/types';

export class SupabaseEventRepository implements EventRepository {
  private canonicalize(data: any): string {
    if (typeof data !== 'object' || data === null) {
      return JSON.stringify(data);
    }
    const keys = Object.keys(data).sort();
    const sorted: any = {};
    for (const k of keys) {
      sorted[k] = data[k];
    }
    return JSON.stringify(sorted);
  }

  async insertIfNew(event: VerificationEvent): Promise<InsertEventResult> {
    // 1. Try to fetch first (it's safe if we do upsert logic after)
    // Wait, the safest way is to try INSERT. If it fails due to UNIQUE constraint, fetch and compare.
    const { data: inserted, error: insertError } = await supabase
      .from('verification_events')
      .insert({
        event_id: event.event_id,
        verification_id: event.verification_id,
        source: event.source,
        confidence: event.confidence,
        timestamp: event.timestamp,
        data: event.data, // Supabase handles JSONB
      })
      .select()
      .single();

    if (insertError) {
      // 23505 is unique violation in Postgres
      if (insertError.code === '23505' || insertError.message.includes('duplicate key')) {
        // Fetch existing
        const { data: existing, error: fetchError } = await supabase
          .from('verification_events')
          .select('*')
          .eq('event_id', event.event_id)
          .single();

        if (fetchError || !existing) {
          throw new Error('Failed to fetch existing event after conflict: ' + fetchError?.message);
        }

        // Compare fields
        if (
          existing.verification_id !== event.verification_id ||
          existing.source !== event.source ||
          existing.confidence !== event.confidence ||
          new Date(existing.timestamp).getTime() !== new Date(event.timestamp).getTime() ||
          this.canonicalize(existing.data) !== this.canonicalize(event.data)
        ) {
          throw new DomainError('DUPLICATE_EVENT_ID_CONFLICT', 'Conflicting payload for event_id: ' + event.event_id);
        }

        return { isNew: false, event: existing as VerificationEvent };
      }
      throw new Error('Failed to insert event: ' + insertError.message);
    }

    return { isNew: true, event: inserted as VerificationEvent };
  }

  async getEventsByVerificationId(verificationId: string): Promise<VerificationEvent[]> {
    const { data, error } = await supabase
      .from('verification_events')
      .select('*')
      .eq('verification_id', verificationId);

    if (error) {
      throw new Error('Failed to fetch events: ' + error.message);
    }

    return data as VerificationEvent[];
  }

  async getEventById(eventId: string): Promise<VerificationEvent | null> {
    const { data, error } = await supabase
      .from('verification_events')
      .select('*')
      .eq('event_id', eventId)
      .maybeSingle();

    if (error) {
      throw new Error('Failed to fetch event by id: ' + error.message);
    }

    return data as VerificationEvent | null;
  }
}
