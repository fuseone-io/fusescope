import { useMemo } from 'react';
import { useGetHosts } from 'api/generated/services/zeus';
import { useAppContext } from 'providers/App/App';
import { LicensePlatform } from 'types/api/licensesV3/getActive';

/** Cloud workspaces only: the custom host when there is one, else the default. */
function WorkspaceUrl(): JSX.Element | null {
	const { activeLicense } = useAppContext();
	const isCloud = activeLicense?.platform === LicensePlatform.CLOUD;

	const { data, isError } = useGetHosts({ query: { enabled: isCloud } });

	const url = useMemo(() => {
		const hosts = data?.data?.hosts;
		const host =
			hosts?.find((h) => !h.is_default) ?? hosts?.find((h) => h.is_default);
		return host?.url?.split('://')[1] ?? '';
	}, [data]);

	if (isError || !data) {
		return null;
	}

	return (
		<span
			data-testid="home-workspace-url"
			className="tw:inline-flex tw:h-9 tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:px-3"
		>
			<span className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
				Workspace URL
			</span>
			<span className="tw:font-mono tw:text-xs tw:text-foreground">{url}</span>
		</span>
	);
}

export default WorkspaceUrl;
