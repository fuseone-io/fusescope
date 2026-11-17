import { useTranslation } from 'react-i18next';
import LabelChipsInput from 'components/Alerts/LabelChipsInput/LabelChipsInput';
import { Labels } from 'types/api/alerts/def';

import { flattenLabels, hiddenLabels, prepareLabels } from './utils';

interface LabelSelectProps {
	onSetLabels: (q: Labels) => void;
	initialValues: Labels | undefined;
}

function LabelSelect({
	onSetLabels,
	initialValues,
}: LabelSelectProps): JSX.Element {
	const { t } = useTranslation('alerts');
	const validateKey = (key: string): string | null =>
		hiddenLabels.includes(key) ? t('labels_reserved_key', { key }) : null;
	const visible = Object.fromEntries(
		flattenLabels(initialValues ?? {}).map((rec) => [rec.key, rec.value]),
	);

	return (
		<LabelChipsInput
			labels={visible}
			validateKey={validateKey}
			onChange={(next): void =>
				onSetLabels(
					prepareLabels(
						Object.entries(next).map(([key, value]) => ({ key, value: value ?? '' })),
						initialValues,
					),
				)
			}
		/>
	);
}

export default LabelSelect;
