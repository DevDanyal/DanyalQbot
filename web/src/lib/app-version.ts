import type { Client } from "@libsql/client";
import { getDb, isDbConfigured, ensureSchema } from "./db";

/**
 * App version management.
 * Stores current/minimum/latest version per platform (android, ios, web).
 * Used by the future mobile app to enforce minimum-version updates.
 */

export interface AppVersion {
  id: number;
  platform: string;
  currentVersion: string;
  minimumVersion: string;
  latestVersion: string;
  releaseNotes: string | null;
  updatedAt: number;
}

const DEFAULT_VERSIONS = [
  { platform: "android", currentVersion: "1.0.0", minimumVersion: "1.0.0", latestVersion: "1.0.0", releaseNotes: "Initial release." },
] as const;

function rowToVersion(r: Record<string, unknown>): AppVersion {
  return {
    id: Number(r.id),
    platform: r.platform as string,
    currentVersion: r.current_version as string,
    minimumVersion: r.minimum_version as string,
    latestVersion: r.latest_version as string,
    releaseNotes: (r.release_notes as string | null) ?? null,
    updatedAt: Number(r.updated_at),
  };
}

export async function getAppVersion(platform: string, db?: Client): Promise<AppVersion | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute({
    sql: "SELECT * FROM app_versions WHERE platform = ?",
    args: [platform.trim().toLowerCase()],
  });
  if (res.rows.length === 0) return null;
  return rowToVersion(res.rows[0]);
}

export async function getAllVersions(db?: Client): Promise<AppVersion[]> {
  if (!isDbConfigured() && !db) return [];
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute("SELECT * FROM app_versions ORDER BY id ASC");
  return res.rows.map((r) => rowToVersion(r));
}

export async function upsertAppVersion(
  opts: {
    platform: string;
    currentVersion?: string;
    minimumVersion?: string;
    latestVersion?: string;
    releaseNotes?: string;
  },
  db?: Client,
): Promise<AppVersion> {
  if (!isDbConfigured() && !db) throw new Error("DB not configured");
  await ensureSchema(db);
  const client = db ?? getDb();
  const platform = opts.platform.trim().toLowerCase();
  const existing = await getAppVersion(platform, client);
  const now = Date.now();

  if (existing) {
    const sets: string[] = [];
    const args: (string | number)[] = [];
    if (opts.currentVersion) { sets.push("current_version = ?"); args.push(opts.currentVersion); }
    if (opts.minimumVersion) { sets.push("minimum_version = ?"); args.push(opts.minimumVersion); }
    if (opts.latestVersion) { sets.push("latest_version = ?"); args.push(opts.latestVersion); }
    if (opts.releaseNotes !== undefined) { sets.push("release_notes = ?"); args.push(opts.releaseNotes); }
    sets.push("updated_at = ?");
    args.push(now);
    await client.execute({
      sql: `UPDATE app_versions SET ${sets.join(", ")} WHERE platform = ?`,
      args: [...args, platform],
    });
  } else {
    await client.execute({
      sql: "INSERT INTO app_versions (platform, current_version, minimum_version, latest_version, release_notes, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [
        platform,
        opts.currentVersion ?? "1.0.0",
        opts.minimumVersion ?? "1.0.0",
        opts.latestVersion ?? opts.currentVersion ?? "1.0.0",
        opts.releaseNotes ?? null,
        now,
      ],
    });
  }

  const result = await getAppVersion(platform, client);
  if (!result) throw new Error("Failed to read back app version");
  return result;
}

export async function seedDefaultVersions(db?: Client): Promise<void> {
  if (!isDbConfigured() && !db) return;
  await ensureSchema(db);
  const client = db ?? getDb();
  for (const v of DEFAULT_VERSIONS) {
    const existing = await getAppVersion(v.platform, client);
    if (!existing) {
      await client.execute({
        sql: "INSERT INTO app_versions (platform, current_version, minimum_version, latest_version, release_notes, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [v.platform, v.currentVersion, v.minimumVersion, v.latestVersion, v.releaseNotes, Date.now()],
      });
    }
  }
}
