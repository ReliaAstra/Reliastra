import { NextRequest, NextResponse } from 'next/server';
import { createElement } from 'react';
import { render } from '@react-email/render';

import { ADMIN_ACCESS_COOKIE, ADMIN_API_HEADER } from '@/lib/admin-session-cookie';
import { verifyAdminToken } from '@/lib/admin-token-verify';
import {
  buildProps,
  FieldError,
  fillSubject,
  missingRequired,
} from '@/emails/compose-props';
import { toText, extractBody } from '@/emails/to-text';
import { byId, requiredVariables } from '@/emails/registry';

export const runtime = 'nodejs';

/**
 * POST /api/email-render — render a message class with real values.
 *
 * This is the compose-time counterpart to the compile step: same components,
 * same toText, same output contract — but rendered with the operator's
 * form entries plus provenance-bound record values instead of fixtures.
 * Because rendering happens with live data, every conditional branch, state
 * colour, ledger computation and section number derives from the actual send.
 *
 * Auth mirrors the admin proxy boundary (CSRF marker + verified admin
 * session); the route holds no secrets and touches no database.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get(ADMIN_API_HEADER) !== '1') {
    return NextResponse.json(
      { error: 'Admin requests must include the admin session marker.' },
      { status: 403 },
    );
  }
  const accessToken = req.cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? null;
  if (!verifyAdminToken(accessToken, 'admin_access')) {
    return NextResponse.json(
      { error: 'Admin authentication required.' },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }
  const classId = (body as Record<string, unknown>)?.class_id;
  const rawVars = (body as Record<string, unknown>)?.variables;
  if (typeof classId !== 'string' || !classId) {
    return NextResponse.json({ error: 'class_id is required.' }, { status: 400 });
  }
  if (typeof rawVars !== 'object' || rawVars === null || Array.isArray(rawVars)) {
    return NextResponse.json({ error: 'variables must be an object.' }, { status: 400 });
  }
  const variables: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawVars as Record<string, unknown>)) {
    if (v !== undefined && v !== null) variables[k] = String(v);
  }

  const spec = byId(classId);
  if (!spec) {
    return NextResponse.json({ error: `Unknown message class: ${classId}` }, { status: 404 });
  }

  const missing = missingRequired(requiredVariables(spec), variables);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'Required fields are missing.', fields: missing },
      { status: 422 },
    );
  }

  let props: object;
  try {
    props = buildProps(spec.id, variables);
  } catch (err) {
    if (err instanceof FieldError) {
      return NextResponse.json(
        { error: err.message, fields: [err.field] },
        { status: 422 },
      );
    }
    throw err;
  }

  const document = await render(
    createElement(spec.component, props as never),
    { pretty: false, plainText: false },
  );
  const html = extractBody(document);
  const subject = fillSubject(spec.subject, variables);
  const unresolved = requiredVariables(spec).filter(
    (name) => subject.includes(`{{${name}}}`) || subject.includes(`{{ ${name} }}`),
  );
  if (unresolved.length > 0) {
    return NextResponse.json(
      {
        error: 'Subject still contains unresolved template variables.',
        fields: unresolved,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ subject, html, text: toText(html) });
}
