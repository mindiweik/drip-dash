import express from 'express';
import { connectToMongoDB, disconnectFromMongoDB } from './db/mongodb.js';
import apiRouter from './routes/index.js';
import { Server } from 'http';

const app = express();
const PORT = process.env.PORT || 3001;
let server: Server | null = null;

app.use(express.json());

// API routes
app.use('/api', apiRouter);

// Initialize MongoDB connection on server start
async function startServer() {
  try {
    await connectToMongoDB();

    server = app.listen(PORT, () => {
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

  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
    });
  }

  await disconnectFromMongoDB();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
