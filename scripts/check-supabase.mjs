/**
 * Checks that the database behind .env.local is reachable and has the schema
 * this version of the app expects.
 *
 * Run with `npm run check:db`. It answers the question the in-app error cannot:
 * whether a failure is the network, the credentials, or a migration that has
 * not been applied yet.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const MIGRATION = "supabase/migrations/0001_phase3_tasks_and_habit_writes.sql";

if (!url || !key) {
  console.error(
    "✗ Supabase is not configured.\n" +
      "  Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
  );
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

/** A missing table and a denied write are both "the schema is behind". */
const problems = [];

async function checkRead(table) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });

  if (response.ok) {
    console.log(`✓ read ${table}`);
    return;
  }

  const body = await response.json().catch(() => ({}));
  console.log(`✗ read ${table} — ${body.message ?? `HTTP ${response.status}`}`);
  problems.push(`${table} cannot be read`);
}

/**
 * The write path is what actually broke, and no read can tell you whether a
 * policy grants it — so this inserts a row and removes it again. The probe row
 * is inactive, so it stays out of the grid even if the cleanup delete is the
 * thing that turns out to be refused.
 */
async function checkHabitWrites() {
  const insert = await fetch(`${url}/rest/v1/habits`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ name: "__check:db probe__", active: false, sort_order: 0 }),
  });

  if (!insert.ok) {
    const body = await insert.json().catch(() => ({}));
    console.log(`✗ write habits — ${body.message ?? `HTTP ${insert.status}`}`);
    problems.push("habits cannot be written (adding, renaming and deleting will fail)");
    return;
  }

  console.log("✓ write habits");

  const [row] = await insert.json();
  const remove = await fetch(`${url}/rest/v1/habits?id=eq.${row.id}`, {
    method: "DELETE",
    headers,
  });

  if (remove.ok) {
    console.log("✓ delete habits");
  } else {
    console.log(
      `✗ delete habits — the probe row "${row.name}" could not be removed and is ` +
        "still in the database (it is inactive, so it will not appear in the grid).",
    );
    problems.push("habits cannot be deleted");
  }
}

console.log(`Checking ${url}\n`);

await checkRead("habits");
await checkRead("habit_logs");
await checkRead("daily_tasks");
await checkHabitWrites();

if (problems.length === 0) {
  console.log("\nAll good — the database has everything this app needs.");
  process.exit(0);
}

const projectRef = new URL(url).hostname.split(".")[0];

console.error(
  `\n${problems.length} problem(s): ${problems.join("; ")}.\n\n` +
    `Your database is behind. Apply ${MIGRATION}:\n\n` +
    `  1. https://supabase.com/dashboard/project/${projectRef}/sql/new\n` +
    `  2. Paste the whole file (cat ${MIGRATION})\n` +
    "  3. Press Run, then re-run this check.\n",
);
process.exit(1);
