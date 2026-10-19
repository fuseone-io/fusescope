import { ILog } from 'types/api/logs/log';

import { LOG_HIGHLIGHTS } from './config';
import styles from './LogHighlights.module.scss';

interface LogHighlightsProps {
	log: ILog;
}

function LogHighlights({ log }: LogHighlightsProps): JSX.Element | null {
	const fields = LOG_HIGHLIGHTS.map((field) => ({
		key: field.key,
		label: field.label,
		value: field.render(log),
	})).filter((field) => field.value != null);

	if (fields.length === 0) {
		return null;
	}

	return (
		<dl className={styles.highlights} data-testid="log-details-highlights">
			{fields.map((field) => (
				<div key={field.key} className={styles.option}>
					<dt className={styles.optionLabel}>{field.label}</dt>
					<dd className={styles.optionValue}>{field.value}</dd>
				</div>
			))}
		</dl>
	);
}

export default LogHighlights;
