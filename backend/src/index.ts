import express from 'express';
import apiRouter from './routes/index.js';
import { Server } from 'http';

const app = express();
const PORT = process.env.PORT || 3001;
let server: Server | null = null;

app.use(express.json());
app.use('/api', apiRouter);

function startServer() {
  server = app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

function gracefulShutdown(signal: string) {
  console.log(`${signal} received: closing HTTP server`);
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
