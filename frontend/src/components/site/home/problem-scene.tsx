import { Container, Eyebrow } from '@/components/site/primitives';
import { MediaScene } from './scenes';

/**
 * 01 · The problem, rendered as an infrastructure topology.
 *
 * The chain between your user and the third-party services your application
 * actually runs on, with the trust boundary drawn as a dashed rule. Nothing
 * below that boundary is visible to your own monitoring, and everything
 * above the second boundary is invisible to RELIASTRA too: the diagram owns
 * both limits instead of implying a vantage point that does not exist.
 *
 * The nodes are structural, not status readings, so they carry no state
 * colour. The imagery is a generated patch-panel scene; the scrims keep the
 * left column fully legible.
 */

type ChainNode = {
  name: string;
  meta: string;
  zone: 'inside' | 'outside';
};

const ABOVE: ChainNode[] = [
  { name: 'user', meta: 'browser · client', zone: 'inside' },
  { name: 'application', meta: 'your service', zone: 'inside' },
  { name: 'your infrastructure', meta: 'hosts · containers · databases', zone: 'inside' },
];

const BELOW: ChainNode[] = [
  { name: 'edge / network', meta: 'cloudflare · fastly', zone: 'outside' },
  { name: 'payments', meta: 'stripe · adyen', zone: 'outside' },
  { name: 'identity', meta: 'auth0 · okta · clerk', zone: 'outside' },
  { name: 'model apis', meta: 'openai · anthropic', zone: 'outside' },
  { name: 'messaging · data', meta: 'twilio · managed postgres · dns', zone: 'outside' },
];

function Node({ node, last }: { node: ChainNode; last: boolean }) {
  return (
    <li className="ob-chain-node" data-zone={node.zone}>
      <span className="ob-chain-rail" aria-hidden>
        <span className="ob-chain-dot" />
        {!last && <span className="ob-chain-line" />}
      </span>
      <div className="ob-chain-body">
        <p className="ob-chain-name">{node.name}</p>
        <p className="ob-chain-meta">{node.meta}</p>
      </div>
    </li>
  );
}

export function ProblemScene() {
  return (
    <MediaScene
      id="problem"
      src="/media/scene-edge.webp"
      srcSet="/media/scene-edge-sm.webp 1366w, /media/scene-edge.webp 1672w"
      alt="Fibre patch leads seated in a dark switch panel"
      labelledBy="problem-title"
    >
      <div className="grid gap-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-20">
        <div className="flex flex-col gap-7">
          <Eyebrow index="01">The problem</Eyebrow>
          <h2 id="problem-title" className="ob-scene-title max-w-[13ch]">
            Your monitoring stops at your edge.
          </h2>
          <p className="ob-lede max-w-[44ch]">
            Your infrastructure includes services you do not operate. Your APM
            sees your own errors, not their cause. The vendor status page is
            written by the vendor.
          </p>
          <p className="ob-body max-w-[52ch]">
            Between those two facts is the only record that settles the
            argument: what the dependency actually did, measured continuously
            by someone with no stake in either answer.
          </p>
        </div>

        <div className="lg:pt-2">
          <p className="ob-label mb-6">A request path, with its blind spots</p>
          <ol className="ob-chain">
            {ABOVE.map((node, i) => (
              <Node key={node.name} node={node} last={i === ABOVE.length - 1} />
            ))}
            <li className="ob-chain-gate" aria-label="Your network edge: your monitoring ends here">
              <span className="ob-chain-rail" aria-hidden>
                <span className="ob-chain-line" style={{ minHeight: 8 }} />
              </span>
              <p className="ob-chain-gate-body">
                your network edge · your monitoring ends here
              </p>
            </li>
            {BELOW.map((node, i) => (
              <Node key={node.name} node={node} last={i === BELOW.length - 1} />
            ))}
            <li className="ob-chain-gate" aria-label="The vendor's internals: no outside observer sees here">
              <span className="ob-chain-rail" aria-hidden>
                <span className="ob-chain-line" style={{ minHeight: 8, background: 'transparent' }} />
              </span>
              <p className="ob-chain-gate-body">
                vendor internals · no outside observer sees here
              </p>
            </li>
          </ol>
          <p className="ob-small mt-4 max-w-[46ch]">
            Service classes are illustrative. Any HTTP endpoint can be
            observed, and naming a service implies no relationship with it.
          </p>
        </div>
      </div>
    </MediaScene>
  );
}
