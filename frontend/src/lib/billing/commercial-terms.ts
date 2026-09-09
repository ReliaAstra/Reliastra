/**
 * Customer-facing commercial copy used when the API payload is not yet loaded.
 * Live pages prefer the backend `/v1/billing/terms` payload. Do not invent a
 * money-back window here — RELIASTRA does not advertise one.
 */

export const REFUND_POLICY_PATH = '/refund-policy';
export const BILLING_EMAIL = 'billing@reliastra.com';
export const PRO_PRICE_USD = 19;
export const PRO_ANNUAL_USD = 190;
export const TRIAL_DAYS = 14;

export const COMMERCIAL_COPY = {
  trialSummary:
    `Every new organization receives ${TRIAL_DAYS} days of Pro capabilities. No payment method is required to start. When the trial ends without a paid subscription, the organization continues on Free.`,
  trialEndSummary:
    `When the ${TRIAL_DAYS}-day trial ends, the organization reverts to the Free plan unless a paid Pro subscription ($${PRO_PRICE_USD} USD / month) is active. Configuration and history are preserved.`,
  priceAfterTrial:
    `Pro is $${PRO_PRICE_USD} USD per month after the trial, billed through Paystack for the selected interval. Payment is collected when you subscribe, not when the trial starts.`,
  cancellationSummary:
    'You may cancel at any time. Access continues until the end of the current paid period. Cancellation stops future renewal; it does not by itself refund the current period.',
  cancellationAfterEffect:
    'After cancellation takes effect, the organization returns to the Free plan. Monitors, configuration and history are preserved; Free limits apply. You can resume before the period ends if you change your mind.',
  refundSummary:
    `RELIASTRA does not advertise a fixed money-back window. To request a refund of a collected payment, email ${BILLING_EMAIL} with the payment reference from your invoice or receipt. If a refund is issued, it is processed through Paystack to the original payment method.`,
  refundPeriod:
    'There is no advertised refund period. Cancellation is the defined customer right under the Terms of Service. A refund of a collected payment is a separate billing decision, not an automatic entitlement.',
  refundHowTo:
    `Email ${BILLING_EMAIL} from the billing address on the account. Include the organization name and the payment reference shown on the invoice, receipt, or billing history.`,
  refundDestination:
    'If a refund is issued, it is sent through Paystack to the original payment method. RELIASTRA never stores full card numbers.',
  cancellationVersusRefund:
    'Cancellation ends future renewal and keeps access until the paid period ends. A refund, if issued, returns collected funds through Paystack. Cancelling does not by itself create a refund of the current period.',
  termsAcceptanceLabel:
    `I agree to the Terms of Service and understand the cancellation and refund terms. Pro is $${PRO_PRICE_USD} USD per month after the ${TRIAL_DAYS}-day trial.`,
} as const;
