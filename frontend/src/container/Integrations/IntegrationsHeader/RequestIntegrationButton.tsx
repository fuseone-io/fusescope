import { FormEvent, useState } from 'react';
import logEvent from 'api/common/logEvent';
import { Button } from 'components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from 'components/ui/dialog';
import { Input } from 'components/ui/input';
import { ArrowUpRight, MessageSquarePlus } from 'lucide-react';
import { openInNewTab } from 'utils/navigation';

import { integrationRequestIssueUrl } from '../utils';

/** Asks for an integration's name and opens a prefilled GitHub issue for it. */
function RequestIntegrationButton(): JSX.Element {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState('');
	const canSubmit = name.trim().length > 0;

	const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		if (!canSubmit) {
			return;
		}
		openInNewTab(integrationRequestIssueUrl(name));
		void logEvent('Integration requested', {
			screen: 'Integration list page',
			integration: name,
		});
		setName('');
		setOpen(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" data-testid="integrations-request-button">
					<MessageSquarePlus aria-hidden="true" />
					Request integration
				</Button>
			</DialogTrigger>
			<DialogContent className="tw:max-w-md">
				<form onSubmit={handleSubmit} className="tw:flex tw:flex-col">
					<DialogHeader>
						<DialogTitle>Request an integration</DialogTitle>
						<DialogDescription>
							Opens an issue on the FuseScope GitHub repository with your request.
						</DialogDescription>
					</DialogHeader>
					<div className="tw:flex tw:flex-col tw:gap-2 tw:px-5 tw:pt-3 tw:pb-4">
						<label
							htmlFor="integration-request-name"
							className="tw:text-[13px] tw:font-medium tw:text-foreground"
						>
							Which integration are you looking for?
						</label>
						<Input
							id="integration-request-name"
							data-testid="integrations-request-name"
							placeholder="Enter integration name..."
							autoComplete="off"
							value={name}
							onChange={(event): void => setName(event.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button
							type="submit"
							data-testid="integrations-request-submit"
							disabled={!canSubmit}
						>
							Open GitHub issue
							<ArrowUpRight aria-hidden="true" />
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export default RequestIntegrationButton;
