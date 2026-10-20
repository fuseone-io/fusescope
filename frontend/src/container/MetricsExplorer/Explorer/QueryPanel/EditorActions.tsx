import { Button } from 'components/ui/button';

/** Reset puts the query back as it was when opened; Done collapses it. */
function EditorActions({
	letter,
	onReset,
	onDone,
}: {
	letter: string;
	onReset: () => void;
	onDone: () => void;
}): JSX.Element {
	return (
		<div className="qp-actions fs-ui">
			<Button
				variant="ghost"
				size="sm"
				data-testid={`query-card-reset-${letter}`}
				onClick={onReset}
			>
				Reset
			</Button>
			<Button
				variant="outline"
				size="sm"
				data-testid={`query-card-done-${letter}`}
				onClick={onDone}
			>
				Done
			</Button>
		</div>
	);
}

export default EditorActions;
