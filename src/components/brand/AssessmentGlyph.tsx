import type { AssessmentId } from "@/lib/assessment-ids";

/**
 * Each glyph previews the shape of that assessment's actual result:
 * four preference balances, the six-sided interest hexagon, and four learning modes.
 */
export function AssessmentGlyph({ id, size = 56 }: { id: AssessmentId; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 56 56", "aria-hidden": true } as const;
  if (id === "mbti_personality") {
    const rows = [0.62, 0.35, 0.7, 0.44];
    return (
      <svg {...common}>
        {rows.map((split, i) => {
          const y = 9 + i * 11;
          const x = 6 + split * 44;
          return (
            <g key={i}>
              <rect x="6" y={y} width={x - 7} height="6" rx="2" fill={split > 0.5 ? "var(--color-ink)" : "var(--color-rule-strong)"} />
              <rect x={x + 1} y={y} width={50 - x - 1} height="6" rx="2" fill={split > 0.5 ? "var(--color-rule-strong)" : "var(--color-ink)"} />
            </g>
          );
        })}
        <line x1="28" y1="5" x2="28" y2="51" stroke="var(--color-marigold)" strokeWidth="1.5" />
      </svg>
    );
  }
  if (id === "holland_riasec") {
    const pt = (i: number, f: number) => {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      return `${28 + 23 * f * Math.cos(a)},${28 + 23 * f * Math.sin(a)}`;
    };
    const shape = [0.45, 0.9, 0.6, 0.8, 0.35, 0.55];
    return (
      <svg {...common}>
        <polygon points={[0, 1, 2, 3, 4, 5].map((i) => pt(i, 1)).join(" ")} fill="none" stroke="var(--color-rule-strong)" strokeWidth="1.5" />
        <polygon points={shape.map((f, i) => pt(i, f)).join(" ")} fill="var(--color-ink)" fillOpacity="0.12" stroke="var(--color-ink)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="28" cy="5" r="3" fill="var(--color-marigold)" />
      </svg>
    );
  }
  const cells = [
    { x: 6, y: 6, o: 1 },
    { x: 30, y: 6, o: 0.35 },
    { x: 6, y: 30, o: 0.6 },
    { x: 30, y: 30, o: 0.85 },
  ];
  return (
    <svg {...common}>
      {cells.map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width="20" height="20" rx="4" fill="var(--color-ink)" fillOpacity={c.o} />
      ))}
      <circle cx="50" cy="6" r="3" fill="var(--color-marigold)" />
    </svg>
  );
}
