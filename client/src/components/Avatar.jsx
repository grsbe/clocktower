const FALLBACK_HUES = [258, 12, 38, 140, 205, 288, 330];

function hueFor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 9973;
  return FALLBACK_HUES[hash % FALLBACK_HUES.length];
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function Avatar({ player, size = 48, className = '' }) {
  const style = { width: size, height: size };
  if (player?.avatar) {
    return (
      <span className={`avatar ${className}`} style={style}>
        <img src={player.avatar} alt="" draggable={false} />
      </span>
    );
  }
  return (
    <span
      className={`avatar avatar--initials ${className}`}
      style={{
        ...style,
        background: `hsl(${hueFor(player?.name)} 45% 28%)`,
        fontSize: Math.max(11, size * 0.36),
      }}
    >
      {initials(player?.name)}
    </span>
  );
}
