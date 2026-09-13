import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { LIMITS } from '../../shared/events.js';
import { registerHandlers } from './socket-handlers.js';
import { roomCount, startRoomSweeper } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: roomCount() }));

app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }));
// Single page app: anything the static handler did not answer gets the shell.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  // Avatars are data URLs, so allow a payload comfortably above the cap the
  // handlers enforce.
  maxHttpBufferSize: LIMITS.AVATAR_MAX_BYTES * 4,
  pingInterval: 20000,
  pingTimeout: 25000,
});

io.on('connection', (socket) => registerHandlers(io, socket));

startRoomSweeper();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`botct server listening on ${PORT}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    io.close();
    server.close(() => process.exit(0));
  });
}
