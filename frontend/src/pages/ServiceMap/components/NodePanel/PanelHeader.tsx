import { ReactNode } from 'react';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import ServiceKindIcon from 'components/ServiceKindIcon/ServiceKindIcon';

import { INFERRED_FROM_LABEL } from '../../constants';
import { MapNode } from '../../types';
import { HEALTH_LABEL, HEALTH_TONE, nodeHealth } from '../../utils/health';

interface PanelHeaderProps {
	node: MapNode;
	links: ReactNode;
}

/** Kind, language and health of the node, the inference note and its links. */
function PanelHeader({ node, links }: PanelHeaderProps): JSX.Element {
	const health = nodeHealth(node.errorRate, node.p99);
	const subtitle = [
		node.inferred ? `${node.kind.label} · no SDK` : node.kind.label,
		node.language,
	]
		.filter(Boolean)
		.join(' · ');
	return (
		<div className="tw:flex tw:flex-col tw:gap-2.5 tw:p-4">
			<div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2.5">
				<ServiceKindIcon kind={node.kind} size="md" />
				<div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
					<h2
						data-testid="service-map-node-name"
						title={node.id}
						className="tw:truncate tw:font-mono tw:text-[15px] tw:font-semibold"
					>
						{node.id}
					</h2>
					<span className="tw:text-xs tw:text-muted-foreground">{subtitle}</span>
				</div>
				<StatusBadge
					tone={HEALTH_TONE[health]}
					dot
					testId="service-map-node-health"
				>
					{HEALTH_LABEL[health]}
				</StatusBadge>
			</div>
			{node.inferredFrom && (
				<p
					data-testid="service-map-inferred-note"
					className="tw:rounded-lg tw:bg-surface-sunken tw:px-2.5 tw:py-2 tw:text-xs tw:text-muted-foreground"
				>
					No SDK runs here — inferred from the CLIENT spans of its callers (
					<span className="tw:font-mono">
						{INFERRED_FROM_LABEL[node.inferredFrom.attribute]} ={' '}
						{node.inferredFrom.value}
					</span>
					).
				</p>
			)}
			<div className="tw:flex tw:flex-wrap tw:gap-1.5">{links}</div>
		</div>
	);
}

export default PanelHeader;
