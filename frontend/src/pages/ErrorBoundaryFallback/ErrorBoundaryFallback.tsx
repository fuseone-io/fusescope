import { useCallback } from 'react';
import SystemPagePanel from 'components/SystemPagePanel/SystemPagePanel';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import { handleContactSupport } from 'container/Integrations/utils';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { House, LifeBuoy, TriangleAlert } from 'lucide-react';
import { withBasePath } from 'utils/basePath';

function ErrorBoundaryFallback(): JSX.Element {
	const handleReload = (): void => {
		// Hard reload resets Sentry.ErrorBoundary state; withBasePath preserves any /signoz/ prefix.
		window.location.href = withBasePath(ROUTES.HOME);
	};

	const { isCloudUser: isCloudUserVal } = useGetTenantLicense();

	const handleSupport = useCallback(() => {
		handleContactSupport(isCloudUserVal);
	}, [isCloudUserVal]);

	return (
		<SystemPagePanel
			icon={<TriangleAlert />}
			tone="error"
			title="Something went wrong :/"
			description="Our team is getting on top to resolve this. Please reach out to support if the issue persists."
			actions={
				<>
					<Button onClick={handleReload}>
						<House />
						Go to Home
					</Button>
					<Button
						variant="outline"
						className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
						onClick={handleSupport}
					>
						<LifeBuoy />
						Contact Support
					</Button>
				</>
			}
		/>
	);
}

export default ErrorBoundaryFallback;
