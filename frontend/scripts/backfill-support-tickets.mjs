#!/usr/bin/env node
/**
 * One-off backfill: move web-form support requests out of the frontend's own
 * `SupportTicket` table and into the backend `feedback_tickets` queue.
 *
 * Why this exists
 * ---------------
 * `POST /api/support` used to write into a Prisma table that nothing ever
 * read. Those rows are the only copy of real customer messages, so they must
 * not be dropped when the model is retired. This script replays them into the
 * live admin support queue, where an admin can finally answer them.
 *
 * It posts through the *admin* endpoint rather than the public one, because
 * the public endpoint is IP rate-limited (10 / 10 min) and would reject a
 * bulk replay. Supply an admin access token via ADMIN_ACCESS_TOKEN.
 *
 * Idempotent: a row is skipped when the admin queue already holds a ticket
 * with the same email + subject, so re-running is safe.
 *
 * Usage
 * -----
 *   ADMIN_ACCESS_TOKEN=... \
 *   RELIASTRA_API_URL=https://api.reliastra.com \
 *   node scripts/backfill-support-tickets.mjs [--dry-run]
 */

import { PrismaClient } from '@prisma/client';

const API = (process.env.RELIASTRA_API_URL || 'https://api.reliastra.com').replace(/\/$/, '');
const TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

if (!TOKEN) {
  console.error('ADMIN_ACCESS_TOKEN is required (an admin access token).');
  process.exit(1);
}

const db = new PrismaClient();

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
  }
  return body;
}

async function existingKeys() {
  const keys = new Set();
  let page = 1;
  for (;;) {
    const res = await fetchJson(
      `/v1/admin/support/tickets?page=${page}&page_size=100&source=web`
    );
    for (const t of res.items || []) {
      keys.add(`${String(t.email).toLowerCase()}::${t.subject}`);
    }
    const total = res.total ?? 0;
    if (page * 100 >= total || (res.items || []).length === 0) break;
    page += 1;
  }
  return keys;
}

async function main() {
  const rows = await db.supportTicket.findMany({ orderBy: { createdAt: 'asc' } });
  console.log(`Found ${rows.length} legacy support row(s).`);
  if (rows.length === 0) return;

  const seen = await existingKeys();
  console.log(`Backend already holds ${seen.size} web-sourced ticket(s).`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const key = `${row.email.toLowerCase()}::${row.subject}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }

    if (DRY_RUN) {
      console.log(`[dry-run] would create: ${row.email} — ${row.subject}`);
      created += 1;
      continue;
    }

    try {
      const ticket = await fetchJson('/v1/admin/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          email: row.email,
          full_name: row.name,
          category: 'general',
          subject: row.subject,
          body: row.message,
          priority: 'normal',
          source: 'web',
        }),
      });
      seen.add(key);
      created += 1;
      console.log(`created ${ticket.ticket_number} for ${row.email}`);
    } catch (err) {
      failed += 1;
      console.error(`FAILED ${row.email} — ${row.subject}: ${err.message}`);
    }
  }

  console.log(
    `\nDone. created=${created} skipped=${skipped} failed=${failed}${DRY_RUN ? ' (dry run)' : ''}`
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
