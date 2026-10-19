import SystemPagePanel from 'components/SystemPagePanel/SystemPagePanel';
import { Button } from 'components/ui/button';
import { handleContactSupport } from 'container/Integrations/utils';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import {
	Construction,
	LifeBuoy,
	RefreshCw,
	SearchX,
	Trash2,
} from 'lucide-react';

const REASONS = [
	{
		key: 'not-rendered',
		icon: <Construction aria-hidden="true" className="tw:size-4" />,
		text:
			'The trace data has not been rendered on your FuseScope server yet. You can wait for a bit and refresh this page if this is the case.',
	},
	{
		key: 'retention',
		icon: <Trash2 aria-hidden="true" className="tw:size-4" />,
		text:
			'The trace has been deleted as the data has crossed it’s retention period.',
	},
];

function NoData(): JSX.Element {
	const { isCloudUser: isCloudUserVal } = useGetTenantLicense();

	return (
		<SystemPagePanel
			testId="trace-no-data"
			className="tw:flex-1"
			icon={<SearchX />}
			tone="neutral"
			eyebrow="Trace"
			title="Uh-oh! We cannot show the selected trace."
			description="This can happen in either of the two scenarios -"
			actions={
				<>
					<Button
						variant="outline"
						data-testid="trace-no-data-refresh-button"
						onClick={(): void => window.location.reload()}
					>
						<RefreshCw />
						Refresh this page
					</Button>
					<Button
						variant="outline"
						data-testid="trace-no-data-contact-support-button"
						onClick={(): void => handleContactSupport(isCloudUserVal)}
					>
						<LifeBuoy />
						Contact Support
					</Button>
				</>
			}
			footer="If you feel the issue is none of the above, please contact support."
		>
			<ul className="fs-ui tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-2 tw:p-0 tw:font-sans">
				{REASONS.map((reason) => (
					<li
						key={reason.key}
						className="tw:flex tw:gap-3 tw:rounded-lg tw:border tw:border-border tw:bg-background tw:p-3 tw:text-[13px] tw:leading-relaxed tw:text-muted-foreground"
					>
						<span className="tw:mt-0.5 tw:flex-none tw:text-subtle-foreground">
							{reason.icon}
						</span>
						{reason.text}
					</li>
				))}
			</ul>
		</SystemPagePanel>
	);
}

export default NoData;
