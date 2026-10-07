import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { InfrastructureGlobe } from '@/components/observatory/infrastructure-globe';

/**
 * The globe's markup contract.
 *
 * The rotation itself is time-based browser behaviour - `advanceLongitude` in
 * `lib/__tests__/infrastructure-visualization.test.ts` covers the maths, and the
 * animation loop is driven through `requestAnimationFrame`, which no server
 * render executes. What can be asserted here is the part a reader or an
 * assistive technology sees: that auto-rotation is the default state, that
 * there is a mechanism to stop it (WCAG 2.2.2 - motion that starts on its own
 * must be stoppable), and that the decorative backdrop offers no controls.
 */
const render = (props: Partial<Parameters<typeof InfrastructureGlobe>[0]> = {}) =>
  renderToStaticMarkup(<InfrastructureGlobe mode="observatory" {...props} />);

describe('infrastructure globe controls', () => {
  it('reports that it is rotating, not that it is waiting for a drag', () => {
    const html = render();
    expect(html).toContain('Rotating · drag to steer');
    expect(html).not.toContain('Drag to rotate');
  });

  it('offers a pause control for motion that started on its own', () => {
    const html = render();
    expect(html).toContain('aria-label="Pause rotation"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Rotate globe west"');
    expect(html).toContain('aria-label="Rotate globe east"');
  });

  it('keeps the manual angle controls reachable by keyboard', () => {
    // Buttons, not a canvas-only gesture: the arrows are the way to turn the
    // globe without a pointer, and they remain the only control a reader has
    // when the rotation is stopped.
    expect(render().match(/<button/g)?.length).toBe(3);
  });

  it('announces the continuous motion to a screen reader', () => {
    expect(render()).toMatch(/rotates continuously and can be paused/i);
  });

  it('renders the decorative backdrop without any controls', () => {
    const html = render({ mode: 'login', interactive: false });
    expect(html).not.toContain('<button');
    expect(html).not.toContain('aria-label="Pause rotation"');
  });
});
