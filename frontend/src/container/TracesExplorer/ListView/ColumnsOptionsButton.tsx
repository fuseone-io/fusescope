import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import FieldsSelector from 'components/FieldsSelector';
import { Button } from 'components/ui/button';
import { OptionsMenuConfig } from 'container/OptionsMenu/types';
import { SlidersHorizontal } from 'lucide-react';
import { DataSource } from 'types/common/queryBuilder';

interface ColumnsOptionsButtonProps {
	fieldsSelector: NonNullable<OptionsMenuConfig['fieldsSelector']>;
}

function ColumnsOptionsButton({
	fieldsSelector,
}: ColumnsOptionsButtonProps): JSX.Element {
	const { t } = useTranslation(['trace']);
	const [isOpen, setIsOpen] = useState(false);

	return (
		<>
			<Button
				variant="ghost"
				size="icon-sm"
				title="Columns and options"
				data-testid="traces-list-columns-options"
				className="fs-ui tw:text-muted-foreground"
				onClick={(): void => setIsOpen(true)}
			>
				<SlidersHorizontal />
				<span className="tw:sr-only">{t('options_menu.options')}</span>
			</Button>
			<FieldsSelector
				isOpen={isOpen}
				title="Edit columns"
				fields={fieldsSelector.value}
				onFieldsChange={fieldsSelector.onFieldsChange}
				onClose={(): void => setIsOpen(false)}
				signal={DataSource.TRACES}
			/>
		</>
	);
}

export default ColumnsOptionsButton;
