import TagChip from 'components/PageTemplate/components/TagChip';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from 'components/ui/tooltip';

interface DefaultEnvironmentChipProps {
	environment: string;
}

/** The application's environment, which only fills events that carry none. */
function DefaultEnvironmentChip({
	environment,
}: DefaultEnvironmentChipProps): JSX.Element {
	return (
		<TooltipProvider delayDuration={300}>
			<Tooltip>
				<TooltipTrigger
					type="button"
					data-testid="rum-overview-environment"
					className="tw:cursor-default tw:rounded-sm tw:border-0 tw:bg-transparent tw:p-0"
				>
					<TagChip>default env: {environment}</TagChip>
				</TooltipTrigger>
				<TooltipContent className="tw:max-w-72">
					Set on events that carry no environment. SDKs may send their own
					deployment.environment.name, which filters and sessions show.
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export default DefaultEnvironmentChip;
