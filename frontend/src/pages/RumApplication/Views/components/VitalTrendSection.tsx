import { useState } from 'react';
import type { RumtypesGettableViewDTO } from 'api/generated/services/fuseScope.schemas';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { ApmWindow } from 'lib/apm/window';
import { VitalSummary } from 'lib/rum/metricTypes';
import { VitalName } from 'lib/rum/types';
import { formatVital, vitalThresholdsText } from 'lib/rum/vitals';

import { CHART_VITALS } from '../constants';
import { releaseMarkers, toVitalSummary, vitalPoints } from '../utils';
import SheetSection from './SheetSection';
import VitalTrendChart from './VitalTrendChart';

interface VitalTrendSectionProps {
	detail: RumtypesGettableViewDTO;
	window: ApmWindow;
}

type ChartVital = (typeof CHART_VITALS)[number];

function stepLabel(seconds: number): string {
	if (seconds >= 3600) {
		return `${seconds / 3600} h`;
	}
	return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function VitalTrendSection({
	detail,
	window,
}: VitalTrendSectionProps): JSX.Element {
	const [vital, setVital] = useState<ChartVital>('lcp');
	const summaries = new Map<string, VitalSummary | undefined>(
		(detail.vitals ?? []).flatMap((summary) =>
			summary ? [[summary.name, toVitalSummary(summary)]] : [],
		),
	);
	const p75 = (name: VitalName): string => {
		const summary = summaries.get(name);
		return summary ? formatVital(name, summary.p75) : '—';
	};
	const markers = releaseMarkers(detail.releases, window.start, window.end);

	return (
		<SheetSection
			title="Vitals over time"
			testId="rum-route-vitals"
			aside={
				<SegmentedControl
					label="Vital"
					size="sm"
					value={vital}
					onChange={setVital}
					options={CHART_VITALS.map((name) => ({
						value: name,
						label: `${name.toUpperCase()} ${p75(name)}`,
						testId: `rum-route-vital-${name}`,
					}))}
				/>
			}
		>
			<div className="tw:flex tw:flex-col tw:gap-3 tw:rounded-lg tw:border tw:border-border tw:px-4 tw:py-3">
				<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:text-xs">
					<span className="tw:font-medium">
						{vital.toUpperCase()} p75{' '}
						<span className="tw:font-normal tw:text-muted-foreground">
							· per {stepLabel(detail.series.stepSeconds)}
						</span>
					</span>
					<span className="tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:text-muted-foreground">
						<span className="tw:inline-flex tw:items-center tw:gap-1.5">
							<span aria-hidden="true" className="tw:h-0.5 tw:w-3 tw:bg-primary" />
							p75
						</span>
						<span>{vitalThresholdsText(vital)}</span>
						{markers.length > 0 && (
							<span className="tw:inline-flex tw:items-center tw:gap-1.5">
								<span
									aria-hidden="true"
									className="tw:h-3 tw:border-l tw:border-dashed tw:border-muted-foreground"
								/>
								release first seen
							</span>
						)}
					</span>
				</div>
				<VitalTrendChart
					vital={vital}
					points={vitalPoints(detail.series, vital)}
					releases={markers}
					start={window.start}
					end={window.end}
				/>
			</div>
			<span className="tw:text-xs tw:text-subtle-foreground">
				FCP p75 <span className="tw:tabular-nums">{p75('fcp')}</span> · TTFB p75{' '}
				<span className="tw:tabular-nums">{p75('ttfb')}</span> · from{' '}
				<span className="tw:font-mono">browser.web_vital</span> events of page loads
				on this route
			</span>
		</SheetSection>
	);
}

export default VitalTrendSection;
