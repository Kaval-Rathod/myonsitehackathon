import { Router } from 'express';
import { replay } from '../domain/reconciliation';
import { VerificationEvent } from '@greenlink/shared';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { events } = req.body;

    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Missing or invalid events list' } });
    }

    if (events.length === 0) {
      return res.status(400).json({ error: { code: 'EMPTY_INPUT', message: 'Cannot replay empty events list' } });
    }

    const decision = replay(events as VerificationEvent[]);

    return res.json({
      decision,
    });
  } catch (error: any) {
    if (error.name === 'DomainError' || error.code) {
      return res.status(400).json({ error: { code: error.code || 'DOMAIN_ERROR', message: error.message } });
    }
    console.error('Error in POST /replay:', error);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

export default router;
