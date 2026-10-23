import { useCreateAlertState } from 'container/CreateAlertV2/context';
import useUrlQuery from 'hooks/useUrlQuery';
import { RUM_ALERT_COPY } from 'lib/rum/alertTemplateCopy';
import { rumAlertTemplateFromUrl } from 'lib/rum/alertTemplates';
import { AlertTypes } from 'types/api/alerts/alertTypes';

/** How the frontend template the editor started from reads the SDK's data. */
function RumTemplateMapping(): JSX.Element | null {
	const { alertType } = useCreateAlertState();
	const fromUrl = rumAlertTemplateFromUrl(useUrlQuery());
	if (!fromUrl || alertType !== AlertTypes.LOGS_BASED_ALERT) {
		return null;
	}

	return (
		<section
			aria-labelledby="rum-template-mapping-title"
			data-testid="rum-template-mapping"
			className="fs-ui tw:mx-4 tw:my-3 tw:rounded-lg tw:border tw:border-border tw:bg-surface tw:px-4 tw:py-3 tw:font-sans tw:text-foreground"
		>
			<h3
				id="rum-template-mapping-title"
				className="tw:m-0 tw:mb-2 tw:text-[13px] tw:font-medium"
			>
				How this maps to frontend data
			</h3>
			<dl className="tw:m-0 tw:grid tw:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] tw:gap-x-4 tw:gap-y-1.5 tw:text-xs">
				{RUM_ALERT_COPY[fromUrl.template].mapping.map((row) => (
					<div key={row.label} className="tw:contents">
						<dt className="tw:text-muted-foreground">{row.label}</dt>
						<dd className="tw:m-0 tw:min-w-0">
							<code className="tw:font-mono tw:break-words tw:text-foreground">
								{row.code}
							</code>
							<span className="tw:text-muted-foreground"> — {row.note}</span>
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

export default RumTemplateMapping;
