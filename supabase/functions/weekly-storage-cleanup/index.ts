// Storage cleanup for the 'proctoring' bucket.
// Deletes candidate photos, snapshots and recordings once they are 7 days old,
// so the free 1 GB storage limit is never hit. Question PDFs (questions/) are never deleted.
//
// Runs every night via pg_cron (see supabase/weekly-storage-cleanup.sql).
// Requires the secret CLEANUP_SECRET; the caller must send it in the "x-cleanup-secret" header.

import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "proctoring";
const FOLDERS_TO_CLEAN = ["photos", "snapshots", "recordings"];
// Files are kept for this many days after upload, then deleted.
const RETENTION_DAYS = 7;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Recursively list every file path under a folder.
async function listFiles(prefix: string): Promise<{ path: string; createdAt: string | null }[]> {
  const out: { path: string; createdAt: string | null }[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: pageSize, offset });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      if (item.id === null) out.push(...(await listFiles(path))); // sub-folder
      else out.push({ path, createdAt: item.created_at ?? null });
    }
    if (data.length < pageSize) break;
  }
  return out;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CLEANUP_SECRET");
  if (!secret || req.headers.get("x-cleanup-secret") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const summary: Record<string, number> = {};

  try {
    for (const folder of FOLDERS_TO_CLEAN) {
      const files = await listFiles(folder);
      const toDelete = files
        .filter((f) => f.createdAt && new Date(f.createdAt).getTime() < cutoff)
        .map((f) => f.path);

      for (let i = 0; i < toDelete.length; i += 100) {
        const { error } = await supabase.storage.from(BUCKET).remove(toDelete.slice(i, i + 100));
        if (error) throw new Error(`remove in ${folder}: ${error.message}`);
      }
      summary[folder] = toDelete.length;
    }

    console.log("Storage cleanup done:", summary);
    return new Response(JSON.stringify({ ok: true, deleted: summary }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Storage cleanup failed:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e), deleted: summary }), { status: 500 });
  }
});
