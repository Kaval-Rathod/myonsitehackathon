import { Request, Response } from 'express';
import { EventService } from '../services/eventService';
import { DomainError } from '../domain/reconciliation/types';
import { validate } from 'uuid';
import { VerificationEvent } from '@greenlink/shared';

// For simplicity in dependency injection, the controller can be a class or a factory function.
// Since it's exported as a single route handler `handleEvent`, let's inject it via a global or configure it properly.
// Wait, the router imports `handleEvent`. Let's create a configured service instance.
// But we want to inject InMemory vs Supabase. Let's provide a setter or global configuration.
let eventService: EventService;

export const setEventService = (service: EventService) => {
  eventService = service;
};

export const getEventService = () => {
  return eventService;
};

export const handleEvent = async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: { code: 'INVALID_EVENT', message: 'Payload must be a JSON object' } });
    }

    if (!payload.event_id || !validate(payload.event_id)) {
      return res.status(400).json({ error: { code: 'INVALID_EVENT', message: 'Invalid or missing event_id' } });
    }

    if (!payload.verification_id || !validate(payload.verification_id)) {
      return res.status(400).json({ error: { code: 'INVALID_EVENT', message: 'Invalid or missing verification_id' } });
    }

    if (!['ai', 'satellite', 'manual'].includes(payload.source)) {
      return res.status(400).json({ error: { code: 'INVALID_EVENT', message: 'Invalid source' } });
    }

    if (typeof payload.confidence !== 'number' || isNaN(payload.confidence) || !isFinite(payload.confidence) || payload.confidence < 0 || payload.confidence > 1) {
      return res.status(400).json({ error: { code: 'INVALID_EVENT', message: 'Invalid confidence' } });
    }

    if (!payload.timestamp || isNaN(Date.parse(payload.timestamp))) {
      return res.status(400).json({ error: { code: 'INVALID_EVENT', message: 'Invalid timestamp' } });
    }

    if (!payload.data || typeof payload.data !== 'object') {
      return res.status(400).json({ error: { code: 'INVALID_EVENT', message: 'Invalid or missing data' } });
    }

    // Pass to service
    if (!eventService) {
      throw new Error('EventService not configured');
    }

    const event = payload as VerificationEvent;
    
    // Normalize timestamp to standard ISO
    event.timestamp = new Date(event.timestamp).toISOString();

    const result = await eventService.processEvent(event);

    const statusCode = result.status === 'accepted' ? 201 : 200;

    return res.status(statusCode).json({
      status: result.status,
      event_id: event.event_id,
      verification_id: event.verification_id,
      decision: result.decision,
    });
  } catch (error: any) {
    if (error instanceof DomainError || error.name === 'DomainError') {
      if (error.code === 'DUPLICATE_EVENT_ID_CONFLICT') {
        return res.status(409).json({ error: { code: error.code, message: error.message } });
      }
      return res.status(400).json({ error: { code: error.code, message: error.message } });
    }

    console.error('Unhandled error in POST /events:', error);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};
