import { Container, Eyebrow } from '@/components/site/primitives';
import { SceneLinks } from './scenes';
import { PUBLIC_ROUTES } from '@/lib/routes';

/**
 * 08 · Agencies, as one topology instead of a pitch.
 *
 * The diagram is the honest version of the offer: one RELIASTRA account
 * observes up to 25 external endpoints, and an agency spends those across
 * client estates. There is no separate agency tier, no per-seat pricing, and
 * no invented multi-tenant console, so the scene does not invent one either.
 */
const CLIENTS: { name: string; deps: string[] }[] = [
  { name: 'client a · storefront', deps: ['payments', 'identity', 'cdn'] },
  { name: 'client b · saas product', deps: ['database', 'messaging', 'model api'] },
  { name: 'client c · internal tools', deps: ['identity', 'storage', 'dns'] },
];

export function AgenciesScene() {
  return (
    <section
      id="agencies"
      aria-labelledby="agencies-title"
      className="border-t border-[var(--ob-line)] bg-[var(--ob-void)]"
    >
      <Container className="py-24 md:py-32 lg:py-36">
        <div className="flex flex-col gap-9 pb-14 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-7">
            <Eyebrow index="08">Agencies</Eyebrow>
            <h2 id="agencies-title" className="ob-scene-title max-w-[14ch]">
              Dependencies across every client.
            </h2>
          </div>
          <p className="ob-lede max-w-[40ch] lg:pb-1 lg:text-right">
            Every client estate watched from the same account and the same
            observation point, with evidence you can hand to the client when
            a vendor costs them money.
          </p>
        </div>

        <div>
          <div className="ob-tree-hub">
            <span className="ob-label ob-label-strong">Reliastra account</span>
            <span className="ob-label">
              agency · one plan · up to 25 observed endpoints
            </span>
          </div>
          <div className="ob-tree">
            {CLIENTS.map((client) => (
              <div key={client.name} className="ob-tree-lane">
                <span className="ob-label">{client.name}</span>
                <ul className="ob-tree-nodes">
                  {client.deps.map((dep) => (
                    <li key={dep}>
                      <p className="ob-tree-name">{dep}</p>
                      <p className="ob-tree-deps">observed endpoint</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="ob-label mt-3">
            Illustrative estate · any HTTP endpoint can be observed
          </p>
        </div>

        <div className="mt-10">
          <SceneLinks
            items={[
              { href: PUBLIC_ROUTES.agencies, label: 'Reliastra for agencies' },
              { href: PUBLIC_ROUTES.pricing, label: 'What the plan covers' },
            ]}
          />
        </div>
      </Container>
    </section>
  );
}
