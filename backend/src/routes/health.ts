import { Router } from 'express';
import { checkMongoDBConnection } from '../db/mongodb.js';

const router = Router();

router.get('/', async (req, res) => {
  const mongoStatus = await checkMongoDBConnection();

  // Return 503 Service Unavailable if MongoDB is disconnected
  const statusCode = mongoStatus ? 200 : 503;

  res.status(statusCode).json({
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
