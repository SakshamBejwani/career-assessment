import "server-only";
import { join } from "node:path";
import { Document, Font, Page, Polygon, Line, Circle, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { MbtiInterpretation, RiasecInterpretation, VarkInterpretation } from "@/content/interpretations/types";
import { formatDate, formatDateTime } from "@/lib/format";
import type { MbtiScores, RiasecCode, RiasecScores, VarkCode, VarkScores } from "../assessments/types";
import type { ReportData } from "./data";

// ── Fonts (OFL, bundled in assets/fonts; traced into every server bundle by next.config) ──
const fontDir = join(process.cwd(), "assets", "fonts");
let fontsRegistered = false;
export function registerReportFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Lexend",
    fonts: [300, 400, 500, 600].map((w) => ({ src: join(fontDir, `lexend-latin-${w}-normal.woff`), fontWeight: w })),
  });
  Font.register({
    family: "LexendExa",
    fonts: [500, 600].map((w) => ({ src: join(fontDir, `lexend-exa-latin-${w}-normal.woff`), fontWeight: w })),
  });
  Font.register({ family: "LexendMega", src: join(fontDir, "lexend-mega-latin-600-normal.woff"), fontWeight: 600 });
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

// ── Tokens (mirror src/app/globals.css) ──
const C = {
  ink: "#17213A",
  slate: "#4A5468",
  muted: "#6B7385",
  rule: "#D5DBE4",
  mist: "#EEF1F5",
  paper: "#FFFFFF",
  marigold: "#E9A23B",
  data: "#2A62C9",
  dataTint: "#C8D5EE",
};

const s = StyleSheet.create({
  page: { fontFamily: "Lexend", fontSize: 9.5, color: C.ink, paddingTop: 46, paddingBottom: 64, paddingHorizontal: 50, lineHeight: 1.45 },
  previewBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: C.marigold,
    color: C.ink,
    fontSize: 8,
    fontWeight: 500,
    paddingVertical: 5,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 50,
    right: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: C.muted,
    borderTopWidth: 0.6,
    borderTopColor: C.rule,
    paddingTop: 8,
  },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 34 },
  brandName: { fontSize: 9, fontWeight: 500, marginLeft: 8 },
  brandMeta: { marginLeft: "auto", fontSize: 8, color: C.slate, textAlign: "right" },
  kicker: { fontSize: 10, color: C.slate, marginBottom: 6 },
  title: { fontFamily: "LexendExa", fontWeight: 600, fontSize: 24, lineHeight: 1.15, marginBottom: 8 },
  subtitle: { fontSize: 10.5, color: C.slate, maxWidth: 380 },
  h2: { fontFamily: "LexendExa", fontWeight: 600, fontSize: 14, marginBottom: 10, marginTop: 4 },
  h3: { fontWeight: 600, fontSize: 10.5, marginBottom: 3 },
  body: { fontSize: 9.5, color: C.ink, maxWidth: 470 },
  small: { fontSize: 8, color: C.slate },
  rule: { borderBottomWidth: 0.6, borderBottomColor: C.rule, marginVertical: 18 },
  section: { marginTop: 22 },
  noteBox: { borderLeftWidth: 3, borderLeftColor: C.marigold, backgroundColor: C.mist, padding: 10, marginTop: 10 },
  bullet: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 10, color: C.slate },
});

// ── Small building blocks ──
function HexMark({ size = 16 }: { size?: number }) {
  const r = size / 2;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${r + r * 0.92 * Math.cos(a)},${r + r * 0.92 * Math.sin(a)}`;
  }).join(" ");
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Polygon points={pts} fill="none" stroke={C.ink} strokeWidth={1.4} />
      <Circle cx={r} cy={r * 0.32} r={1.6} fill={C.marigold} />
    </Svg>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={s.bullet}>
          <Text style={s.bulletDot}>–</Text>
          <Text style={{ flex: 1 }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** Horizontal magnitude bar: one series (data blue) on a hairline track, 2pt end radius. */
function MagnitudeBar({ value, max, width }: { value: number; max: number; width: number }) {
  const w = max > 0 ? Math.max(0, (value / max) * width) : 0;
  return (
    <Svg width={width} height={10}>
      <Rect x={0} y={4.5} width={width} height={1} fill={C.rule} />
      {w > 0 ? <Rect x={0} y={1} width={w} height={8} rx={2} ry={2} fill={C.data} /> : null}
    </Svg>
  );
}

// ── MBTI ──
function MbtiResults({ scores, interp }: { scores: MbtiScores; interp: MbtiInterpretation }) {
  const barWidth = 230;
  return (
    <View>
      <View style={{ flexDirection: "row", marginBottom: 18 }}>
        {scores.dimensions.map((d) => (
          <View key={d.pair} style={{ width: 92, marginRight: 8 }}>
            <Text style={{ fontFamily: "LexendMega", fontWeight: 600, fontSize: 40, lineHeight: 1, color: d.preferred ? C.ink : C.muted }}>
              {d.preferred ?? "X"}
            </Text>
            <Text style={{ fontSize: 8.5, color: C.slate, marginTop: 6 }}>{d.preferred ? interp.poles[d.preferred].name : "Balanced"}</Text>
          </View>
        ))}
      </View>
      {scores.dimensions.map((d) => {
        const leftW = d.total ? (d.first.count / d.total) * barWidth : barWidth / 2;
        const firstPreferred = d.preferred === d.first.letter;
        const secondPreferred = d.preferred === d.second.letter;
        return (
          <View key={d.pair} style={{ marginBottom: 12 }} wrap={false}>
            <Text style={{ ...s.small, marginBottom: 4 }}>{interp.pairNames[d.pair]}</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ width: 112, textAlign: "right", paddingRight: 8, fontWeight: firstPreferred ? 600 : 400 }}>
                {interp.poles[d.first.letter].name} {d.first.count}
              </Text>
              <Svg width={barWidth} height={12}>
                {leftW > 1 ? <Rect x={0} y={1} width={leftW - 1} height={10} rx={2} ry={2} fill={firstPreferred ? C.data : C.dataTint} /> : null}
                {barWidth - leftW > 1 ? (
                  <Rect x={leftW + 1} y={1} width={barWidth - leftW - 1} height={10} rx={2} ry={2} fill={secondPreferred ? C.data : C.dataTint} />
                ) : null}
                <Line x1={barWidth / 2} y1={0} x2={barWidth / 2} y2={12} stroke={C.ink} strokeWidth={0.6} />
              </Svg>
              <Text style={{ width: 112, paddingLeft: 8, fontWeight: secondPreferred ? 600 : 400 }}>
                {d.second.count} {interp.poles[d.second.letter].name}
              </Text>
            </View>
          </View>
        );
      })}
      <Text style={{ ...s.small, marginTop: 4 }}>
        Counts show how many of the {scores.dimensions[0]?.total ?? 10} or {scores.dimensions[1]?.total ?? 20} questions in each pair you
        answered toward each side. The line marks an even split.
      </Text>
    </View>
  );
}

function MbtiInterpretationView({ scores, interp }: { scores: MbtiScores; interp: MbtiInterpretation }) {
  return (
    <View>
      <Text style={{ ...s.body, marginBottom: 12 }}>{interp.intro}</Text>
      {scores.dimensions.map((d) => (
        <View key={d.pair} style={{ marginBottom: 12 }} wrap={false}>
          <Text style={s.small}>{interp.pairNames[d.pair]}</Text>
          {d.preferred ? (
            <>
              <Text style={s.h3}>
                {interp.poles[d.preferred].name} ({d.preferred})
              </Text>
              <Text style={s.body}>{interp.poles[d.preferred].description}</Text>
            </>
          ) : (
            <>
              <Text style={s.h3}>
                Balanced between {interp.poles[d.first.letter].name} and {interp.poles[d.second.letter].name}
              </Text>
              <Text style={s.body}>{interp.balanced}</Text>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

// ── RIASEC ──
const HEX_ORDER: RiasecCode[] = ["R", "I", "A", "S", "E", "C"];

function RiasecHexagon({ scores, size = 210 }: { scores: RiasecScores; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 26;
  const byCode = Object.fromEntries(scores.categories.map((c) => [c.code, c]));
  const point = (i: number, fraction: number) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [cx + radius * fraction * Math.cos(a), cy + radius * fraction * Math.sin(a)] as const;
  };
  const ring = (fraction: number) => HEX_ORDER.map((_, i) => point(i, fraction).join(",")).join(" ");
  const shape = HEX_ORDER.map((code, i) => point(i, (byCode[code]?.score ?? 0) / (byCode[code]?.max || 12)).join(",")).join(" ");
  return (
    <View style={{ width: size, height: size, position: "relative" }}>
      <Svg width={size} height={size}>
        {[4 / 12, 8 / 12, 1].map((f) => (
          <Polygon key={f} points={ring(f)} fill="none" stroke={C.rule} strokeWidth={f === 1 ? 1 : 0.6} />
        ))}
        {HEX_ORDER.map((_, i) => {
          const [x, y] = point(i, 1);
          return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={C.rule} strokeWidth={0.6} />;
        })}
        <Polygon points={shape} fill={C.data} fillOpacity={0.16} stroke={C.data} strokeWidth={2} />
        {HEX_ORDER.map((code, i) => {
          const [x, y] = point(i, (byCode[code]?.score ?? 0) / (byCode[code]?.max || 12));
          return <Circle key={code} cx={x} cy={y} r={3.2} fill={C.data} stroke={C.paper} strokeWidth={1.2} />;
        })}
      </Svg>
      {HEX_ORDER.map((code, i) => {
        const [x, y] = point(i, 1.2);
        return (
          <Text
            key={code}
            style={{ position: "absolute", left: x - 18, top: y - 7, width: 36, textAlign: "center", fontSize: 9, fontWeight: 600 }}
          >
            {code} {byCode[code]?.score ?? 0}
          </Text>
        );
      })}
    </View>
  );
}

function RiasecResults({ scores, interp }: { scores: RiasecScores; interp: RiasecInterpretation }) {
  const ordered = scores.ranking.map((code) => scores.categories.find((c) => c.code === code)!);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      <RiasecHexagon scores={scores} />
      <View style={{ marginLeft: 24, flex: 1 }}>
        {ordered.map((c) => (
          <View key={c.code} style={{ marginBottom: 9 }} wrap={false}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
              <Text style={{ fontWeight: 500 }}>
                {interp.categories[c.code].name} ({c.code})
              </Text>
              <Text style={{ color: C.slate }}>
                {c.score} of {c.max}, {c.band}
              </Text>
            </View>
            <MagnitudeBar value={c.score} max={c.max} width={210} />
          </View>
        ))}
        <Text style={{ ...s.small, marginTop: 4 }}>Bands from the inventory: High 9–12, Mid 5–8, Low 0–4. Rings on the hexagon mark 4, 8 and 12.</Text>
      </View>
    </View>
  );
}

function RiasecInterpretationView({ scores, interp }: { scores: RiasecScores; interp: RiasecInterpretation }) {
  const ordered = scores.ranking.map((code) => scores.categories.find((c) => c.code === code)!);
  return (
    <View>
      <Text style={{ ...s.body, marginBottom: 12 }}>{interp.intro}</Text>
      {ordered.map((c) => (
        <View key={c.code} style={{ marginBottom: 11 }} wrap={false}>
          <Text style={s.h3}>
            {interp.categories[c.code].name}: {c.band.toLowerCase()} ({c.score} of {c.max})
          </Text>
          <Text style={s.body}>
            {interp.categories[c.code].description} {interp.bands[c.band]}
          </Text>
        </View>
      ))}
    </View>
  );
}

function RiasecInsights({ scores, interp }: { scores: RiasecScores; interp: RiasecInterpretation }) {
  const high = scores.categories.filter((c) => c.band === "High").map((c) => c.code);
  const focus = (high.length ? scores.ranking.filter((code) => high.includes(code)) : scores.topCodes).slice(0, 3);
  return (
    <View>
      <Text style={{ ...s.body, marginBottom: 10 }}>
        Fields connected with {focus.length > 1 ? "your strongest interest areas" : "your strongest interest area"}:
      </Text>
      {focus.map((code) => (
        <View key={code} style={{ marginBottom: 10 }} wrap={false}>
          <Text style={s.h3}>{interp.categories[code].name}</Text>
          <Text style={s.body}>{interp.categories[code].fieldsToExplore.join(", ")}</Text>
          <Text style={{ ...s.small, marginTop: 2 }}>Often enjoys: {interp.categories[code].enjoys.join("; ").toLowerCase()}</Text>
        </View>
      ))}
      <View style={s.noteBox}>
        <Text>{interp.careerNote}</Text>
      </View>
    </View>
  );
}

// ── VARK ──
const VARK_ORDER: VarkCode[] = ["V", "A", "R", "K"];
const VARK_MAX = 12; // each category has 12 keyed options across Q2–Q14

function VarkResults({ scores, interp }: { scores: VarkScores; interp: VarkInterpretation }) {
  return (
    <View>
      {VARK_ORDER.map((code) => (
        <View key={code} style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }} wrap={false}>
          <Text style={{ width: 110, fontWeight: scores.highest.includes(code) ? 600 : 400 }}>{interp.modes[code].name}</Text>
          <MagnitudeBar value={scores.counts[code]} max={VARK_MAX} width={260} />
          <Text style={{ marginLeft: 10, color: C.slate }}>
            {scores.counts[code]} {scores.highest.includes(code) ? " highest" : ""}
          </Text>
        </View>
      ))}
      <Text style={{ ...s.small, marginTop: 4 }}>
        Each bar counts the answers you chose for that mode (up to {VARK_MAX} possible). {scores.totalScoredSelections} answers were scored;
        question 1 is not scored, as set out in the questionnaire key.
      </Text>
    </View>
  );
}

function VarkInterpretationView({ scores, interp }: { scores: VarkScores; interp: VarkInterpretation }) {
  const ordered = [...VARK_ORDER].sort((a, b) => scores.counts[b] - scores.counts[a]);
  return (
    <View>
      <Text style={{ ...s.body, marginBottom: 12 }}>{interp.intro}</Text>
      {scores.highest.length > 1 ? <Text style={{ ...s.body, marginBottom: 12 }}>{interp.severalHighest}</Text> : null}
      {ordered.map((code) => (
        <View key={code} style={{ marginBottom: 11 }} wrap={false}>
          <Text style={s.h3}>
            {interp.modes[code].name} ({scores.counts[code]})
          </Text>
          <Text style={s.body}>{interp.modes[code].description}</Text>
        </View>
      ))}
    </View>
  );
}

function VarkInsights({ scores, interp }: { scores: VarkScores; interp: VarkInterpretation }) {
  const focus = scores.highest.length ? scores.highest : VARK_ORDER;
  return (
    <View>
      {focus.map((code) => (
        <View key={code} style={{ marginBottom: 10 }} wrap={false}>
          <Text style={s.h3}>Study ideas for {interp.modes[code].name.toLowerCase()} learning</Text>
          <Bullets items={interp.modes[code].strategies} />
        </View>
      ))}
      <View style={s.noteBox}>
        <Text>{interp.note}</Text>
      </View>
    </View>
  );
}

// ── Document ──
function PageChrome({ data }: { data: ReportData }) {
  return (
    <>
      {data.preview ? (
        <Text style={s.previewBand} fixed>
          Preview: scoring and interpretation are pending client validation
        </Text>
      ) : null}
      <View style={s.footer} fixed>
        <Text>{data.orgName}</Text>
        <Text>Report {data.reference}</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </>
  );
}

const ASSESSMENT_INTRO: Record<string, string> = {
  mbti_personality: "A summary of the preferences you showed across 70 either-or questions.",
  holland_riasec: "A summary of the work activities you said appeal to you, across six interest areas.",
  vark_learning_styles: "A summary of how you prefer to take in and work with new information.",
};

export function ReportDocument({ data }: { data: ReportData }) {
  const { scores } = data;
  const scoredOn = formatDate(data.provenance.scoredAt, data.timezone);
  const insightsTitle =
    scores.kind === "riasec" ? "Career-related insights" : scores.kind === "vark" ? "Learning insights" : "Using this result";


  return (
    <Document
      title={`${data.assessment.shortName} report — ${data.reference}`}
      author={data.orgName}
      subject={data.assessment.name}
      creator={data.orgName}
      producer={`${data.orgName} (${data.provenance.templateVersion})`}
      creationDate={data.provenance.scoredAt}
      modificationDate={data.provenance.scoredAt}
      language="en-IN"
    >
      <Page size="A4" style={s.page}>
        <PageChrome data={data} />
        <View style={s.brandRow}>
          <HexMark />
          <Text style={s.brandName}>{data.orgName}</Text>
          <Text style={s.brandMeta}>
            Report {data.reference}
            {"\n"}
            {scoredOn}
          </Text>
        </View>
        <Text style={s.kicker}>Prepared for {data.studentName}</Text>
        <Text style={s.title}>{data.assessment.shortName}</Text>
        <Text style={s.subtitle}>{ASSESSMENT_INTRO[data.assessment.id]}</Text>
        <View style={s.rule} />
        <Text style={s.h2}>Your results</Text>
        {scores.kind === "mbti" ? <MbtiResults scores={scores} interp={data.interpretation as MbtiInterpretation} /> : null}
        {scores.kind === "riasec" ? <RiasecResults scores={scores} interp={data.interpretation as RiasecInterpretation} /> : null}
        {scores.kind === "vark" ? <VarkResults scores={scores} interp={data.interpretation as VarkInterpretation} /> : null}
        {data.warnings.length ? (
          <View style={s.noteBox}>
            {data.warnings.map((w, i) => (
              <Text key={i}>{w}</Text>
            ))}
          </View>
        ) : null}

        <View style={s.section} minPresenceAhead={120}>
          <Text style={s.h2}>What your results describe</Text>
          {scores.kind === "mbti" ? <MbtiInterpretationView scores={scores} interp={data.interpretation as MbtiInterpretation} /> : null}
          {scores.kind === "riasec" ? <RiasecInterpretationView scores={scores} interp={data.interpretation as RiasecInterpretation} /> : null}
          {scores.kind === "vark" ? <VarkInterpretationView scores={scores} interp={data.interpretation as VarkInterpretation} /> : null}
        </View>

        <View style={s.section} minPresenceAhead={120}>
          <Text style={s.h2}>{insightsTitle}</Text>
          {scores.kind === "mbti" ? (
            <View>
              <Bullets items={(data.interpretation as MbtiInterpretation).usingThisResult} />
              <View style={s.noteBox}>
                <Text>
                  This questionnaire describes preferences. On its own it does not point to particular subjects or careers, so no career
                  suggestions are made from your type.
                </Text>
              </View>
            </View>
          ) : null}
          {scores.kind === "riasec" ? <RiasecInsights scores={scores} interp={data.interpretation as RiasecInterpretation} /> : null}
          {scores.kind === "vark" ? <VarkInsights scores={scores} interp={data.interpretation as VarkInterpretation} /> : null}
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <PageChrome data={data} />
        <Text style={s.h2}>About this report</Text>
        <Bullets
          items={[
            "Your results describe the preferences and interests you reported. They are not a measure of ability or intelligence.",
            "This is not a clinical or diagnostic assessment.",
            "No assessment can guarantee career fit or success. Use these results as one input, ideally with a qualified counsellor.",
            "Results are calculated by fixed scoring rules from your submitted answers; nothing in this report was written by hand about you.",
          ]}
        />
        <View style={s.rule} />
        <Text style={s.h3}>Record</Text>
        {[
          ["Report reference", data.reference],
          ["Assessment", `${data.assessment.name} (version ${data.provenance.assessmentVersion})`],
          ["Questionnaire source", `${data.assessment.sourceTitle} — ${data.assessment.sourceFile}`],
          ["Questionnaire version", data.provenance.questionnaireVersion],
          ["Scoring method", data.provenance.scoringVersion],
          [
            "Validation",
            data.provenance.approvalStatus === "approved"
              ? `Approved (${data.provenance.approvalReference})`
              : "Pending client validation",
          ],
          [
            "Interpretive text",
            `${data.provenance.interpretationVersion}${data.provenance.interpretationStatus === "draft" ? " (pending client approval)" : ""}`,
          ],
          ["Report template", data.provenance.templateVersion],
          ["Scored", formatDateTime(data.provenance.scoredAt, data.timezone)],
        ].map(([label, value]) => (
          <View key={label} style={{ flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.rule }}>
            <Text style={{ width: 140, color: C.slate }}>{label}</Text>
            <Text style={{ flex: 1 }}>{value}</Text>
          </View>
        ))}
        <Text style={{ ...s.small, marginTop: 14 }}>
          Questionnaire material is reproduced from the Indian School of Counselling and Healing Studies workbook supplied for this service.
        </Text>
      </Page>
    </Document>
  );
}
