import { cn } from 'lib/utils';

import { StatusTone } from '../types';
import StatusBadge from './StatusBadge';

export function httpStatusTone(statusCode: number): StatusTone {
	if (statusCode >= 500) {
		return 'error';
	}
	if (statusCode >= 400) {
		return 'warning';
	}
	if (statusCode >= 200 && statusCode < 300) {
		return 'success';
	}
	if (statusCode >= 300 && statusCode < 400) {
		return 'info';
	}
	return 'neutral';
}

interface HttpStatusCodeBadgeProps {
	statusCode: string | number;
	className?: string;
	testId?: string;
}

/** An HTTP status code as a tone badge; renders nothing for a missing code. */
function HttpStatusCodeBadge({
	statusCode,
	className,
	testId,
}: HttpStatusCodeBadgeProps): JSX.Element | null {
	const code = Number(statusCode);
	if (!code || code <= 0) {
		return null;
	}

	return (
		<StatusBadge
			tone={httpStatusTone(code)}
			testId={testId}
			className={cn(
				'tw:h-[18px] tw:px-1.5 tw:font-mono tw:text-[11px]',
				className,
			)}
		>
			{statusCode}
		</StatusBadge>
	);
}

export default HttpStatusCodeBadge;
