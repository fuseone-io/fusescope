import { ReactNode, useId, useMemo, useRef, useState } from 'react';
import { Popover, PopoverAnchor, PopoverContent } from 'components/ui/popover';
import useResourceAttribute, {
	isResourceEmpty,
} from 'hooks/useResourceAttribute';
import { IOption } from 'hooks/useResourceAttribute/types';
import {
	convertMetricKeyToTrace,
	getResourceDeploymentKeys,
} from 'hooks/useResourceAttribute/utils';
import { cn } from 'lib/utils';
import { CircleX, LoaderCircle } from 'lucide-react';

import {
	ATTRIBUTES_PLACEHOLDER,
	FIELD_CLASS,
	NO_ATTRIBUTES_MESSAGE,
} from '../../constants';
import { useOptionList } from '../../hooks/useOptionList';
import OptionList, { optionId } from '../OptionList/OptionList';
import ChipFrame from '../QueryChip/ChipFrame';
import QueryChip from '../QueryChip';

interface AttributeComboboxProps {
	suffixIcon?: ReactNode;
}

/**
 * Builds one `key operator values` filter at a time from the steps in
 * `useResourceAttribute`; closing the list is what applies it.
 */
function AttributeCombobox({
	suffixIcon,
}: AttributeComboboxProps): JSX.Element {
	const {
		queries,
		staging,
		handleClose,
		handleBlur,
		handleClearAll,
		handleFocus,
		handleChange,
		selectedQuery,
		optionsData,
		loading,
	} = useResourceAttribute();

	const listId = useId();
	const anchorRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const openRef = useRef(false);
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');

	const multiple = optionsData.mode === 'multiple';
	const resourceDeploymentKey = getResourceDeploymentKeys();

	const queriesExcludingEnvironment = useMemo(
		() => queries.filter((query) => query.tagKey !== resourceDeploymentKey),
		[queries, resourceDeploymentKey],
	);

	const hasInput = isResourceEmpty(
		queriesExcludingEnvironment,
		staging,
		selectedQuery,
	);

	const pick = (option: IOption): void => {
		setSearch('');
		if (!multiple) {
			handleChange(option.value);
			return;
		}
		handleChange(
			selectedQuery.includes(option.value)
				? selectedQuery.filter((value) => value !== option.value)
				: [...selectedQuery, option.value],
		);
	};

	const list = useOptionList(optionsData.options, search, pick);

	const openList = (): void => {
		if (openRef.current) {
			return;
		}
		openRef.current = true;
		setOpen(true);
		handleFocus();
	};

	// Outside clicks, Escape and the input losing focus can all land in one
	// event; only the first may apply the staged filter.
	const closeList = (): void => {
		if (!openRef.current) {
			return;
		}
		openRef.current = false;
		setOpen(false);
		setSearch('');
		handleBlur();
	};

	const isInsideField = (target: EventTarget | null): boolean =>
		target instanceof Node && !!anchorRef.current?.contains(target);

	let emptyMessage: ReactNode = NO_ATTRIBUTES_MESSAGE;
	if (loading) {
		emptyMessage = (
			<span className="tw:inline-flex tw:items-center tw:gap-2">
				<LoaderCircle className="tw:size-4 tw:animate-spin" /> Loading...
			</span>
		);
	} else if (search && optionsData.options.length) {
		emptyMessage = 'No matching options';
	}

	return (
		<Popover
			open={open}
			onOpenChange={(next): void => {
				if (!next) {
					closeList();
				}
			}}
		>
			<PopoverAnchor asChild>
				<div
					ref={anchorRef}
					data-testid="resource-attributes-filter"
					onMouseDown={(event): void => {
						if (event.target !== inputRef.current) {
							event.preventDefault();
						}
					}}
					onClick={(): void => {
						inputRef.current?.focus();
						openList();
					}}
					className={cn(
						FIELD_CLASS,
						'tw:flex tw:min-w-0 tw:flex-1 tw:basis-64 tw:cursor-text tw:items-center tw:gap-1.5 tw:overflow-hidden tw:px-2',
						'tw:focus-within:border-ring tw:focus-within:ring-[3px] tw:focus-within:ring-ring/50',
					)}
				>
					<div className="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-1.5 tw:overflow-x-auto">
						{queriesExcludingEnvironment.map((query) => (
							<QueryChip key={query.id} queryData={query} onClose={handleClose} />
						))}
						{staging.map((query, idx) => (
							<ChipFrame key={query}>
								{idx === 0 ? convertMetricKeyToTrace(query) : query}
							</ChipFrame>
						))}
						{selectedQuery.map((value) => (
							<ChipFrame key={value}>{value}</ChipFrame>
						))}
						<input
							ref={inputRef}
							// A text input is a textbox; oxlint wrongly treats combobox as implicit.
							// oxlint-disable-next-line jsx-a11y/no-redundant-roles
							role="combobox"
							aria-label="Filter by resource attributes"
							aria-expanded={open}
							aria-controls={open ? listId : undefined}
							aria-autocomplete="list"
							aria-activedescendant={
								open && list.visible.length
									? optionId(listId, list.activeIndex)
									: undefined
							}
							placeholder={hasInput ? undefined : ATTRIBUTES_PLACEHOLDER}
							value={search}
							onChange={(event): void => {
								setSearch(event.target.value);
								openList();
							}}
							onKeyDown={(event): void => {
								if (!open && event.key === 'ArrowDown') {
									openList();
									return;
								}
								list.onKeyDown(event);
							}}
							onBlur={(event): void => {
								if (!isInsideField(event.relatedTarget)) {
									closeList();
								}
							}}
							className="tw:h-full tw:min-w-24 tw:flex-1 tw:bg-transparent tw:px-1 tw:text-sm tw:outline-none tw:placeholder:text-muted-foreground"
						/>
					</div>
					{queries.length || staging.length || selectedQuery.length ? (
						<button
							type="button"
							aria-label="Clear filters"
							onMouseDown={(event): void => event.preventDefault()}
							onClick={(event): void => {
								event.stopPropagation();
								openRef.current = false;
								setOpen(false);
								setSearch('');
								handleClearAll();
							}}
							className="tw:flex tw:shrink-0 tw:cursor-pointer tw:items-center tw:rounded-sm tw:text-muted-foreground tw:hover:text-foreground"
						>
							<CircleX className="tw:size-4" />
						</button>
					) : null}
					{suffixIcon && (
						<span className="tw:flex tw:shrink-0 tw:items-center">{suffixIcon}</span>
					)}
				</div>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				className="tw:w-(--radix-popover-trigger-width) tw:min-w-64 tw:p-0"
				onOpenAutoFocus={(event): void => event.preventDefault()}
				onCloseAutoFocus={(event): void => event.preventDefault()}
				onInteractOutside={(event): void => {
					if (isInsideField(event.target)) {
						event.preventDefault();
					}
				}}
			>
				<OptionList
					id={listId}
					label="Resource attributes"
					options={loading ? [] : list.visible}
					activeIndex={list.activeIndex}
					onActiveChange={list.setActiveIndex}
					onPick={pick}
					isSelected={(value): boolean => selectedQuery.includes(value)}
					multiple={multiple}
					empty={emptyMessage}
				/>
			</PopoverContent>
		</Popover>
	);
}

AttributeCombobox.defaultProps = {
	suffixIcon: undefined,
};

export default AttributeCombobox;
