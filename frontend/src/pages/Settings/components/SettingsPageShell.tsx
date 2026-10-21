import { ReactNode } from 'react';
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

/** The settings content column: compact header, then panels, tables or forms. */
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
				'tw:mx-0 tw:gap-4 tw:md:px-6 tw:md:pt-6 tw:md:pb-10',
				narrow ? 'tw:max-w-[960px]' : 'tw:max-w-[1280px]',
			)}
		>
			<div
				data-testid="settings-page-header"
				className="fs-ui tw:flex tw:flex-wrap tw:items-end tw:justify-between tw:gap-3 tw:font-sans tw:text-foreground"
			>
				<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
					<div className="tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-2">
						<h1 className="tw:min-w-0 tw:truncate tw:text-xl tw:leading-tight tw:font-semibold tw:tracking-[-0.01em]">
							{title}
						</h1>
						{badges}
					</div>
					{description && (
						<p className="tw:text-[13px] tw:text-muted-foreground">{description}</p>
					)}
				</div>
				{actions && (
					<div
						data-testid="page-header-actions"
						className="tw:flex tw:flex-wrap tw:items-center tw:gap-2"
					>
						{actions}
					</div>
				)}
			</div>
			{children}
		</PageTemplate>
	);
}

export default SettingsPageShell;
