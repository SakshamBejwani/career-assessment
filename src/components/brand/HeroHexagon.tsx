const CODES = [
  { code: "R", name: "Realistic" },
  { code: "I", name: "Investigative" },
  { code: "A", name: "Artistic" },
  { code: "S", name: "Social" },
  { code: "E", name: "Enterprising" },
  { code: "C", name: "Conventional" },
];
// An illustrative profile, not anyone's result.
const SAMPLE = [0.42, 0.88, 0.66, 0.8, 0.38, 0.55];

/**
 * Holland's hexagon: the six interest areas in their conventional order. The outline draws in
 * once on load and a sample profile settles inside it (skipped under prefers-reduced-motion).
 */
export function HeroHexagon() {
  const c = 200;
  const r = 150;
  const pt = (i: number, f: number) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [c + r * f * Math.cos(a), c + r * f * Math.sin(a)] as const;
  };
  const ring = (f: number) => CODES.map((_, i) => pt(i, f).join(",")).join(" ");
  const profile = SAMPLE.map((f, i) => pt(i, f).join(",")).join(" ");
  return (
    <figure className="relative mx-auto w-full max-w-[440px]">
      <svg viewBox="-36 0 472 400" className="w-full" role="img" aria-labelledby="hero-hex-title">
        <title id="hero-hex-title">Holland&apos;s hexagon of six interest areas, with an example profile</title>
        {[1 / 3, 2 / 3].map((f) => (
          <polygon key={f} points={ring(f)} fill="none" stroke="var(--color-rule)" strokeWidth="1" />
        ))}
        {CODES.map((_, i) => {
          const [x, y] = pt(i, 1);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--color-rule)" strokeWidth="1" />;
        })}
        <polygon
          points={ring(1)}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="3"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          className="animate-draw"
        />
        <g className="animate-rise" style={{ transformOrigin: "200px 200px" }}>
          <polygon points={profile} fill="var(--color-marigold)" fillOpacity="0.22" stroke="var(--color-marigold)" strokeWidth="2.5" strokeLinejoin="round" />
          {SAMPLE.map((f, i) => {
            const [x, y] = pt(i, f);
            return <circle key={i} cx={x} cy={y} r="5" fill="var(--color-paper)" stroke="var(--color-marigold)" strokeWidth="2.5" />;
          })}
        </g>
        {CODES.map(({ code, name }, i) => {
          // Top and bottom labels centre on their vertex; side labels sit outside it.
          const side = i === 1 || i === 2 ? "start" : i === 4 || i === 5 ? "end" : "middle";
          const [x, y] = pt(i, side === "middle" ? 1.17 : 1.09);
          return (
            <g key={code}>
              <text x={x} y={y - 4} textAnchor={side} fontFamily="var(--font-mega)" fontWeight="600" fontSize="22" fill="var(--color-ink)">
                {code}
              </text>
              <text x={x} y={y + 14} textAnchor={side} fontSize="12" fill="var(--color-slate)">
                {name}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
