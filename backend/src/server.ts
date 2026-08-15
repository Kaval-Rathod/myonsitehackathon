import express from 'express';
import dotenv from 'dotenv';
import healthRoutes from './routes/health';
import eventRoutes from './routes/events';
import auditRoutes from './routes/audit';
import replayRoutes from './routes/replay';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'EVENT_PAYLOAD_TOO_LARGE', message: 'Payload exceeds 10MB limit' }
    });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: { code: 'INVALID_EVENT', message: 'Malformed JSON payload' }
    });
  }
  next();
});

app.use('/health', healthRoutes);
app.use('/events', eventRoutes);
app.use('/audit', auditRoutes);
app.use('/replay', replayRoutes);

// Export app for testing
export { app };

import { EventService } from './services/eventService';
import { setEventService } from './controllers/eventController';
import { SupabaseEventRepository } from './repositories/supabaseEventRepository';
import { SupabaseDecisionRepository } from './repositories/supabaseDecisionRepository';
import { SupabaseAuditLogRepository } from './repositories/supabaseAuditLogRepository';

if (require.main === module) {
  // Production startup
  const eventRepo = new SupabaseEventRepository();
  const decisionRepo = new SupabaseDecisionRepository();
  const auditLogRepo = new SupabaseAuditLogRepository();
  const eventService = new EventService(eventRepo, decisionRepo, auditLogRepo);
  setEventService(eventService);

  app.listen(port, () => {
    console.log(`GreenLink backend listening on port ${port}`);
  });
}
