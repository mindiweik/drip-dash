import { Router } from 'express';
import healthRouter from './health.js';
import { makeGardenRouter } from './garden.js';
import { getDb } from '../db/database.js';

const router = Router();
router.use('/health', healthRouter);
router.use('/', makeGardenRouter(getDb()));

export default router;
