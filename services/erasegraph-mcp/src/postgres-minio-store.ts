import { Client as MinioClient } from "minio";
import { Pool } from "pg";
import {
  auditEventSchema,
  consentRequestSchema,
  erasurePlanSchema,
  executionReceiptSchema,
  retentionClassSchema,
  resourceSnapshotSchema,
  verificationReportSchema,
  type AuditEvent,
  type ConsentRequest,
  type DemoSeed,
  type ErasurePlan,
  type ExecutionReceipt,
  type HealthState,
  type ResourceSnapshot,
  type SeedMinioObject,
  type SystemId,
  type VerificationReport
} from "./domain.js";
import { DomainError } from "./errors.js";
import { canonicalJson, sha256 } from "./hashing.js";
import type { ConditionalDeleteResult, EraseGraphStore } from "./store.js";
import type { AppConfig } from "./config.js";
import { createDemoSeed } from "./demo-seed.js";

interface PostgresResourceRow {
  resource_id: string;
  subject_id: string;
  purposes: string[];
  retention_class: string;
  document: unknown;
  payload: unknown;
}

interface VersionedObjectInfo {
  name?: string;
  versionId?: string;
  isLatest?: string | boolean;
  isDeleteMarker?: boolean;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS erasegraph_requests (
  request_id text PRIMARY KEY,
  subject_id text NOT NULL,
  document jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS erasegraph_subject_records (
  resource_id text PRIMARY KEY,
  subject_id text NOT NULL,
  purposes text[] NOT NULL,
  retention_class text NOT NULL,
  payload jsonb NOT NULL,
  document jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS erasegraph_plans (
  plan_id text PRIMARY KEY,
  request_id text NOT NULL,
  plan_hash text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL,
  document jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS erasegraph_plans_request_created_idx
  ON erasegraph_plans (request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS erasegraph_executions (
  execution_id text PRIMARY KEY,
  request_id text NOT NULL,
  idempotency_key text NOT NULL,
  plan_hash text NOT NULL,
  executed_at timestamptz NOT NULL,
  document jsonb NOT NULL,
  UNIQUE (request_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS erasegraph_verifications (
  verification_id text PRIMARY KEY,
  request_id text NOT NULL,
  plan_hash text NOT NULL,
  checked_at timestamptz NOT NULL,
  document jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS erasegraph_audit_events (
  event_id text PRIMARY KEY,
  request_id text NOT NULL,
  sequence integer NOT NULL,
  created_at timestamptz NOT NULL,
  document jsonb NOT NULL,
  UNIQUE (request_id, sequence)
);

CREATE TABLE IF NOT EXISTS erasegraph_demo_reset_state (
  singleton_id text PRIMARY KEY CHECK (singleton_id = 'demo'),
  status text NOT NULL CHECK (status IN ('pending', 'complete')),
  reset_at timestamptz NOT NULL
);
`;

function isMinioMissing(error: unknown): boolean {
  if (error === null || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String(error.code) : "";
  return ["NoSuchKey", "NoSuchVersion", "NotFound", "NoSuchObject"].includes(code);
}

function metadataValue(metadata: Record<string, string>, key: string): string | undefined {
  const lowerKey = key.toLowerCase();
  for (const [candidate, value] of Object.entries(metadata)) {
    const normalized = candidate.toLowerCase().replace(/^x-amz-meta-/, "");
    if (normalized === lowerKey && typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

export class PostgresMinioStore implements EraseGraphStore {
  private readonly pool: Pool;
  private readonly minio: MinioClient;
  private readonly bucket: string;

  constructor(config: AppConfig) {
    this.pool = new Pool({ connectionString: config.databaseUrl, max: 8 });
    this.minio = new MinioClient(config.minio);
    this.bucket = config.minio.bucket;
  }

  async initialize(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
    if (!(await this.minio.bucketExists(this.bucket))) {
      await this.minio.makeBucket(this.bucket);
    }
    const versioning = await this.minio.getBucketVersioning(this.bucket);
    if (versioning.Status !== "Enabled") {
      await this.minio.setBucketVersioning(this.bucket, { Status: "Enabled" });
    }
    const confirmedVersioning = await this.minio.getBucketVersioning(this.bucket);
    const excludedPrefixes: unknown = confirmedVersioning.ExcludedPrefixes;
    const hasExcludedPrefixes = Array.isArray(excludedPrefixes)
      ? excludedPrefixes.length > 0
      : excludedPrefixes !== undefined && excludedPrefixes !== null && excludedPrefixes !== "";
    if (
      confirmedVersioning.Status !== "Enabled" ||
      hasExcludedPrefixes ||
      confirmedVersioning.ExcludeFolders === true
    ) {
      throw new DomainError(
        "MINIO_VERSIONING_REQUIRED",
        "MinIO bucket versioning is required for version-bound destructive operations.",
        503
      );
    }
    const pendingReset = await this.pool.query<{ reset_at: Date | string }>(
      "SELECT reset_at FROM erasegraph_demo_reset_state WHERE singleton_id = 'demo' AND status = 'pending'"
    );
    const resetAt = pendingReset.rows[0]?.reset_at;
    if (resetAt !== undefined) {
      await this.applyDemoReset(createDemoSeed(new Date(resetAt)));
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async health(): Promise<HealthState> {
    const [postgres, minio, reset] = await Promise.allSettled([
      this.pool.query("SELECT 1"),
      this.minio.bucketExists(this.bucket),
      this.pool.query<{ pending: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM erasegraph_demo_reset_state WHERE singleton_id = 'demo' AND status = 'pending') AS pending"
      )
    ]);
    const resetPending = reset.status !== "fulfilled" || reset.value.rows[0]?.pending === true;
    return {
      postgres: postgres.status === "fulfilled" ? "up" : "down",
      minio: minio.status === "fulfilled" && minio.value && !resetPending ? "up" : "down"
    };
  }

  async resetDemo(seed: DemoSeed): Promise<void> {
    this.assertSyntheticSeed(seed);
    await this.pool.query(
      `INSERT INTO erasegraph_demo_reset_state (singleton_id, status, reset_at)
       VALUES ('demo', 'pending', $1)
       ON CONFLICT (singleton_id)
       DO UPDATE SET status = 'pending', reset_at = EXCLUDED.reset_at`,
      [seed.request.receivedAt]
    );
    await this.applyDemoReset(seed);
  }

  private async applyDemoReset(seed: DemoSeed): Promise<void> {
    await this.removeDemoObjects();
    for (const object of seed.minioObjects) {
      await this.putDemoObject(object);
    }
    const seededObjects = await this.listMinioResources(seed.request.subjectId);
    if (
      seededObjects.length !== seed.minioObjects.length ||
      seed.minioObjects.some((expected) => {
        const actual = seededObjects.find((candidate) => candidate.resourceId === expected.resourceId);
        return actual === undefined || actual.fingerprint !== expected.fingerprint;
      })
    ) {
      throw new DomainError("MINIO_RESET_FAILED", "Demo objects did not pass post-seed verification.", 503);
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        TRUNCATE TABLE
          erasegraph_audit_events,
          erasegraph_verifications,
          erasegraph_executions,
          erasegraph_plans,
          erasegraph_subject_records,
          erasegraph_requests
        RESTART IDENTITY
      `);
      await client.query(
        "INSERT INTO erasegraph_requests (request_id, subject_id, document) VALUES ($1, $2, $3::jsonb)",
        [seed.request.id, seed.request.subjectId, JSON.stringify(seed.request)]
      );
      for (const record of seed.postgresRecords) {
        const snapshot = resourceSnapshotSchema.parse(record);
        await client.query(
          `INSERT INTO erasegraph_subject_records
            (resource_id, subject_id, purposes, retention_class, payload, document)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
          [
            record.resourceId,
            record.subjectId,
            record.purposes,
            record.retentionClass,
            JSON.stringify(record.payload),
            JSON.stringify(snapshot)
          ]
        );
      }
      await client.query(
        "UPDATE erasegraph_demo_reset_state SET status = 'complete', reset_at = $1 WHERE singleton_id = 'demo'",
        [seed.request.receivedAt]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getRequest(requestId: string): Promise<ConsentRequest | null> {
    const result = await this.pool.query<{ document: unknown }>(
      "SELECT document FROM erasegraph_requests WHERE request_id = $1",
      [requestId]
    );
    const row = result.rows[0];
    return row === undefined ? null : consentRequestSchema.parse(row.document);
  }

  async updateRequest(request: ConsentRequest): Promise<void> {
    const parsed = consentRequestSchema.parse(request);
    const result = await this.pool.query(
      "UPDATE erasegraph_requests SET document = $2::jsonb WHERE request_id = $1",
      [parsed.id, JSON.stringify(parsed)]
    );
    if (result.rowCount !== 1) {
      throw new DomainError("REQUEST_NOT_FOUND", `Consent request ${parsed.id} was not found.`, 404);
    }
  }

  async listResources(subjectId: string, system?: SystemId): Promise<ResourceSnapshot[]> {
    const resources: ResourceSnapshot[] = [];
    if (system === undefined || system === "postgres") {
      const result = await this.pool.query<PostgresResourceRow>(
        `SELECT resource_id, subject_id, purposes, retention_class, document, payload
           FROM erasegraph_subject_records
          WHERE subject_id = $1
          ORDER BY resource_id`,
        [subjectId]
      );
      resources.push(...result.rows.map((row) => this.postgresSnapshot(row)));
    }
    if (system === undefined || system === "minio") {
      resources.push(...(await this.listMinioResources(subjectId)));
    }
    return resources.sort((left, right) =>
      `${left.system}:${left.resourceId}`.localeCompare(`${right.system}:${right.resourceId}`)
    );
  }

  async resourceExists(system: SystemId, resourceId: string): Promise<boolean> {
    if (system === "postgres") {
      const result = await this.pool.query("SELECT 1 FROM erasegraph_subject_records WHERE resource_id = $1", [
        resourceId
      ]);
      return result.rowCount === 1;
    }
    try {
      await this.minio.statObject(this.bucket, resourceId);
      return true;
    } catch (error) {
      if (isMinioMissing(error)) {
        return false;
      }
      throw error;
    }
  }

  async deleteResourceIfUnchanged(expected: ResourceSnapshot): Promise<ConditionalDeleteResult> {
    const parsedExpected = resourceSnapshotSchema.parse(expected);
    if (parsedExpected.system === "postgres") {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query<PostgresResourceRow>(
          `SELECT resource_id, subject_id, purposes, retention_class, document, payload
             FROM erasegraph_subject_records
            WHERE resource_id = $1
            FOR UPDATE`,
          [parsedExpected.resourceId]
        );
        const row = result.rows[0];
        if (row === undefined) {
          await client.query("COMMIT");
          return { status: "missing" };
        }
        const current = this.postgresSnapshot(row);
        if (canonicalJson(current) !== canonicalJson(parsedExpected)) {
          await client.query("ROLLBACK");
          return { status: "changed" };
        }
        const deleted = await client.query("DELETE FROM erasegraph_subject_records WHERE resource_id = $1", [
          parsedExpected.resourceId
        ]);
        await client.query("COMMIT");
        return deleted.rowCount === 1 ? { status: "deleted" } : { status: "missing" };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    if (parsedExpected.versionId === undefined) {
      return { status: "changed" };
    }
    const exactVersions = (await this.listObjectVersions(parsedExpected.resourceId)).filter(
      (entry) => entry.name === parsedExpected.resourceId
    );
    try {
      const latest = await this.minio.statObject(this.bucket, parsedExpected.resourceId);
      if (latest.versionId !== parsedExpected.versionId) {
        return { status: "changed" };
      }
    } catch (error) {
      if (isMinioMissing(error)) {
        return exactVersions.some((entry) => entry.isDeleteMarker !== true)
          ? { status: "changed" }
          : { status: "missing" };
      }
      throw error;
    }

    let current: ResourceSnapshot;
    try {
      current = await this.readMinioResource(parsedExpected.resourceId, parsedExpected.versionId);
    } catch (error) {
      if (isMinioMissing(error)) {
        return { status: "missing" };
      }
      throw error;
    }
    if (canonicalJson(current) !== canonicalJson(parsedExpected)) {
      return { status: "changed" };
    }

    await this.minio.removeObject(this.bucket, parsedExpected.resourceId, {
      versionId: parsedExpected.versionId
    });
    const remainingVersions = (await this.listObjectVersions(parsedExpected.resourceId)).filter(
      (entry) => entry.name === parsedExpected.resourceId
    );
    return remainingVersions.length === 0 ? { status: "deleted" } : { status: "changed" };
  }

  async savePlan(plan: ErasurePlan): Promise<void> {
    const parsed = erasurePlanSchema.parse(plan);
    await this.pool.query(
      `INSERT INTO erasegraph_plans (plan_id, request_id, plan_hash, created_at, document)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [parsed.id, parsed.requestId, parsed.planHash, parsed.createdAt, JSON.stringify(parsed)]
    );
  }

  async getLatestPlan(requestId: string): Promise<ErasurePlan | null> {
    return this.getLatestDocument(
      "SELECT document FROM erasegraph_plans WHERE request_id = $1 ORDER BY created_at DESC, plan_id DESC LIMIT 1",
      requestId,
      erasurePlanSchema
    );
  }

  async getPlan(requestId: string, planHash: string): Promise<ErasurePlan | null> {
    const result = await this.pool.query<{ document: unknown }>(
      "SELECT document FROM erasegraph_plans WHERE request_id = $1 AND plan_hash = $2",
      [requestId, planHash]
    );
    const row = result.rows[0];
    return row === undefined ? null : erasurePlanSchema.parse(row.document);
  }

  async updatePlan(plan: ErasurePlan): Promise<void> {
    const parsed = erasurePlanSchema.parse(plan);
    const result = await this.pool.query("UPDATE erasegraph_plans SET document = $2::jsonb WHERE plan_id = $1", [
      parsed.id,
      JSON.stringify(parsed)
    ]);
    if (result.rowCount !== 1) {
      throw new DomainError("PLAN_NOT_FOUND", `Plan ${parsed.id} was not found.`, 404);
    }
  }

  async getExecution(requestId: string, idempotencyKey: string): Promise<ExecutionReceipt | null> {
    const result = await this.pool.query<{ document: unknown }>(
      "SELECT document FROM erasegraph_executions WHERE request_id = $1 AND idempotency_key = $2",
      [requestId, idempotencyKey]
    );
    const row = result.rows[0];
    return row === undefined ? null : executionReceiptSchema.parse(row.document);
  }

  async getLatestExecution(requestId: string): Promise<ExecutionReceipt | null> {
    return this.getLatestDocument(
      "SELECT document FROM erasegraph_executions WHERE request_id = $1 ORDER BY executed_at DESC, execution_id DESC LIMIT 1",
      requestId,
      executionReceiptSchema
    );
  }

  async saveExecution(execution: ExecutionReceipt): Promise<void> {
    const parsed = executionReceiptSchema.parse(execution);
    await this.pool.query(
      `INSERT INTO erasegraph_executions
        (execution_id, request_id, idempotency_key, plan_hash, executed_at, document)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        parsed.id,
        parsed.requestId,
        parsed.idempotencyKey,
        parsed.planHash,
        parsed.executedAt,
        JSON.stringify(parsed)
      ]
    );
  }

  async getLatestVerification(requestId: string): Promise<VerificationReport | null> {
    return this.getLatestDocument(
      "SELECT document FROM erasegraph_verifications WHERE request_id = $1 ORDER BY checked_at DESC, verification_id DESC LIMIT 1",
      requestId,
      verificationReportSchema
    );
  }

  async saveVerification(verification: VerificationReport): Promise<void> {
    const parsed = verificationReportSchema.parse(verification);
    await this.pool.query(
      `INSERT INTO erasegraph_verifications
        (verification_id, request_id, plan_hash, checked_at, document)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [parsed.id, parsed.requestId, parsed.planHash, parsed.checkedAt, JSON.stringify(parsed)]
    );
  }

  async listAuditEvents(requestId: string): Promise<AuditEvent[]> {
    const result = await this.pool.query<{ document: unknown }>(
      "SELECT document FROM erasegraph_audit_events WHERE request_id = $1 ORDER BY sequence",
      [requestId]
    );
    return result.rows.map((row) => auditEventSchema.parse(row.document));
  }

  async saveAuditEvent(event: AuditEvent): Promise<void> {
    const parsed = auditEventSchema.parse(event);
    await this.pool.query(
      `INSERT INTO erasegraph_audit_events (event_id, request_id, sequence, created_at, document)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [parsed.id, parsed.requestId, parsed.sequence, parsed.createdAt, JSON.stringify(parsed)]
    );
  }

  private async getLatestDocument<T>(
    query: string,
    requestId: string,
    schema: { parse(value: unknown): T }
  ): Promise<T | null> {
    const result = await this.pool.query<{ document: unknown }>(query, [requestId]);
    const row = result.rows[0];
    return row === undefined ? null : schema.parse(row.document);
  }

  private async putDemoObject(object: SeedMinioObject): Promise<void> {
    await this.minio.putObject(this.bucket, object.resourceId, Buffer.from(object.content), object.sizeBytes, {
      "Content-Type": object.contentType,
      "X-Amz-Meta-Subject-Id": object.subjectId,
      "X-Amz-Meta-Label": object.label,
      "X-Amz-Meta-Category": object.category,
      "X-Amz-Meta-Purposes": object.purposes.join(","),
      "X-Amz-Meta-Retention-Class": object.retentionClass,
      "X-Amz-Meta-Fingerprint": object.fingerprint,
      "X-Amz-Meta-Created-At": object.createdAt
    });
  }

  private async listMinioResources(subjectId: string): Promise<ResourceSnapshot[]> {
    const prefix = `subjects/${subjectId}/`;
    const versions = await this.listObjectVersions(prefix);
    const byName = new Map<string, VersionedObjectInfo[]>();
    for (const version of versions) {
      if (version.name === undefined) continue;
      byName.set(version.name, [...(byName.get(version.name) ?? []), version]);
    }
    const resources: ResourceSnapshot[] = [];
    for (const [name, objectVersions] of byName) {
      const dataVersions = objectVersions.filter((entry) => entry.isDeleteMarker !== true);
      const current = dataVersions.find((entry) => entry.isLatest === true || entry.isLatest === "true");
      if (
        objectVersions.some((entry) => entry.isDeleteMarker === true) ||
        dataVersions.length !== 1 ||
        current?.versionId === undefined ||
        current.versionId === "null"
      ) {
        throw new DomainError(
          "UNSAFE_OBJECT_HISTORY",
          `MinIO object ${name} has ambiguous or retained version history; destructive planning was blocked.`,
          409
        );
      }
      resources.push(await this.readMinioResource(name, current.versionId));
    }
    return resources.sort((left, right) => left.resourceId.localeCompare(right.resourceId));
  }

  private async readMinioResource(name: string, versionId: string): Promise<ResourceSnapshot> {
    const stat = await this.minio.statObject(this.bucket, name, { versionId });
    const content = await this.readObject(name, versionId);
    const metadata = stat.metaData as Record<string, string>;
    const subjectId = metadataValue(metadata, "subject-id");
    const rawPurposes = metadataValue(metadata, "purposes");
    const rawRetentionClass = metadataValue(metadata, "retention-class");
    if (subjectId === undefined || rawPurposes === undefined || rawRetentionClass === undefined) {
      throw new DomainError(
        "RESOURCE_METADATA_INVALID",
        `MinIO object ${name} is missing required subject, purpose, or retention metadata.`,
        409
      );
    }
    if (subjectId !== "C-1842") {
      throw new DomainError(
        "RESOURCE_METADATA_INVALID",
        `MinIO object ${name} has a subject identifier outside this verified request.`,
        409
      );
    }
    const purposes = rawPurposes.split(",").map((purpose) => purpose.trim());
    const retentionClass = retentionClassSchema.safeParse(rawRetentionClass);
    if (purposes.some((purpose) => purpose.length === 0) || !retentionClass.success) {
      throw new DomainError(
        "RESOURCE_METADATA_INVALID",
        `MinIO object ${name} has empty purposes or an unknown retention class.`,
        409
      );
    }
    return resourceSnapshotSchema.parse({
      system: "minio",
      resourceId: name,
      subjectId,
      label: metadataValue(metadata, "label") ?? name,
      category: metadataValue(metadata, "category") ?? "object",
      purposes,
      retentionClass: retentionClass.data,
      fingerprint: sha256(content),
      sizeBytes: content.byteLength,
      createdAt: metadataValue(metadata, "created-at") ?? stat.lastModified.toISOString(),
      versionId
    });
  }

  private async readObject(name: string, versionId?: string): Promise<Buffer> {
    const stream = await this.minio.getObject(this.bucket, name, versionId === undefined ? undefined : { versionId });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private async listObjectNames(prefix: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const names: string[] = [];
      const stream = this.minio.listObjectsV2(this.bucket, prefix, true);
      stream.on("data", (item) => {
        if (item.name !== undefined) {
          names.push(item.name);
        }
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(names.sort()));
    });
  }

  private async listObjectVersions(prefix: string): Promise<VersionedObjectInfo[]> {
    return new Promise<VersionedObjectInfo[]>((resolve, reject) => {
      const versions: VersionedObjectInfo[] = [];
      const stream = this.minio.listObjects(this.bucket, prefix, true, { IncludeVersion: true });
      stream.on("data", (item) => versions.push(item as VersionedObjectInfo));
      stream.on("error", reject);
      stream.on("end", () => resolve(versions));
    });
  }

  private async removeDemoObjects(): Promise<void> {
    const versions = await this.listObjectVersions("subjects/C-1842/");
    for (const version of versions) {
      if (version.name === undefined || version.versionId === undefined) {
        throw new DomainError("MINIO_RESET_FAILED", "Could not identify every demo object version.", 503);
      }
      await this.minio.removeObject(this.bucket, version.name, { versionId: version.versionId });
    }
    if ((await this.listObjectVersions("subjects/C-1842/")).length > 0) {
      throw new DomainError("MINIO_RESET_FAILED", "Demo object versions remain after reset cleanup.", 503);
    }
  }

  private postgresSnapshot(row: PostgresResourceRow): ResourceSnapshot {
    const stored = resourceSnapshotSchema.parse(row.document);
    const serialized = canonicalJson(row.payload);
    return resourceSnapshotSchema.parse({
      ...stored,
      system: "postgres",
      resourceId: row.resource_id,
      subjectId: row.subject_id,
      purposes: row.purposes,
      retentionClass: row.retention_class,
      fingerprint: sha256(serialized),
      sizeBytes: Buffer.byteLength(serialized)
    });
  }

  private assertSyntheticSeed(seed: DemoSeed): void {
    const allResources = [...seed.postgresRecords, ...seed.minioObjects];
    const invalidEmail = JSON.stringify(seed).match(/[\w.+-]+@[\w.-]+/g)?.find((email) => !email.endsWith(".example.test"));
    if (
      seed.request.subjectId !== "C-1842" ||
      !seed.request.email.endsWith(".example.test") ||
      allResources.some((resource) => resource.subjectId !== "C-1842") ||
      invalidEmail !== undefined
    ) {
      throw new DomainError(
        "UNSAFE_DEMO_SEED",
        "Demo reset accepts only subject C-1842 and synthetic .example.test identities.",
        500
      );
    }
  }
}
