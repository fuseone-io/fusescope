import { ReactNode } from 'react';
import PageHeader from 'components/PageTemplate/components/PageHeader';
import PageTemplate from 'components/PageTemplate/PageTemplate';
import { cn } from 'lib/utils';

interface SettingsPageShellProps {
	title: ReactNode;
	description?: ReactNode;
	badges?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	testId?: string;
	/** Forms read better in a narrower column than tables. */
	narrow?: boolean;
}

/** The settings content column: page header, then panels, tables or forms. */
function SettingsPageShell({
	title,
	description,
	badges,
	actions,
	children,
	testId,
	narrow = false,
}: SettingsPageShellProps): JSX.Element {
	return (
		<PageTemplate
			testId={testId}
			className={cn(
				'tw:mx-0 tw:gap-4 tw:md:px-8 tw:md:pt-6 tw:md:pb-10',
				narrow ? 'tw:max-w-[960px]' : 'tw:max-w-[1280px]',
			)}
		>
			<PageHeader
				title={title}
				description={description}
				badges={badges}
				actions={actions}
				testId="settings-page-header"
			/>
			{children}
		</PageTemplate>
	);
}

export default SettingsPageShell;
