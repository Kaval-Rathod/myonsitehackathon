import { Router } from 'express';
import { handleEvent } from '../controllers/eventController';

const router = Router();

router.post('/', handleEvent);

export default router;
