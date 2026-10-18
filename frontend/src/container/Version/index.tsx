import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import SystemPagePanel from 'components/SystemPagePanel/SystemPagePanel';
import { Button } from 'components/ui/button';
import { signozDocsUrl } from 'constants/docs';
import { ArrowUpRight, CloudUpload, Wrench } from 'lucide-react';
import { AppState } from 'store/reducers';
import AppReducer from 'types/reducer/app';
import { checkVersionState } from 'utils/app';

import { githubReleaseURL } from './constant';

function Version(): JSX.Element {
	const { t } = useTranslation();

	const {
		currentVersion,
		latestVersion,
		isCurrentVersionError,
		isLatestVersionError,
	} = useSelector<AppState, AppReducer>((state) => state.app);

	const isLatestVersion = checkVersionState(currentVersion, latestVersion);

	const isError = isCurrentVersionError || isLatestVersionError;

	const latestVersionUrl = useMemo(
		() =>
			isLatestVersionError
				? githubReleaseURL
				: `${githubReleaseURL}/tag/${latestVersion}`,
		[isLatestVersionError, latestVersion],
	);

	const rows = [
		{
			key: 'current',
			label: t('current_version'),
			value: isCurrentVersionError ? t('n_a').toString() : currentVersion,
			extra: null,
		},
		{
			key: 'latest',
			label: t('latest_version'),
			value: isLatestVersionError ? t('n_a').toString() : latestVersion,
			extra: (
				<a
					href={latestVersionUrl}
					target="_blank"
					rel="noreferrer"
					className="tw:inline-flex tw:items-center tw:gap-1 tw:text-[13px] tw:text-primary! tw:hover:underline"
				>
					{t('release_notes')}
					<ArrowUpRight className="tw:size-3.5" />
				</a>
			),
		},
	];

	return (
		<SystemPagePanel
			icon={<Wrench />}
			title="Version"
			description={
				!isError &&
				(isLatestVersion ? t('latest_version_signoz') : t('stale_version'))
			}
			actions={
				!isError &&
				!isLatestVersion && (
					<Button
						asChild
						className="tw:bg-primary! tw:text-primary-foreground! tw:hover:bg-primary/90!"
					>
						<a
							href={signozDocsUrl('/opentelemetry-collection-agents/docker/overview/')}
							target="_blank"
							rel="noreferrer"
						>
							<CloudUpload />
							{t('read_how_to_upgrade')}
						</a>
					</Button>
				)
			}
		>
			<dl className="fs-ui tw:divide-y tw:divide-border tw:rounded-lg tw:border tw:border-border tw:font-sans">
				{rows.map((row) => (
					<div
						key={row.key}
						className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-x-4 tw:gap-y-1 tw:px-4 tw:py-3"
					>
						<dt className="tw:text-[13px] tw:text-muted-foreground">{row.label}</dt>
						<dd className="tw:flex tw:items-center tw:gap-3">
							{row.extra}
							<span className="tw:font-mono tw:text-sm tw:tabular-nums">
								{row.value}
							</span>
						</dd>
					</div>
				))}
				{!isError && (
					<div className="tw:flex tw:items-center tw:justify-between tw:gap-4 tw:px-4 tw:py-3">
						<dt className="tw:text-[13px] tw:text-muted-foreground">Status</dt>
						<dd>
							{isLatestVersion ? (
								<StatusBadge tone="success" dot testId="version-status">
									Up to date
								</StatusBadge>
							) : (
								<StatusBadge tone="warning" dot testId="version-status">
									Update available
								</StatusBadge>
							)}
						</dd>
					</div>
				)}
			</dl>
		</SystemPagePanel>
	);
}

export default Version;
