import { DropUploadStatus } from './types';

interface UploadOutcomeProps {
	status: DropUploadStatus;
}

function UploadOutcome({ status }: UploadOutcomeProps): JSX.Element | null {
	if (status.state === 'idle') {
		return null;
	}
	if (status.state === 'invalid') {
		return (
			<span role="alert" className="tw:text-xs tw:text-error">
				{status.message}
			</span>
		);
	}
	if (status.state === 'uploading') {
		return (
			<span aria-live="polite" className="tw:text-xs tw:text-muted-foreground">
				{`Uploading ${status.count} ${status.count === 1 ? 'file' : 'files'}…`}
			</span>
		);
	}
	const { uploaded, rejected } = status.result;
	return (
		<div
			aria-live="polite"
			data-testid="rum-sourcemaps-upload-result"
			className="tw:flex tw:flex-col tw:gap-1 tw:text-xs"
		>
			{uploaded > 0 && (
				<span className="tw:text-success-ink">
					{`Uploaded ${uploaded} ${uploaded === 1 ? 'file' : 'files'} to release ${status.release}.`}
				</span>
			)}
			{rejected.map((item) => (
				<span key={item.path} className="tw:text-error">
					<span className="tw:font-mono">{item.path}</span>: {item.reason}
				</span>
			))}
		</div>
	);
}

export default UploadOutcome;
