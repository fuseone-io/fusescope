import { useTranslation } from 'react-i18next';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Plus } from 'lucide-react';

import ClearLabelsDialog from './ClearLabelsDialog';
import LabelChip from './LabelChip';
import { LabelChipsInputProps } from './types';
import { useLabelDraft } from './useLabelDraft';

const FIELD =
	'tw:h-8 tw:min-w-0 tw:flex-1 tw:bg-surface-raised tw:font-mono tw:text-xs tw:dark:bg-surface-raised';
const ERROR_ID = 'alert-labels-error';

function LabelChipsInput(props: LabelChipsInputProps): JSX.Element {
	const { labels, onChange } = props;
	const { t } = useTranslation('alerts');
	const draft = useLabelDraft(props);
	const entries = Object.entries(labels);

	const remove = (key: string): void => {
		const next = { ...labels };
		delete next[key];
		onChange(next);
	};

	return (
		<div className="fs-ui tw:flex tw:w-full tw:flex-col tw:gap-2 tw:font-sans tw:text-foreground">
			{entries.length > 0 && (
				<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
					{entries.map(([key, value]) => (
						<LabelChip
							key={key}
							labelKey={key}
							value={value ?? ''}
							onRemove={remove}
						/>
					))}
					<ClearLabelsDialog onConfirm={(): void => onChange({})} />
				</div>
			)}
			<div className="tw:flex tw:flex-col tw:items-stretch tw:gap-2 tw:sm:flex-row tw:sm:items-center">
				<Input
					ref={draft.keyRef}
					aria-label={t('labels_key_label')}
					aria-invalid={draft.error ? true : undefined}
					aria-describedby={draft.error ? ERROR_ID : undefined}
					placeholder={t('labels_key_placeholder')}
					value={draft.key}
					onChange={draft.onKeyChange}
					onKeyDown={draft.onKeyKeyDown}
					data-testid="alert-labels-key-input"
					className={FIELD}
				/>
				<span
					aria-hidden="true"
					className="tw:hidden tw:text-muted-foreground tw:sm:inline"
				>
					:
				</span>
				<Input
					ref={draft.valueRef}
					aria-label={t('labels_value_label')}
					placeholder={t('labels_value_placeholder')}
					value={draft.value}
					onChange={draft.onValueChange}
					onKeyDown={draft.onValueKeyDown}
					data-testid="alert-labels-value-input"
					className={FIELD}
				/>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="tw:self-start"
					disabled={!draft.canAdd}
					onClick={draft.commit}
					data-testid="alert-labels-add-button"
				>
					<Plus aria-hidden="true" />
					{t('labels_add')}
				</Button>
			</div>
			{draft.error && (
				<p
					id={ERROR_ID}
					role="alert"
					className="tw:m-0 tw:text-xs tw:text-severity-error"
				>
					{draft.error}
				</p>
			)}
		</div>
	);
}

export default LabelChipsInput;
