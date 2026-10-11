import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AwsClient } from "aws4fetch";
import { getConfig } from "../config";
import { getDb, type Tx } from "../db";

/**
 * Private report storage. `database` keeps PDFs in report_blobs (works on every host and is
 * covered by database backups); `filesystem` suits a VPS with a persistent disk; `s3` works
 * with any S3-compatible private bucket. Nothing is ever exposed by public URL.
 */
export interface StoredObject {
  driver: "database" | "filesystem" | "s3";
  key: string;
}

const keyFor = (reportId: string) => `reports/${reportId}.pdf`;

function s3Client() {
  const s3 = getConfig().storage.s3!;
  const client = new AwsClient({ accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey, region: s3.region, service: "s3" });
  const url = (key: string) => `${s3.endpoint}/${s3.bucket}/${key}`;
  return { client, url };
}

export async function putReport(reportId: string, pdf: Buffer, tx?: Tx): Promise<StoredObject> {
  const { storage } = getConfig();
  const key = keyFor(reportId);
  switch (storage.driver) {
    case "database": {
      const db = tx ?? getDb();
      await db.reportBlob.upsert({
        where: { reportId },
        create: { reportId, data: new Uint8Array(pdf) },
        update: { data: new Uint8Array(pdf) },
      });
      return { driver: "database", key };
    }
    case "filesystem": {
      const path = resolve(storage.dir, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, pdf, { mode: 0o600 });
      return { driver: "filesystem", key };
    }
    case "s3": {
      const { client, url } = s3Client();
      const res = await client.fetch(url(key), {
        method: "PUT",
        body: new Uint8Array(pdf),
        headers: { "content-type": "application/pdf" },
      });
      if (!res.ok) throw new Error(`S3 upload failed with status ${res.status}`);
      return { driver: "s3", key };
    }
  }
}

export async function getReport(reportId: string, stored: StoredObject): Promise<Buffer> {
  switch (stored.driver) {
    case "database": {
      const blob = await getDb().reportBlob.findUnique({ where: { reportId } });
      if (!blob) throw new Error("Report blob missing");
      return Buffer.from(blob.data);
    }
    case "filesystem":
      return readFile(resolve(getConfig().storage.dir, stored.key));
    case "s3": {
      const { client, url } = s3Client();
      const res = await client.fetch(url(stored.key));
      if (!res.ok) throw new Error(`S3 download failed with status ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    }
  }
}
