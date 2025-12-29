import { Router } from 'express';
import healthRouter from './health.js';

const router = Router();

// Health check routes
router.use('/health', healthRouter);

// TODO: Turn on when ready
// router.use('/systems', systemsRouter);
// router.use('/plants', plantsRouter);
// router.use('/tasks', tasksRouter);

export default router;
