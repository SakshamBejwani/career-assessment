/** Brand mark: the Holland hexagon outline with a marigold point at the top vertex. */
export function HexMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const r = 12;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${14 + r * Math.cos(a)},${14 + r * Math.sin(a)}`;
  }).join(" ");
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className={className}>
      <polygon points={pts} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="14" cy="5.2" r="2.6" fill="var(--color-marigold)" />
    </svg>
  );
}
