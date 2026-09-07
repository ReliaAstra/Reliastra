import { cn } from '@/lib/utils';
import type { RegionInfo } from '@/lib/observatory/regions';
import type { ObservedState } from '@/lib/observatory/format';

/**
 * Observation topology.
 *
 * This is a coordinate plot, not a map illustration. There is no landmass
 * artwork, no glowing arcs and no spinning globe, because none of those carry
 * information: what a reader needs to know is *where the observations
 * originate from*, and that is a set of published coordinates on a graticule.
 * Every mark is a region the API actually returned for this dependency, drawn
 * at its real latitude and longitude in equirectangular projection.
 *
 * Regions whose code we cannot place are never plotted at a guessed position -
 * they are listed in the table beside this plot and counted in the caption.
 *
 * Hidden below `md`: at 375px the graticule type would be four pixels tall,
 * and the region table carries the same facts in a form that stays readable.
 */
export function RegionPlot({
  regions,
  className,
}: {
  regions: Array<{ info: RegionInfo; state: ObservedState; label: string }>;
  className?: string;
}) {
  const plotted = regions.filter((r) => r.info.lat !== null && r.info.lon !== null);
  if (!plotted.length) return null;

  // Latitude is clipped to the band every published cloud region falls inside.
  // A full -90..90 plot is two thirds empty ocean and ice, which pushes the
  // marks into a strip so small they stop being readable. The band is stated
  // in the caption so the projection is not silently misrepresented.
  const LAT_TOP = 76;
  const LAT_BOTTOM = -56;
  const W = 720;
  const H = Math.round((W / 360) * (LAT_TOP - LAT_BOTTOM));
  const x = (lon: number) => ((lon + 180) / 360) * W;
  const y = (lat: number) => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H;

  const lonLines = [-150, -120, -90, -60, -30, 30, 60, 90, 120, 150];
  const latLines = [-30, 30, 60];

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full border border-[var(--ob-line)] bg-[var(--ob-base)]"
        role="img"
        aria-label={`Observation origins plotted by coordinate: ${plotted
          .map((r) => `${r.info.code} at ${r.info.lat}, ${r.info.lon}`)
          .join('; ')}.`}
      >
        {lonLines.map((lon) => (
          <line key={`lon-${lon}`} x1={x(lon)} x2={x(lon)} y1={0} y2={H} className="obs-geo-grid" />
        ))}
        {latLines.map((lat) => (
          <line key={`lat-${lat}`} x1={0} x2={W} y1={y(lat)} y2={y(lat)} className="obs-geo-grid" />
        ))}
        {/* Equator and prime meridian, stated because they orient the plot. */}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="obs-geo-axis" />
        <line x1={x(0)} x2={x(0)} y1={0} y2={H} className="obs-geo-axis" />
        <text x={6} y={y(0) - 6} className="obs-geo-label">
          0° EQUATOR
        </text>
        <text x={x(0) + 6} y={14} className="obs-geo-label">
          0° MERIDIAN
        </text>
        <text x={6} y={y(60) - 6} className="obs-geo-label">
          60° N
        </text>
        <text x={6} y={y(30) - 6} className="obs-geo-label">
          30° N
        </text>
        <text x={6} y={y(-30) - 6} className="obs-geo-label">
          30° S
        </text>

        {plotted.map((r) => {
          const cx = x(r.info.lon!);
          const cy = y(r.info.lat!);
          const colour =
            r.state === 'healthy'
              ? 'var(--ob-healthy)'
              : r.state === 'degraded'
                ? 'var(--ob-degraded)'
                : r.state === 'critical'
                  ? 'var(--ob-critical)'
                  : 'var(--ob-text-4)';
          const flip = cx > W - 150;
          return (
            <g key={r.info.code}>
              <line x1={cx - 6} x2={cx + 6} y1={cy} y2={cy} stroke={colour} strokeWidth={1} />
              <line x1={cx} x2={cx} y1={cy - 6} y2={cy + 6} stroke={colour} strokeWidth={1} />
              <rect x={cx - 2} y={cy - 2} width={4} height={4} fill={colour} />
              <text
                x={flip ? cx - 10 : cx + 10}
                y={cy - 8}
                textAnchor={flip ? 'end' : 'start'}
                className="obs-geo-label"
                style={{ fill: 'var(--ob-text)' }}
              >
                {r.info.code}
              </text>
              <text
                x={flip ? cx - 10 : cx + 10}
                y={cy + 4}
                textAnchor={flip ? 'end' : 'start'}
                className="obs-geo-label"
              >
                {r.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="ob-small max-w-[74ch]">
        Equirectangular projection, {LAT_TOP}° N to {Math.abs(LAT_BOTTOM)}° S. {plotted.length} of {regions.length} observation region
        {regions.length === 1 ? '' : 's'} could be placed from its published coordinates;
        {regions.length - plotted.length > 0
          ? ` ${regions.length - plotted.length} region code${
              regions.length - plotted.length === 1 ? ' is' : 's are'
            } listed in the table without a coordinate rather than plotted at a guessed position.`
          : ' all regions returned by the API are shown.'}
      </p>
    </div>
  );
}
