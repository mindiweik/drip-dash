import express from 'express';
import apiRouter from './routes/index.js';
import { Server } from 'http';
import { getDb } from './db/database.js';
import { seedDefaultGardens } from './db/gardens.js';
import { seedDefaultSchedules } from './care/chores.js';
import { seedFakePlants } from './db/plants.js';
import { startPolling } from './poller/poller.js';
import { GardynMockSource } from './datasources/GardynMockSource.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3001;
let server: Server | null = null;
let stopPolling: (() => void) | null = null;

app.use(express.json());
app.use('/api', apiRouter);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

function startServer() {
  const db = getDb();
  seedDefaultGardens(db);
  seedDefaultSchedules(db);
  seedFakePlants(db);
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
