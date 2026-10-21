import type { ReactNode } from 'react';
import { Switch } from '@signozhq/ui/switch';

import ChangedDot from '../ChangedDot/ChangedDot';

import styles from './ConfigSwitch.module.scss';

interface ConfigSwitchProps {
	testId: string;
	title: string;
	description?: string;
	/** Kept for callers; the switch row draws no sketch. */
	sketch?: ReactNode;
	changed?: boolean;
	value: boolean;
	onChange: (checked: boolean) => void;
}

function ConfigSwitch({
	testId,
	title,
	description,
	changed,
	value,
	onChange,
}: ConfigSwitchProps): JSX.Element {
	return (
		<div className={styles.card}>
			<Switch
				color="primary"
				textPlacement="right"
				testId={testId}
				value={value}
				onChange={onChange}
			/>
			<div className={styles.text}>
				<span className={styles.title}>
					{title}
					{changed && <ChangedDot />}
				</span>
				{description && <span className={styles.description}>{description}</span>}
			</div>
		</div>
	);
}

export default ConfigSwitch;
