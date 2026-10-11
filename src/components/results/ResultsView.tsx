import type { MbtiInterpretation, RiasecInterpretation, VarkInterpretation } from "@/content/interpretations/types";
import type { MbtiScores, RiasecCode, RiasecScores, VarkCode, VarkScores } from "@/server/assessments/types";
import type { ReportData } from "@/server/reports/data";

/** Web rendering of the same ReportData the PDF uses; nothing is recalculated here. */
export function ResultsView({ data }: { data: ReportData }) {
  const { scores } = data;
  return (
    <div className="space-y-16">
      <section aria-labelledby="measured">
        <h2 id="measured" className="text-2xl sm:text-3xl">
          Your results
        </h2>
        <div className="mt-8">
          {scores.kind === "mbti" ? <MbtiChart scores={scores} interp={data.interpretation as MbtiInterpretation} /> : null}
          {scores.kind === "riasec" ? <RiasecChart scores={scores} interp={data.interpretation as RiasecInterpretation} /> : null}
          {scores.kind === "vark" ? <VarkChart scores={scores} interp={data.interpretation as VarkInterpretation} /> : null}
        </div>
        {data.warnings.length ? (
          <ul className="mt-6 space-y-1 border-l-4 border-marigold bg-paper px-4 py-3 text-sm">
            {data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="describe">
        <h2 id="describe" className="text-2xl sm:text-3xl">
          What your results describe
        </h2>
        <div className="mt-6">
          {scores.kind === "mbti" ? <MbtiText scores={scores} interp={data.interpretation as MbtiInterpretation} /> : null}
          {scores.kind === "riasec" ? <RiasecText scores={scores} interp={data.interpretation as RiasecInterpretation} /> : null}
          {scores.kind === "vark" ? <VarkText scores={scores} interp={data.interpretation as VarkInterpretation} /> : null}
        </div>
      </section>

      <section aria-labelledby="insights" className="rounded-[var(--radius-plate)] bg-paper p-6 sm:p-10">
        <h2 id="insights" className="text-2xl sm:text-3xl">
          {scores.kind === "riasec" ? "Career-related insights" : scores.kind === "vark" ? "Learning insights" : "Using this result"}
        </h2>
        <div className="mt-6">
          {scores.kind === "mbti" ? <MbtiInsights interp={data.interpretation as MbtiInterpretation} /> : null}
          {scores.kind === "riasec" ? <RiasecInsights scores={scores} interp={data.interpretation as RiasecInterpretation} /> : null}
          {scores.kind === "vark" ? <VarkInsights scores={scores} interp={data.interpretation as VarkInterpretation} /> : null}
        </div>
      </section>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-8 max-w-[64ch] border-l-4 border-marigold bg-mist px-4 py-3 text-[0.95rem]">{children}</p>;
}

// ── MBTI ────────────────────────────────────────────────────────────────────
function MbtiChart({ scores, interp }: { scores: MbtiScores; interp: MbtiInterpretation }) {
  return (
    <figure>
      <div className="flex flex-wrap gap-x-8 gap-y-4" aria-hidden="true">
        {scores.dimensions.map((d) => (
          <div key={d.pair} className="min-w-[4.5rem]">
            <p className={`font-mega text-6xl font-semibold leading-none sm:text-7xl ${d.preferred ? "text-ink" : "text-muted"}`}>{d.preferred ?? "X"}</p>
            <p className="mt-2 text-sm text-slate">{d.preferred ? interp.poles[d.preferred].name : "Balanced"}</p>
          </div>
        ))}
      </div>
      <p className="sr-only">Your type code is {scores.typeCode}.</p>
      <div className="mt-10 space-y-6">
        {scores.dimensions.map((d) => {
          const firstPct = d.total ? (d.first.count / d.total) * 100 : 50;
          const firstPref = d.preferred === d.first.letter;
          const secondPref = d.preferred === d.second.letter;
          return (
            <div key={d.pair}>
              <p className="text-sm text-slate">{interp.pairNames[d.pair]}</p>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)_9rem]">
                <p className={`text-right text-sm sm:text-base ${firstPref ? "font-medium" : "font-light text-slate"}`}>
                  {interp.poles[d.first.letter].name} <span className="tabular-nums">{d.first.count}</span>
                </p>
                <div className="relative col-span-3 row-start-2 flex h-3.5 gap-0.5 sm:col-span-1 sm:row-start-auto" aria-hidden="true">
                  <div className={`rounded-l-[4px] ${firstPref ? "bg-data" : "bg-data-tint"}`} style={{ width: `${firstPct}%` }} title={`${interp.poles[d.first.letter].name}: ${d.first.count} of ${d.total}`} />
                  <div className={`flex-1 rounded-r-[4px] ${secondPref ? "bg-data" : "bg-data-tint"}`} title={`${interp.poles[d.second.letter].name}: ${d.second.count} of ${d.total}`} />
                  <span className="absolute -top-1 left-1/2 h-5.5 w-px bg-ink" />
                </div>
                <p className={`col-start-3 row-start-1 text-sm sm:col-start-auto sm:row-start-auto sm:text-base ${secondPref ? "font-medium" : "font-light text-slate"}`}>
                  <span className="tabular-nums">{d.second.count}</span> {interp.poles[d.second.letter].name}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-6 text-sm text-slate">
        Each bar shows how many questions in that pair you answered toward each side. The line marks an even split.
      </figcaption>
      <table className="sr-only">
        <caption>Answers per preference pair</caption>
        <thead>
          <tr>
            <th scope="col">Pair</th>
            <th scope="col">First side</th>
            <th scope="col">Second side</th>
            <th scope="col">Preference</th>
          </tr>
        </thead>
        <tbody>
          {scores.dimensions.map((d) => (
            <tr key={d.pair}>
              <th scope="row">{interp.pairNames[d.pair]}</th>
              <td>{`${interp.poles[d.first.letter].name}: ${d.first.count}`}</td>
              <td>{`${interp.poles[d.second.letter].name}: ${d.second.count}`}</td>
              <td>{d.preferred ? interp.poles[d.preferred].name : "Balanced"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function MbtiText({ scores, interp }: { scores: MbtiScores; interp: MbtiInterpretation }) {
  return (
    <>
      <p className="prose-measure text-lg text-slate">{interp.intro}</p>
      <dl className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2">
        {scores.dimensions.map((d) => (
          <div key={d.pair}>
            <dt className="text-sm text-slate">{interp.pairNames[d.pair]}</dt>
            <dd className="mt-1">
              <p className="font-display text-lg font-semibold">
                {d.preferred ? `${interp.poles[d.preferred].name} (${d.preferred})` : `Balanced: ${interp.poles[d.first.letter].name} and ${interp.poles[d.second.letter].name}`}
              </p>
              <p className="mt-1.5 max-w-[56ch]">{d.preferred ? interp.poles[d.preferred].description : interp.balanced}</p>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function MbtiInsights({ interp }: { interp: MbtiInterpretation }) {
  return (
    <>
      <ul className="max-w-[64ch] list-disc space-y-2 pl-5">
        {interp.usingThisResult.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Note>
        This questionnaire describes preferences. On its own it doesn&apos;t point to particular subjects or careers, so no career suggestions are
        made from your type.
      </Note>
    </>
  );
}

// ── RIASEC ──────────────────────────────────────────────────────────────────
const HEX_ORDER: RiasecCode[] = ["R", "I", "A", "S", "E", "C"];

function RiasecChart({ scores, interp }: { scores: RiasecScores; interp: RiasecInterpretation }) {
  const byCode = Object.fromEntries(scores.categories.map((c) => [c.code, c]));
  const ordered = scores.ranking.map((code) => byCode[code]!);
  const c = 160;
  const r = 112;
  const pt = (i: number, f: number) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [c + r * f * Math.cos(a), c + r * f * Math.sin(a)] as const;
  };
  const ring = (f: number) => HEX_ORDER.map((_, i) => pt(i, f).join(",")).join(" ");
  const frac = (code: RiasecCode) => (byCode[code]?.score ?? 0) / (byCode[code]?.max || 12);
  return (
    <figure className="grid items-center gap-10 md:grid-cols-[minmax(0,340px)_1fr]">
      <svg viewBox="0 0 320 320" className="mx-auto w-full max-w-[340px] overflow-visible" role="img" aria-label="Interest hexagon">
        {[4 / 12, 8 / 12, 1].map((f) => (
          <polygon key={f} points={ring(f)} fill="none" stroke="var(--color-rule)" strokeWidth={f === 1 ? 1.5 : 1} />
        ))}
        {HEX_ORDER.map((_, i) => {
          const [x, y] = pt(i, 1);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--color-rule)" />;
        })}
        <polygon points={HEX_ORDER.map((code, i) => pt(i, frac(code)).join(",")).join(" ")} fill="var(--color-data)" fillOpacity="0.15" stroke="var(--color-data)" strokeWidth="2" strokeLinejoin="round" />
        {HEX_ORDER.map((code, i) => {
          const [x, y] = pt(i, frac(code));
          return (
            <circle key={code} cx={x} cy={y} r="5" fill="var(--color-data)" stroke="var(--color-paper)" strokeWidth="2">
              <title>{`${interp.categories[code].name}: ${byCode[code]?.score} of ${byCode[code]?.max}`}</title>
            </circle>
          );
        })}
        {HEX_ORDER.map((code, i) => {
          const [x, y] = pt(i, 1.22);
          return (
            <text key={code} x={x} y={y + 5} textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--color-ink)">
              {code} {byCode[code]?.score}
            </text>
          );
        })}
      </svg>
      <div>
        <ul className="space-y-4">
          {ordered.map((cat) => (
            <li key={cat.code}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">
                  {interp.categories[cat.code].name} <span className="font-light text-slate">({cat.code})</span>
                </p>
                <p className="text-sm text-slate">
                  <span className="tabular-nums">{cat.score}</span> of {cat.max}, {cat.band.toLowerCase()}
                </p>
              </div>
              <div className="relative mt-1.5 h-3 rounded-[4px] bg-paper" aria-hidden="true">
                <div className="h-3 rounded-[4px] bg-data" style={{ width: `${(cat.score / cat.max) * 100}%` }} title={`${cat.score} of ${cat.max}`} />
              </div>
            </li>
          ))}
        </ul>
        <figcaption className="mt-5 text-sm text-slate">Bands from the inventory: high 9–12, mid 5–8, low 0–4. Rings on the hexagon mark 4, 8 and 12.</figcaption>
      </div>
      <table className="sr-only">
        <caption>Interest area scores</caption>
        <thead>
          <tr>
            <th scope="col">Area</th>
            <th scope="col">Score out of 12</th>
            <th scope="col">Band</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((cat) => (
            <tr key={cat.code}>
              <th scope="row">{interp.categories[cat.code].name}</th>
              <td>{cat.score}</td>
              <td>{cat.band}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function RiasecText({ scores, interp }: { scores: RiasecScores; interp: RiasecInterpretation }) {
  const ordered = scores.ranking.map((code) => scores.categories.find((c) => c.code === code)!);
  return (
    <>
      <p className="prose-measure text-lg text-slate">{interp.intro}</p>
      <dl className="mt-8 grid gap-x-10 gap-y-7 md:grid-cols-2">
        {ordered.map((cat) => (
          <div key={cat.code}>
            <dt className="font-display text-lg font-semibold">
              {interp.categories[cat.code].name}
              <span className="ml-2 align-middle text-xs font-medium text-slate">
                {cat.band}, {cat.score} of {cat.max}
              </span>
            </dt>
            <dd className="mt-1.5 max-w-[56ch]">
              {interp.categories[cat.code].description} <span className="text-slate">{interp.bands[cat.band]}</span>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function RiasecInsights({ scores, interp }: { scores: RiasecScores; interp: RiasecInterpretation }) {
  const high = scores.ranking.filter((code) => scores.categories.find((c) => c.code === code)?.band === "High");
  const focus = (high.length ? high : scores.topCodes).slice(0, 3);
  return (
    <>
      <p className="text-slate">Fields connected with {focus.length > 1 ? "your strongest interest areas" : "your strongest interest area"}:</p>
      <div className="mt-6 grid gap-8 md:grid-cols-3">
        {focus.map((code) => (
          <div key={code}>
            <h3 className="text-lg">{interp.categories[code].name}</h3>
            <ul className="mt-3 space-y-1.5">
              {interp.categories[code].fieldsToExplore.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Note>{interp.careerNote}</Note>
    </>
  );
}

// ── VARK ────────────────────────────────────────────────────────────────────
const VARK_ORDER: VarkCode[] = ["V", "A", "R", "K"];
const VARK_MAX = 12;

function VarkChart({ scores, interp }: { scores: VarkScores; interp: VarkInterpretation }) {
  return (
    <figure>
      <ul className="space-y-5">
        {VARK_ORDER.map((code) => {
          const top = scores.highest.includes(code);
          return (
            <li key={code} className="grid grid-cols-[6.5rem_1fr_5rem] items-center gap-3 sm:grid-cols-[10rem_1fr_6rem] sm:gap-4">
              <p className={top ? "font-medium" : "font-light"}>{interp.modes[code].name}</p>
              <div className="h-3.5 rounded-[4px] bg-paper" aria-hidden="true">
                <div className="h-3.5 rounded-[4px] bg-data" style={{ width: `${(scores.counts[code] / VARK_MAX) * 100}%` }} title={`${scores.counts[code]} answers`} />
              </div>
              <p className="text-sm text-slate">
                <span className="tabular-nums text-ink">{scores.counts[code]}</span>
                {top ? " highest" : ""}
              </p>
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-6 text-sm text-slate">
        Each bar counts the answers you chose for that mode, out of {VARK_MAX} possible. Question 1 is not scored, as set out in the
        questionnaire key.
      </figcaption>
      <table className="sr-only">
        <caption>Answers per learning mode</caption>
        <tbody>
          {VARK_ORDER.map((code) => (
            <tr key={code}>
              <th scope="row">{interp.modes[code].name}</th>
              <td>{scores.counts[code]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function VarkText({ scores, interp }: { scores: VarkScores; interp: VarkInterpretation }) {
  const ordered = [...VARK_ORDER].sort((a, b) => scores.counts[b] - scores.counts[a]);
  return (
    <>
      <p className="prose-measure text-lg text-slate">{interp.intro}</p>
      {scores.highest.length > 1 ? <p className="prose-measure mt-3 text-lg text-slate">{interp.severalHighest}</p> : null}
      <dl className="mt-8 grid gap-x-10 gap-y-7 md:grid-cols-2">
        {ordered.map((code) => (
          <div key={code}>
            <dt className="font-display text-lg font-semibold">
              {interp.modes[code].name} <span className="text-sm font-medium text-slate">({scores.counts[code]})</span>
            </dt>
            <dd className="mt-1.5 max-w-[56ch]">{interp.modes[code].description}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function VarkInsights({ scores, interp }: { scores: VarkScores; interp: VarkInterpretation }) {
  const focus = scores.highest.length ? scores.highest : VARK_ORDER;
  return (
    <>
      <div className="grid gap-8 md:grid-cols-2">
        {focus.map((code) => (
          <div key={code}>
            <h3 className="text-lg">Study ideas for {interp.modes[code].name.toLowerCase()} learning</h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              {interp.modes[code].strategies.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Note>{interp.note}</Note>
    </>
  );
}
