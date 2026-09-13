import { useEffect, useRef } from 'react';
import { LIMITS } from '@shared/events.js';
import { serverNow } from '../socket.js';

const OFFSET = LIMITS.HAND_START_OFFSET;

/**
 * The sweeping hand. Its angle is derived every frame from the shared server
 * clock rather than from local timers, so every screen in the room shows the
 * hand over the same seat at the same moment.
 *
 * Positions are measured in seats from the nominee. The hand rests at `OFFSET`
 * — the gap between the nominee and the first voter — then sweeps clockwise,
 * reaching voter `i` of the order at position `i + OFFSET` and finishing on
 * the nominee, who votes last.
 */
export default function ClockHand({ startAt, msPerPlayer, seatCount, nomineeIndex, onProgress }) {
  const handRef = useRef(null);
  const lastIndexRef = useRef(null);
  const lastSecondRef = useRef(null);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    if (!seatCount) return undefined;
    let frame;

    const lastPosition = seatCount - 1 + OFFSET;

    const tick = () => {
      const elapsed = serverNow() - startAt;
      const raw = elapsed / msPerPlayer;
      const progress = Math.max(0, Math.min(lastPosition, raw));

      if (handRef.current) {
        const deg = ((nomineeIndex + OFFSET + progress) / seatCount) * 360;
        handRef.current.style.transform = `rotate(${deg}deg)`;
      }

      // Only bubble up when something the UI actually renders has changed.
      const index = raw < OFFSET ? -1 : Math.min(seatCount - 1, Math.floor(raw - OFFSET));
      const secondsLeft = Math.max(0, Math.ceil((lastPosition * msPerPlayer - elapsed) / 1000));
      const leadIn = raw < 0 ? Math.ceil(-elapsed / 1000) : 0;
      if (index !== lastIndexRef.current || secondsLeft !== lastSecondRef.current) {
        lastIndexRef.current = index;
        lastSecondRef.current = secondsLeft;
        onProgressRef.current?.({ index, secondsLeft, leadIn, done: raw >= lastPosition });
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [startAt, msPerPlayer, seatCount, nomineeIndex]);

  return (
    <div className="clock-hand" ref={handRef} aria-hidden="true">
      <div className="clock-hand__arm" />
      <div className="clock-hand__hub" />
    </div>
  );
}
