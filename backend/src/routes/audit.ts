import { Router } from 'express';
import { getEventService } from '../controllers/eventController';
import { validate } from 'uuid';

const router = Router();

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    if (!id || !validate(id)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid UUID' } });
    }

    const eventService = getEventService();
    if (!eventService) {
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'EventService not configured' } });
    }

    const auditData = await eventService.getAuditHistory(id);

    // Map the internal history to the expected public format
    const history = auditData.history.map((log) => ({
      decision_version: log.decision_version,
      status: log.explanation.status,
      reason: log.explanation.reason,
      state_hash: log.state_hash,
      considered_event_ids: log.considered_event_ids,
      evidence: log.explanation.evidence,
      created_at: log.created_at,
    }));

    return res.json({
      verification_id: auditData.verification_id,
      events: auditData.events,
      history,
    });
  } catch (error: any) {
    console.error('Error in GET /audit/:id:', error);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

export default router;
