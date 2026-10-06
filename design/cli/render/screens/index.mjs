// The screen catalogue. `build.mjs` renders each entry to a PNG mockup and to
// a run-list JSON that the ANSI demo replays in a real terminal.
import { helpScreen, loginScreen, doctorScreen } from './core.mjs';
import { depsListScreen, checksRecentScreen, obsShowScreen } from './monitor.mjs';
import { incidentScreen, verifyPassScreen, verifyFailScreen } from './verdict.mjs';
import { errorsScreen, fidelityFull, fidelityPlain, fidelityJson, designSheet } from './states.mjs';
import { firstRunScreen, homeScreen } from './moments.mjs';

export const SCREENS = [
  { id: '01-root-help', title: 'reliastra --help', screens: () => [{ screen: helpScreen() }] },
  { id: '02-login', title: 'reliastra login', screens: () => [{ screen: loginScreen() }] },
  { id: '03-doctor', title: 'reliastra doctor', screens: () => [{ screen: doctorScreen() }] },
  { id: '04-deps-list', title: 'reliastra deps list', screens: () => [{ screen: depsListScreen() }] },
  { id: '05-checks-recent', title: 'reliastra checks recent', screens: () => [{ screen: checksRecentScreen() }] },
  { id: '06-incident-show', title: 'reliastra incidents show', screens: () => [{ screen: incidentScreen() }] },
  { id: '07-verify-pass', title: 'reliastra verify (holds)', screens: () => [{ screen: verifyPassScreen() }] },
  { id: '08-verify-mismatch', title: 'reliastra verify (does not hold)', screens: () => [{ screen: verifyFailScreen() }] },
  { id: '09-obs-show', title: 'reliastra obs show', screens: () => [{ screen: obsShowScreen() }] },
  { id: '10-errors', title: 'failure taxonomy', screens: () => [{ screen: errorsScreen() }] },
  {
    id: '11-fidelity-triptych',
    title: 'one screen, three fidelities',
    compose: true,
    screens: () => [
      { screen: fidelityFull(), caption: 'full · stdout is a TTY · truecolor' },
      { screen: fidelityPlain(), caption: 'plain · piped, redirected, NO_COLOR, CI — today’s CLI, unchanged' },
      { screen: fidelityJson(), caption: '--json · the API’s own shape, keys alphabetical, no chrome' },
    ],
  },
  { id: '12-design-system', title: 'design system sheet', screens: () => [{ screen: designSheet() }] },
  { id: '13-light-incident', title: 'light theme parity', screens: () => [{ screen: incidentScreen('light') }] },
  { id: '14-first-run', title: 'first run, no config', screens: () => [{ screen: firstRunScreen() }] },
  { id: '15-home', title: 'bare invocation, signed in', screens: () => [{ screen: homeScreen() }] },
];
