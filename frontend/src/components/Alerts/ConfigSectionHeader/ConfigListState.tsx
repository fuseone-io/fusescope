import { ReactNode } from 'react';
import { TableCell, TableRow } from 'components/ui/table';

interface ConfigListStateProps {
	colSpan: number;
	icon: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
	testId?: string;
}

/** The empty, no-match or error message spanning a configuration table. */
function ConfigListState({
	colSpan,
	icon,
	title,
	description,
	action,
	testId,
}: ConfigListStateProps): JSX.Element {
	return (
		<TableRow className="tw:hover:bg-transparent">
			<TableCell colSpan={colSpan} className="tw:py-12 tw:whitespace-normal">
				<div
					data-testid={testId}
					className="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:text-center"
				>
					<span className="tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-full tw:bg-surface-sunken tw:text-subtle-foreground tw:[&_svg]:size-5">
						{icon}
					</span>
					<p className="tw:m-0 tw:text-sm tw:font-medium tw:text-foreground">
						{title}
					</p>
					{description && (
						<p className="tw:m-0 tw:max-w-md tw:text-[13px] tw:text-muted-foreground">
							{description}
						</p>
					)}
					{action && <div className="tw:mt-2">{action}</div>}
				</div>
			</TableCell>
		</TableRow>
	);
}

export default ConfigListState;
