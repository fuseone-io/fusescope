import { NativeSelect, NativeSelectOption } from 'components/ui/native-select';

interface ReleaseFilterProps {
	releases: string[];
	value: string;
	onChange: (release: string) => void;
}

function ReleaseFilter({
	releases,
	value,
	onChange,
}: ReleaseFilterProps): JSX.Element {
	return (
		<label className="fs-ui tw:flex tw:items-center tw:gap-2 tw:font-sans tw:text-[13px] tw:text-muted-foreground">
			Release
			<NativeSelect
				data-testid="rum-release"
				value={value}
				onChange={(event): void => onChange(event.target.value)}
				className="tw:font-medium"
			>
				<NativeSelectOption value="">All releases</NativeSelectOption>
				{releases.map((release) => (
					<NativeSelectOption key={release} value={release}>
						{release}
					</NativeSelectOption>
				))}
			</NativeSelect>
		</label>
	);
}

export default ReleaseFilter;
