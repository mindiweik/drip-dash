import express from 'express';
import apiRouter from './routes/index.js';
import { Server } from 'http';
import { getDb } from './db/database.js';
import { seedDefaultSchedules } from './care/chores.js';
import { startPolling } from './poller/poller.js';
import { GardynMockSource } from './datasources/GardynMockSource.js';

const app = express();
const PORT = process.env.PORT || 3001;
let server: Server | null = null;
let stopPolling: (() => void) | null = null;

app.use(express.json());
app.use('/api', apiRouter);

function startServer() {
  const db = getDb();
  seedDefaultSchedules(db);
  stopPolling = startPolling(db, new GardynMockSource());
  server = app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

function gracefulShutdown(signal: string) {
  console.log(`${signal} received: shutting down`);
  if (stopPolling) stopPolling();
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();

export { app };
