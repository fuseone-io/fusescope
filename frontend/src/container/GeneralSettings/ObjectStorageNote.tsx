import { useTranslation } from 'react-i18next';
import { fuseScopeDocsUrl } from 'constants/docs';
import { Cloud } from 'lucide-react';

function ObjectStorageNote({ available }: ObjectStorageNoteProps): JSX.Element {
	const { t } = useTranslation(['generalSettings']);

	return (
		<div
			data-testid={
				available
					? 'retention-object-storage-note'
					: 'retention-object-storage-hint'
			}
			className="fs-ui tw:flex tw:items-start tw:gap-2 tw:border-t tw:border-border tw:px-5 tw:py-3 tw:font-sans tw:text-xs tw:text-muted-foreground tw:[&_svg]:mt-px tw:[&_svg]:size-3.5 tw:[&_svg]:shrink-0"
		>
			<Cloud />
			{available ? (
				<p className="tw:m-0">{t('object_storage_note')}</p>
			) : (
				<p className="tw:m-0">
					{t('object_storage_missing')}{' '}
					<a
						href={fuseScopeDocsUrl('/administration/retention/#cold-storage')}
						target="_blank"
						rel="noopener noreferrer"
						className="tw:font-medium tw:text-foreground! tw:underline! tw:underline-offset-2"
					>
						{t('object_storage_setup')}
					</a>
				</p>
			)}
		</div>
	);
}

interface ObjectStorageNoteProps {
	available: boolean;
}

export default ObjectStorageNote;
