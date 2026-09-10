import { describe, expect, it } from 'vitest';

import { evidenceRank, evidenceState } from '../dashboard/evidence-state';

/**
 * The console must never collapse four different situations into one word.
 *
 * Before the evidence state existed on the incident payload, every incident
 * without a linked report rendered "none" - including one that was mid
 * generation, one whose generation had failed with a reason, and one whose
 * plan does not include the feature. Those need different sentences and
 * different actions, and this file pins the mapping the UI renders from.
 */
describe('evidenceState', () => {
  it('reports an available report as openable', () => {
    const view = evidenceState({
      evidence_report_id: 'rep-1',
      evidence_status: 'available',
    });
    expect(view.key).toBe('available');
    expect(view.label).toBe('Available');
    expect(view.tone).toBe('ok');
    expect(view.action).toBe('open');
  });

  it('reports in-flight generation as in flight, not as absent', () => {
    const view = evidenceState({ evidence_report_id: null, evidence_status: 'generating' });
    expect(view.key).toBe('generating');
    expect(view.label).toBe('Generating');
    expect(view.tone).toBe('busy');
    expect(view.action).toBe('none');
    expect(view.label.toLowerCase()).not.toBe('none');
  });

  it('surfaces the reason a generation failed', () => {
    const view = evidenceState({
      evidence_report_id: null,
      evidence_status: 'failed',
      evidence_error: 'storage failed: bucket unreachable',
    });
    expect(view.key).toBe('failed');
    expect(view.tone).toBe('warn');
    expect(view.action).toBe('retry');
    expect(view.hint).toContain('bucket unreachable');
  });

  it('still offers a retry when a failed attempt has no stored reason', () => {
    const view = evidenceState({ evidence_report_id: null, evidence_status: 'failed' });
    expect(view.action).toBe('retry');
    expect(view.hint.length).toBeGreaterThan(0);
  });

  it('explains a plan limitation instead of implying a defect', () => {
    const view = evidenceState({ evidence_report_id: null, evidence_status: 'not_entitled' });
    expect(view.key).toBe('not_entitled');
    expect(view.action).toBe('upgrade');
    expect(view.hint.toLowerCase()).toContain('plan');
    expect(view.tone).toBe('muted');
  });

  it('treats queued as not-yet-started', () => {
    const view = evidenceState({ evidence_report_id: null, evidence_status: 'pending' });
    expect(view.key).toBe('pending');
    expect(view.action).toBe('none');
  });

  it('falls back to the linked artifact for payloads without a state', () => {
    expect(evidenceState({ evidence_report_id: 'rep-9' }).key).toBe('available');
    expect(evidenceState({ evidence_report_id: null }).key).toBe('unknown');
  });

  it('never claims a report exists when the state says otherwise', () => {
    // A failed regeneration leaves the previous artifact linked. The state is
    // the authority: the operator must see the failure, not a green tick.
    const view = evidenceState({
      evidence_report_id: 'rep-2',
      evidence_status: 'failed',
      evidence_error: 'render failed',
    });
    expect(view.key).toBe('failed');
    expect(view.label).toBe('Failed');
  });

  it('orders available first in the incidents table', () => {
    expect(evidenceRank({ evidence_status: 'available', evidence_report_id: 'r' })).toBe(0);
    expect(evidenceRank({ evidence_status: 'generating' })).toBe(1);
    expect(evidenceRank({ evidence_status: 'pending' })).toBe(2);
    expect(evidenceRank({ evidence_status: 'failed' })).toBe(3);
    expect(evidenceRank({ evidence_status: 'not_entitled' })).toBe(4);
    expect(evidenceRank({ evidence_status: undefined, evidence_report_id: null })).toBe(4);
  });
});
