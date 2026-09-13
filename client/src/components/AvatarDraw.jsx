import { useCallback, useEffect, useRef, useState } from 'react';

const CANVAS_SIZE = 256;
const EXPORT_SIZE = 128;
const COLORS = ['#f4ecd8', '#e5484d', '#f0a020', '#5eb85e', '#4a9bdc', '#b06ad4', '#1b1226'];
const WIDTHS = [4, 10, 20];

/**
 * A small scribble pad for a player's character token. Strokes are kept as
 * points rather than pixels so undo is cheap and the export can be redrawn at
 * a smaller size.
 */
export default function AvatarDraw({ onChange }) {
  const canvasRef = useRef(null);
  const strokesRef = useRef([]);
  const currentRef = useRef(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [dirty, setDirty] = useState(false);

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = currentRef.current
      ? [...strokesRef.current, currentRef.current]
      : strokesRef.current;
    for (const stroke of all) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      stroke.points.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      if (stroke.points.length === 1) {
        // A single tap should still leave a dot.
        ctx.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y);
      }
      ctx.stroke();
    }
  }, []);

  useEffect(() => paint(), [paint]);

  const exportAvatar = useCallback(() => {
    if (!strokesRef.current.length) {
      onChange(null);
      return;
    }
    const out = document.createElement('canvas');
    out.width = EXPORT_SIZE;
    out.height = EXPORT_SIZE;
    const ctx = out.getContext('2d');
    ctx.drawImage(canvasRef.current, 0, 0, EXPORT_SIZE, EXPORT_SIZE);
    onChange(out.toDataURL('image/png'));
  }, [onChange]);

  const pointFromEvent = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_SIZE,
    };
  };

  const onPointerDown = (event) => {
    event.preventDefault();
    canvasRef.current.setPointerCapture(event.pointerId);
    currentRef.current = { color, width, points: [pointFromEvent(event)] };
    paint();
  };

  const onPointerMove = (event) => {
    if (!currentRef.current) return;
    event.preventDefault();
    currentRef.current.points.push(pointFromEvent(event));
    paint();
  };

  const endStroke = () => {
    if (!currentRef.current) return;
    strokesRef.current.push(currentRef.current);
    currentRef.current = null;
    setDirty(true);
    paint();
    exportAvatar();
  };

  const undo = () => {
    strokesRef.current.pop();
    setDirty(strokesRef.current.length > 0);
    paint();
    exportAvatar();
  };

  const clear = () => {
    strokesRef.current = [];
    setDirty(false);
    paint();
    exportAvatar();
  };

  return (
    <div className="avatar-draw">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="avatar-draw__canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
      />
      {!dirty && <p className="avatar-draw__hint">draw your character</p>}
      <div className="avatar-draw__tools">
        <div className="avatar-draw__swatches">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`colour ${c}`}
              className={`swatch${c === color ? ' swatch--active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="avatar-draw__widths">
          {WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              aria-label={`brush ${w}`}
              className={`brush${w === width ? ' brush--active' : ''}`}
              onClick={() => setWidth(w)}
            >
              <span style={{ width: w / 2 + 4, height: w / 2 + 4 }} />
            </button>
          ))}
        </div>
        <div className="avatar-draw__actions">
          <button type="button" className="ghost-button" onClick={undo} disabled={!dirty}>
            Undo
          </button>
          <button type="button" className="ghost-button" onClick={clear} disabled={!dirty}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
