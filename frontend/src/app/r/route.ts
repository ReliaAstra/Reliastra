import { NextRequest } from 'next/server';
import { handlePartnerReferralRequest } from '@/lib/partner-referral-http';

/** `/r` with no code is not a valid referral link. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return handlePartnerReferralRequest(request);
}
