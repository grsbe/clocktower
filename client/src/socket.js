import { io } from 'socket.io-client';
import { C2S } from '@shared/events.js';

export const socket = io({
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

// serverTime - localTime, so local clock skew never desynchronises the vote.
let clockOffset = 0;

export function serverNow() {
  return Date.now() + clockOffset;
}

export function getClockOffset() {
  return clockOffset;
}

export function emitAck(event, payload) {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload, (timeoutErr, response) => {
      if (timeoutErr) return resolve({ ok: false, error: 'timeout' });
      resolve(response ?? { ok: false, error: 'no-response' });
    });
  });
}

/**
 * Estimates the offset between this browser's clock and the server's with a
 * handful of round trips, keeping the median to shrug off one slow sample.
 */
export async function syncClock(samples = 5) {
  const offsets = [];
  for (let i = 0; i < samples; i += 1) {
    const sentAt = Date.now();
    // eslint-disable-next-line no-await-in-loop
    const res = await emitAck(C2S.TIME_SYNC, null);
    if (!res?.serverTime) continue;
    const receivedAt = Date.now();
    const rtt = receivedAt - sentAt;
    offsets.push(res.serverTime - (sentAt + rtt / 2));
  }
  if (offsets.length) {
    offsets.sort((a, b) => a - b);
    clockOffset = offsets[Math.floor(offsets.length / 2)];
  }
  return clockOffset;
}
