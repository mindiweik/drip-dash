import { Router } from 'express';
import { checkMongoDBConnection } from '../db/mongodb.js';

const router = Router();

router.get('/', async (req, res) => {
  const mongoStatus = await checkMongoDBConnection();

  res.json({
    status: mongoStatus ? 'ok' : 'degraded',
    message: 'Backend API is running',
    mongodb: {
      connected: mongoStatus,
      status: mongoStatus ? 'connected' : 'disconnected',
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
