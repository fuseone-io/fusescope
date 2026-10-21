import { ChangeEvent, ReactNode, useCallback, useMemo } from 'react';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { Button } from 'components/ui/button';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from 'components/ui/sheet';
import { Switch } from 'components/ui/switch';
import { Minus, Plus } from 'lucide-react';
import {
	hideColumn,
	showColumn,
	TableColumnDef,
	useColumnOrder,
	useHiddenColumnIds,
} from 'components/TanStackTableView';
import { InfraMonitoringEntity } from '../constants';

import {
	FontSize,
	useInfraMonitoringTablePreferencesStore,
} from './useInfraMonitoringTablePreferencesStore';
import { useLogEventForColumnCustomized } from './useLogEventForColumnCustomized';
import { sortByColumnOrder } from './utils';

import styles from './K8sOptionsSidePanel.module.scss';

type ColumnPickerItem = {
	id: string;
	label: ReactNode;
	canBeHidden: boolean;
	visibilityBehavior:
		| 'hidden-on-expand'
		| 'hidden-on-collapse'
		| 'always-visible';
};

function renderHeader(header: string | (() => ReactNode)): ReactNode {
	return typeof header === 'function' ? header() : header;
}

function toColumnPickerItems<T>(
	columns: TableColumnDef<T>[],
): ColumnPickerItem[] {
	return columns.map((col) => ({
		id: col.id,
		label: renderHeader(col.header),
		canBeHidden: col.canBeHidden !== false && col.enableRemove !== false,
		visibilityBehavior: col.visibilityBehavior ?? 'always-visible',
	}));
}

const FONT_SIZE_OPTIONS: { value: FontSize; label: string; testId: string }[] =
	[
		{ value: 'small', label: 'Small', testId: 'font-size-small' },
		{ value: 'medium', label: 'Medium', testId: 'font-size-medium' },
		{ value: 'large', label: 'Large', testId: 'font-size-large' },
	];

function SectionTitle({ children }: { children: ReactNode }): JSX.Element {
	return (
		<h3 className="tw:px-5 tw:pt-4 tw:pb-2 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-subtle-foreground tw:uppercase">
			{children}
		</h3>
	);
}

function K8sOptionsSidePanel<TData>({
	open,
	onClose,
	columns,
	storageKey,
	entity,
}: {
	open: boolean;
	onClose: () => void;
	columns: TableColumnDef<TData>[];
	storageKey: string;
	entity: InfraMonitoringEntity;
}): JSX.Element {
	const columnPickerItems = useMemo(
		() => toColumnPickerItems(columns),
		[columns],
	);
	const hiddenColumnIds = useHiddenColumnIds(storageKey);
	const columnOrder = useColumnOrder(storageKey);

	const lineClamp = useInfraMonitoringTablePreferencesStore((s) => s.lineClamp);
	const fontSize = useInfraMonitoringTablePreferencesStore((s) => s.fontSize);
	const increaseLineClamp = useInfraMonitoringTablePreferencesStore(
		(s) => s.increaseLineClamp,
	);
	const decreaseLineClamp = useInfraMonitoringTablePreferencesStore(
		(s) => s.decreaseLineClamp,
	);
	const setLineClamp = useInfraMonitoringTablePreferencesStore(
		(s) => s.setLineClamp,
	);
	const setFontSize = useInfraMonitoringTablePreferencesStore(
		(s) => s.setFontSize,
	);

	const visibleColumnItems = useMemo(
		() =>
			columnPickerItems.filter(
				(column) => column.visibilityBehavior !== 'hidden-on-collapse',
			),
		[columnPickerItems],
	);

	const orderedVisibleColumnItems = useMemo(
		() => sortByColumnOrder(visibleColumnItems, (col) => col.id, columnOrder),
		[visibleColumnItems, columnOrder],
	);

	useLogEventForColumnCustomized({
		entity,
		source: 'list',
		storageKey,
		columns,
	});

	const handleToggleColumn = (columnId: string, checked: boolean): void => {
		if (checked) {
			showColumn(storageKey, columnId);
		} else {
			hideColumn(storageKey, columnId);
		}
	};

	const handleLineClampChange = useCallback(
		(value: ChangeEvent<HTMLInputElement>): void => {
			const valueAsNumber = value.target.valueAsNumber;

			if (value && Number.isInteger(valueAsNumber)) {
				setLineClamp(valueAsNumber);
			}
		},
		[setLineClamp],
	);

	return (
		<Sheet
			open={open}
			onOpenChange={(isOpen): void => {
				if (!isOpen) {
					onClose();
				}
			}}
		>
			<SheetContent
				side="right"
				onOpenAutoFocus={(e): void => e.preventDefault()}
				className="tw:w-[360px] tw:max-w-full tw:gap-0 tw:overflow-y-auto tw:border-border tw:bg-surface-raised tw:p-0 tw:font-sans tw:sm:max-w-[360px]"
			>
				<SheetHeader className="tw:border-b tw:border-border tw:px-5 tw:py-4">
					<SheetTitle className="tw:text-base">Table options</SheetTitle>
					<SheetDescription className="tw:text-[13px]">
						Text size, row height and the columns this list shows.
					</SheetDescription>
				</SheetHeader>

				<SectionTitle>Font Size</SectionTitle>
				<div className="tw:px-5 tw:pb-4">
					<SegmentedControl<FontSize>
						label="Font size"
						options={FONT_SIZE_OPTIONS}
						value={fontSize}
						onChange={setFontSize}
						className="tw:w-full tw:[&>button]:flex-1 tw:[&>button]:justify-center"
					/>
				</div>

				<SectionTitle>Max lines per row</SectionTitle>
				<div className="tw:flex tw:items-center tw:gap-2 tw:px-5 tw:pb-4">
					<TitleTooltip title={lineClamp <= 1 ? 'Minimum is 1 line' : undefined}>
						<span>
							<Button
								variant="outline"
								size="icon-sm"
								aria-label="Decrease max lines"
								data-testid="line-clamp-decrease"
								onClick={decreaseLineClamp}
								disabled={lineClamp <= 1}
							>
								<Minus />
							</Button>
						</span>
					</TitleTooltip>
					<input
						min={1}
						max={10}
						value={lineClamp}
						onChange={handleLineClampChange}
						data-testid="line-clamp-input"
						type="number"
						aria-label="Max lines per row"
						className="tw:h-8 tw:w-16 tw:rounded-md tw:border tw:border-input tw:bg-muted tw:px-2 tw:text-center tw:text-sm tw:tabular-nums tw:outline-none tw:focus-visible:border-ring tw:focus-visible:ring-[3px] tw:focus-visible:ring-ring/50"
					/>
					<TitleTooltip title={lineClamp >= 10 ? 'Maximum is 10 lines' : undefined}>
						<span>
							<Button
								variant="outline"
								size="icon-sm"
								aria-label="Increase max lines"
								data-testid="line-clamp-increase"
								onClick={increaseLineClamp}
								disabled={lineClamp >= 10}
							>
								<Plus />
							</Button>
						</span>
					</TitleTooltip>
				</div>

				<div className="tw:border-t tw:border-border">
					<SectionTitle>Columns</SectionTitle>
				</div>
				<div className={styles.columnsList}>
					{orderedVisibleColumnItems.map((column) => {
						const isVisible = !hiddenColumnIds.includes(column.id);
						return (
							<label
								className="tw:flex tw:min-h-9 tw:cursor-pointer tw:items-center tw:justify-between tw:gap-3 tw:px-5 tw:text-[13px] tw:hover:bg-muted"
								key={column.id}
							>
								<span className="tw:flex-1 tw:text-left">{column.label}</span>
								<TitleTooltip
									title={
										column.canBeHidden ? undefined : 'Required column cannot be hidden'
									}
								>
									<span>
										<Switch
											checked={isVisible}
											disabled={!column.canBeHidden}
											data-testid={`toggle-column-${column.id}`}
											onCheckedChange={(checked): void =>
												handleToggleColumn(column.id, checked)
											}
										/>
									</span>
								</TitleTooltip>
							</label>
						);
					})}
				</div>
			</SheetContent>
		</Sheet>
	);
}

export default K8sOptionsSidePanel;
