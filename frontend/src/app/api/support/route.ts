import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

/**
 * Public support intake.
 *
 * This used to write into the frontend's own Prisma `SupportTicket` table,
 * which nothing ever read — every web-form message vanished. It now forwards
 * to `POST /v1/support/tickets`, so submissions land in the same
 * `feedback_tickets` queue the admin support workspace serves, and an admin
 * reply can actually reach the person who wrote in.
 *
 * Field validation stays here so a visitor gets an immediate, specific error
 * without a round trip; the backend re-validates regardless.
 */
export async function POST(req: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';

  if (!name || !email || !subject || !message) {
    return new Response(JSON.stringify({ error: 'All fields are required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(
      JSON.stringify({ error: 'Please enter a valid email address.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (message.length < 10) {
    return new Response(
      JSON.stringify({ error: 'Message must be at least 10 characters.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Rebuild the body from the trimmed values so the queue never stores stray
  // whitespace, and so oversized or unexpected fields are dropped.
  const upstream = new Request(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, subject, message }),
  });

  try {
    return await proxyToBackend('/support/tickets', upstream);
  } catch {
    return new Response(
      JSON.stringify({
        error: 'Unable to submit your request. Please try again.',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
