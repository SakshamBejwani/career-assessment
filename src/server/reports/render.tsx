import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { sha256Hex } from "../security/crypto";
import type { ReportData } from "./data";
import { registerReportFonts, ReportDocument } from "./template";

export interface RenderedReport {
  pdf: Buffer;
  checksum: string;
}

export async function renderReport(data: ReportData): Promise<RenderedReport> {
  registerReportFonts();
  const pdf = await renderToBuffer(<ReportDocument data={data} />);
  return { pdf, checksum: sha256Hex(pdf) };
}
