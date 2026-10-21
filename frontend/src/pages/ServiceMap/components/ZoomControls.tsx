import { Button } from 'components/ui/button';
import { Maximize, Minus, Plus } from 'lucide-react';

interface ZoomControlsProps {
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFit: () => void;
}

function ZoomControls({
	onZoomIn,
	onZoomOut,
	onFit,
}: ZoomControlsProps): JSX.Element {
	return (
		<div className="tw:absolute tw:right-3 tw:bottom-3 tw:z-10 tw:flex tw:flex-col tw:gap-0.5 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:p-0.5">
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Zoom in"
				onClick={onZoomIn}
			>
				<Plus aria-hidden="true" />
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Zoom out"
				onClick={onZoomOut}
			>
				<Minus aria-hidden="true" />
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Fit to screen"
				data-testid="service-map-fit"
				onClick={onFit}
			>
				<Maximize aria-hidden="true" />
			</Button>
		</div>
	);
}

export default ZoomControls;
