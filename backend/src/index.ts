import express from 'express';
import { connectToMongoDB, disconnectFromMongoDB, checkMongoDBConnection } from './db/mongodb.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Health check endpoint with MongoDB status
app.get('/api/health', async (req, res) => {
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

// Initialize MongoDB connection on server start
async function startServer() {
  try {
    await connectToMongoDB();

    app.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`${signal} signal received: closing HTTP server`);
  await disconnectFromMongoDB();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
