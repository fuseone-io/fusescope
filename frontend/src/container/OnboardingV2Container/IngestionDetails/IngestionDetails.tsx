import { useEffect, useState } from 'react';
import { useCopyToClipboard } from 'react-use';
import { Tooltip } from 'antd';
import logEvent from 'api/common/logEvent';
import { useGetIngestionKeys } from 'api/generated/services/gateway';
import { GatewaytypesIngestionKeyDTO } from 'api/generated/services/fuseScope.schemas';
import { fuseScopeDocsUrl, signozDocsUrl } from 'constants/docs';
import { convertToApiError } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import { useGetGlobalConfig } from 'api/generated/services/global';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import { useNotifications } from 'hooks/useNotifications';
import {
	ArrowUpRight,
	Copy,
	Globe,
	Info,
	Key,
	TriangleAlert,
} from 'lucide-react';
import { withBasePath } from 'utils/basePath';

import './IngestionDetails.styles.scss';

function maskKey(key: string, visibleStart = 4, visibleEnd = 4): string {
	if (!key) {
		return '';
	}

	// Ensure the key length is sufficient to be masked
	if (key.length <= visibleStart + visibleEnd) {
		return key; // Return the key as-is if it's too short to mask
	}

	const maskedSection = '*'.repeat(5);

	// Construct and return the masked key
	return key.slice(0, visibleStart) + maskedSection + key.slice(-visibleEnd);
}

const ONBOARDING_V3_ANALYTICS_EVENTS_MAP = {
	BASE: 'Onboarding V3',
	INGESTION_KEY_COPIED: 'Ingestion key copied',
	INGESTION_URL_COPIED: 'Ingestion URL copied',
	REGION_COPIED: 'Region copied',
};

const FIELD_LABEL =
	'tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:font-medium tw:tracking-wide tw:text-muted-foreground tw:uppercase';

const FIELD_VALUE =
	'tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:border tw:border-border tw:bg-muted tw:py-1 tw:pr-1 tw:pl-3 tw:font-mono tw:text-[13px]';

const LINKS_ROW =
	'tw:flex tw:items-start tw:gap-2 tw:text-[13px] tw:text-muted-foreground';

const LINK =
	'tw:inline-flex tw:items-center tw:gap-0.5 tw:text-primary-ink! tw:underline tw:underline-offset-2';

export default function OnboardingIngestionDetails(): JSX.Element {
	const { notifications } = useNotifications();
	const [, handleCopyToClipboard] = useCopyToClipboard();

	const [firstIngestionKey, setFirstIngestionKey] =
		useState<GatewaytypesIngestionKeyDTO>({} as GatewaytypesIngestionKeyDTO);

	const {
		data: ingestionKeys,
		isLoading: isIngestionKeysLoading,
		error,
		isError,
	} = useGetIngestionKeys({
		page: 1,
		per_page: 10,
	});

	const {
		data: globalConfig,
		isLoading: isLoadingGlobalConfig,
		isError: isErrorGlobalConfig,
		error: globalConfigError,
	} = useGetGlobalConfig();

	const globalConfigApiError = convertToApiError(globalConfigError);

	const handleCopyKey = (text: string): void => {
		handleCopyToClipboard(text);
		notifications.success({
			message: 'Copied to clipboard',
		});
	};

	useEffect(() => {
		if (!ingestionKeys || isIngestionKeysLoading) {
			return;
		}

		if (ingestionKeys.data.keys && ingestionKeys.data.keys.length > 0) {
			setFirstIngestionKey(ingestionKeys.data.keys[0]);
		}
	}, [isIngestionKeysLoading, ingestionKeys]);

	return (
		<div className="fs-ui tw:flex tw:flex-col tw:gap-4 tw:font-sans tw:text-sm tw:text-foreground">
			{isError && (
				<div className="tw:flex tw:flex-col tw:gap-4 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:p-4">
					<p className="tw:flex tw:items-center tw:gap-2 tw:text-error">
						<TriangleAlert className="tw:size-3.5 tw:shrink-0" aria-hidden />
						<span className="translate-safe">
							{error.message || 'Something went wrong'}
						</span>
					</p>

					<p className={LINKS_ROW}>
						<Info className="tw:mt-0.5 tw:size-3.5 tw:shrink-0" aria-hidden />

						<span>
							Find your ingestion URL and learn more about sending data to FuseScope{' '}
							<a
								href={fuseScopeDocsUrl('/sending-data/otlp/')}
								target="_blank"
								className={LINK}
								rel="noreferrer"
							>
								here <ArrowUpRight className="tw:size-3.5" aria-hidden />
							</a>
						</span>
					</p>
				</div>
			)}

			{(isIngestionKeysLoading || !isError) && (
				<>
					<div className="tw:flex tw:flex-col tw:gap-4 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:p-4">
						<p className="tw:text-muted-foreground">
							You can use this key to send your telemetry data to FuseScope.
						</p>

						{isIngestionKeysLoading || isLoadingGlobalConfig ? (
							<div className="tw:flex tw:flex-col tw:gap-2">
								<Skeleton className="tw:h-[18px] tw:w-full" />
								<Skeleton className="tw:h-[18px] tw:w-full" />
								<Skeleton className="tw:h-[18px] tw:w-full" />
								<Skeleton className="tw:h-[18px] tw:w-full" />
							</div>
						) : (
							<dl className="tw:flex tw:flex-col tw:gap-3">
								{!isLoadingGlobalConfig && (
									<div className="tw:flex tw:flex-col tw:gap-1">
										<dt className={FIELD_LABEL}>
											<Globe className="tw:size-3.5" aria-hidden />
											Ingestion URL
										</dt>

										{!isErrorGlobalConfig && (
											<dd className={FIELD_VALUE}>
												<span className="tw:min-w-0 tw:truncate">
													{globalConfig?.data?.ingestion_url}
												</span>

												<Button
													variant="ghost"
													size="icon-xs"
													aria-label="Copy ingestion URL"
													className="tw:text-muted-foreground"
													onClick={(): void => {
														logEvent(
															`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.INGESTION_URL_COPIED}`,
															{},
														);

														const ingestionURL = globalConfig?.data?.ingestion_url;

														if (ingestionURL) {
															handleCopyKey(ingestionURL);
														}
													}}
												>
													<Copy aria-hidden />
												</Button>
											</dd>
										)}

										{isErrorGlobalConfig && (
											<dd>
												<Tooltip
													rootClassName="ingestion-url-error-tooltip"
													arrow={false}
													title={
														<div className="ingestion-url-error-content">
															<span className="ingestion-url-error-code">
																{globalConfigApiError?.getErrorCode()}
															</span>

															<span className="ingestion-url-error-message">
																{globalConfigApiError?.getErrorMessage()}
															</span>
														</div>
													}
													placement="topLeft"
												>
													<Button
														variant="ghost"
														size="icon-xs"
														aria-label="Ingestion URL error"
														className="tw:text-warning"
													>
														<TriangleAlert aria-hidden />
													</Button>
												</Tooltip>
											</dd>
										)}
									</div>
								)}

								<div className="tw:flex tw:flex-col tw:gap-1">
									<dt className={FIELD_LABEL}>
										<Key className="tw:size-3.5" aria-hidden /> Ingestion Key
									</dt>

									<dd className={FIELD_VALUE}>
										<span className="tw:min-w-0 tw:truncate">
											{maskKey(firstIngestionKey?.value || '')}
										</span>

										<Button
											variant="ghost"
											size="icon-xs"
											aria-label="Copy ingestion key"
											className="tw:text-muted-foreground"
											onClick={(): void => {
												logEvent(
													`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.INGESTION_KEY_COPIED}`,
													{},
												);
												if (firstIngestionKey?.value) {
													handleCopyKey(firstIngestionKey.value);
												}
											}}
										>
											<Copy aria-hidden />
										</Button>
									</dd>
								</div>
							</dl>
						)}
					</div>

					<p className={LINKS_ROW}>
						<Info className="tw:mt-0.5 tw:size-3.5 tw:shrink-0" aria-hidden />

						<span>
							We support{' '}
							<a
								href={signozDocsUrl('/ingestion/signoz-cloud/keys/')}
								target="_blank"
								className={LINK}
								rel="noreferrer"
							>
								multiple ingestions keys
							</a>
							. To create a new one,{' '}
							<a
								href={withBasePath('/settings/ingestion-settings')}
								target="_blank"
								className={LINK}
								rel="noreferrer"
							>
								click here <ArrowUpRight className="tw:size-3.5" aria-hidden />
							</a>
						</span>
					</p>
				</>
			)}
		</div>
	);
}
