const TONE: Record<string, string> = {
  completed: "bg-good-soft text-good",
  succeeded: "bg-good-soft text-good",
  ready: "bg-good-soft text-good",
  report_unlocked: "bg-good-soft text-good",
  failed: "bg-alert-soft text-alert",
  dead: "bg-alert-soft text-alert",
  cancelled: "bg-mist text-slate",
};

/** Status text is always visible; colour only reinforces it. */
export function StatusBadge({ value }: { value: string }) {
  const tone = TONE[value] ?? "bg-mist text-ink";
  const icon = tone.includes("alert") ? "!" : tone.includes("good") ? "✓" : "•";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>
      <span aria-hidden="true">{icon}</span>
      {value.replaceAll("_", " ")}
    </span>
  );
}
