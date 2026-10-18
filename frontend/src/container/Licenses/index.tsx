import { useTranslation } from 'react-i18next';
import PageHeader from 'components/PageTemplate/components/PageHeader';
import Panel from 'components/PageTemplate/components/Panel';
import PageTemplate from 'components/PageTemplate/PageTemplate';
import Spinner from 'components/Spinner';
import { KeyRound } from 'lucide-react';
import { useAppContext } from 'providers/App/App';

import ApplyLicenseForm from './ApplyLicenseForm';

function Licenses(): JSX.Element {
	const { t, ready: translationsReady } = useTranslation(['licenses']);
	const { activeLicenseRefetch } = useAppContext();

	if (!translationsReady) {
		return <Spinner tip={t('loading_licenses')} height="90vh" />;
	}

	return (
		<PageTemplate testId="licenses-page">
			<PageHeader icon={<KeyRound />} title="License" />
			<Panel title={t('column_license_key')}>
				<ApplyLicenseForm licenseRefetch={activeLicenseRefetch} />
			</Panel>
		</PageTemplate>
	);
}

export default Licenses;
