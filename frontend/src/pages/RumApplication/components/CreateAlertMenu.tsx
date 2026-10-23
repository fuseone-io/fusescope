import { Link } from 'react-router-dom';
import type { RumtypesApplicationDTO } from 'api/generated/services/fuseScope.schemas';
import { Button } from 'components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { RUM_ALERT_COPY } from 'lib/rum/alertTemplateCopy';
import { RUM_ALERT_TEMPLATES, rumAlertUrl } from 'lib/rum/alertTemplates';
import { RumAlertTemplateId } from 'lib/rum/alertTemplateTypes';
import { BellPlus } from 'lucide-react';

interface CreateAlertMenuProps {
	application: RumtypesApplicationDTO;
}

const groupByOf = (template: RumAlertTemplateId): 'route' | undefined =>
	template === 'lcp_p75' ? 'route' : undefined;

function CreateAlertMenu({ application }: CreateAlertMenuProps): JSX.Element {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" data-testid="rum-overview-create-alert">
					<BellPlus aria-hidden="true" />
					Create alert
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="tw:w-72">
				<DropdownMenuLabel>Start from a template</DropdownMenuLabel>
				{RUM_ALERT_TEMPLATES.map((template) => (
					<DropdownMenuItem key={template} asChild>
						<Link
							to={rumAlertUrl(template, {
								applicationId: application.id,
								applicationName: application.name,
								groupBy: groupByOf(template),
							})}
							data-testid={`rum-alert-${template}`}
							className="tw:flex-col tw:items-start! tw:gap-0.5 tw:no-underline!"
						>
							<span className="tw:text-[13px] tw:font-medium tw:text-foreground">
								{RUM_ALERT_COPY[template].title}
							</span>
							<span className="tw:text-xs tw:text-muted-foreground">
								{RUM_ALERT_COPY[template].description}
							</span>
						</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default CreateAlertMenu;
