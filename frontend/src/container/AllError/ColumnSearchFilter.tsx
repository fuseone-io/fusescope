import { FormEvent, useState } from 'react';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from 'components/ui/popover';
import { cn } from 'lib/utils';
import { Search } from 'lucide-react';

interface ColumnSearchFilterProps {
	label: string;
	placeholder: string;
	value: string;
	onSearch: (value: string) => void;
	testId: string;
}

/** A column's free-text filter; an empty search clears it. */
function ColumnSearchFilter({
	label,
	placeholder,
	value,
	onSearch,
	testId,
}: ColumnSearchFilterProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(value);

	const handleOpenChange = (next: boolean): void => {
		if (next) {
			setDraft(value);
		}
		setOpen(next);
	};

	const handleSubmit = (event: FormEvent): void => {
		event.preventDefault();
		onSearch(draft.trim());
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					aria-label={`Filter ${label}`}
					data-testid={testId}
					className={cn(
						'tw:text-subtle-foreground',
						value && 'tw:text-primary! tw:bg-primary-soft',
					)}
				>
					<Search />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="tw:w-64 tw:p-3">
				<form onSubmit={handleSubmit} className="tw:flex tw:flex-col tw:gap-2">
					<Input
						type="search"
						aria-label={placeholder}
						placeholder={placeholder}
						value={draft}
						onChange={(event): void => setDraft(event.target.value)}
						className="tw:h-8 tw:text-[13px]"
					/>
					<Button type="submit" size="sm" className="tw:self-start">
						<Search />
						Search
					</Button>
				</form>
			</PopoverContent>
		</Popover>
	);
}

export default ColumnSearchFilter;
