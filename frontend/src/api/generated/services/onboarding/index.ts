/**
 * ! Do not edit manually
 * * The file has been auto-generated using Orval for FuseScope
 * * regenerate with 'pnpm generate:api'
 * FuseScope
 */
import { useMutation, useQuery } from 'react-query';
import type {
	InvalidateOptions,
	MutationFunction,
	QueryClient,
	QueryFunction,
	QueryKey,
	UseMutationOptions,
	UseMutationResult,
	UseQueryOptions,
	UseQueryResult,
} from 'react-query';

import type {
	GetOnboardingIngestion200,
	GetOnboardingStatus200,
	GetOnboardingStatusParams,
	OnboardingtypesUpdatableIngestionDTO,
	RenderErrorResponseDTO,
	UpdateOnboardingIngestion200,
} from '../fuseScope.schemas';

import { GeneratedAPIInstance } from '../../../generatedAPIInstance';
import type { ErrorType, BodyType } from '../../../generatedAPIInstance';

const withQueryKey = <T extends object, K>(
	query: T,
	queryKey: K,
): T & { queryKey: K } => {
	const result = { queryKey } as T & { queryKey: K };
	for (const key of Object.keys(query)) {
		// The explicit queryKey always wins, matching the previous
		// `{ ...query, queryKey }` spread where it was set last.
		if (key === 'queryKey') {
			continue;
		}
		Object.defineProperty(result, key, {
			enumerable: true,
			configurable: true,
			get: () => (query as Record<string, unknown>)[key],
		});
	}
	return result;
};

/**
 * Returns the OTLP endpoints exporters send to. An admin's URL wins over global.ingestion_url, which wins over endpoints derived from the external URL on ports 4317 and 4318.
 * @summary Get ingestion settings
 */
export const getOnboardingIngestion = (signal?: AbortSignal) => {
	return GeneratedAPIInstance<GetOnboardingIngestion200>({
		url: `/api/v1/onboarding/ingestion`,
		method: 'GET',
		signal,
	});
};

export const getGetOnboardingIngestionQueryKey = () => {
	return [`/api/v1/onboarding/ingestion`] as const;
};

export const getGetOnboardingIngestionQueryOptions = <
	TData = Awaited<ReturnType<typeof getOnboardingIngestion>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(options?: {
	query?: UseQueryOptions<
		Awaited<ReturnType<typeof getOnboardingIngestion>>,
		TError,
		TData
	>;
}) => {
	const { query: queryOptions } = options ?? {};

	const queryKey = queryOptions?.queryKey ?? getGetOnboardingIngestionQueryKey();

	const queryFn: QueryFunction<
		Awaited<ReturnType<typeof getOnboardingIngestion>>
	> = ({ signal }) => getOnboardingIngestion(signal);

	return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
		Awaited<ReturnType<typeof getOnboardingIngestion>>,
		TError,
		TData
	> & { queryKey: QueryKey };
};

export type GetOnboardingIngestionQueryResult = NonNullable<
	Awaited<ReturnType<typeof getOnboardingIngestion>>
>;
export type GetOnboardingIngestionQueryError =
	ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Get ingestion settings
 */

export function useGetOnboardingIngestion<
	TData = Awaited<ReturnType<typeof getOnboardingIngestion>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(options?: {
	query?: UseQueryOptions<
		Awaited<ReturnType<typeof getOnboardingIngestion>>,
		TError,
		TData
	>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
	const queryOptions = getGetOnboardingIngestionQueryOptions(options);

	const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
		queryKey: QueryKey;
	};

	return withQueryKey(query, queryOptions.queryKey);
}

/**
 * @summary Get ingestion settings
 */
export const invalidateGetOnboardingIngestion = async (
	queryClient: QueryClient,
	options?: InvalidateOptions,
): Promise<QueryClient> => {
	await queryClient.invalidateQueries(
		{ queryKey: getGetOnboardingIngestionQueryKey() },
		options,
	);

	return queryClient;
};

/**
 * Sets the organization's OTLP/HTTP ingestion URL, which overrides global.ingestion_url. An empty URL removes the override.
 * @summary Update ingestion settings
 */
export const updateOnboardingIngestion = (
	onboardingtypesUpdatableIngestionDTO?: BodyType<OnboardingtypesUpdatableIngestionDTO>,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<UpdateOnboardingIngestion200>({
		url: `/api/v1/onboarding/ingestion`,
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		data: onboardingtypesUpdatableIngestionDTO,
		signal,
	});
};

export const getUpdateOnboardingIngestionMutationOptions = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof updateOnboardingIngestion>>,
		TError,
		{ data?: BodyType<OnboardingtypesUpdatableIngestionDTO> },
		TContext
	>;
}): UseMutationOptions<
	Awaited<ReturnType<typeof updateOnboardingIngestion>>,
	TError,
	{ data?: BodyType<OnboardingtypesUpdatableIngestionDTO> },
	TContext
> => {
	const mutationKey = ['updateOnboardingIngestion'];
	const { mutation: mutationOptions } = options
		? options.mutation &&
			'mutationKey' in options.mutation &&
			options.mutation.mutationKey
			? options
			: { ...options, mutation: { ...options.mutation, mutationKey } }
		: { mutation: { mutationKey } };

	const mutationFn: MutationFunction<
		Awaited<ReturnType<typeof updateOnboardingIngestion>>,
		{ data?: BodyType<OnboardingtypesUpdatableIngestionDTO> }
	> = (props) => {
		const { data } = props ?? {};

		return updateOnboardingIngestion(data);
	};

	return { mutationFn, ...mutationOptions };
};

export type UpdateOnboardingIngestionMutationResult = NonNullable<
	Awaited<ReturnType<typeof updateOnboardingIngestion>>
>;
export type UpdateOnboardingIngestionMutationBody =
	| BodyType<OnboardingtypesUpdatableIngestionDTO>
	| undefined;
export type UpdateOnboardingIngestionMutationError =
	ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Update ingestion settings
 */
export const useUpdateOnboardingIngestion = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof updateOnboardingIngestion>>,
		TError,
		{ data?: BodyType<OnboardingtypesUpdatableIngestionDTO> },
		TContext
	>;
}): UseMutationResult<
	Awaited<ReturnType<typeof updateOnboardingIngestion>>,
	TError,
	{ data?: BodyType<OnboardingtypesUpdatableIngestionDTO> },
	TContext
> => {
	return useMutation(getUpdateOnboardingIngestionMutationOptions(options));
};
/**
 * Reports, per signal, whether telemetry arrived in a window of at most 24 hours: count, first and last seen. Filter on service.name to wait for one service. Poll it while a user sets up a source.
 * @summary Get onboarding status
 */
export const getOnboardingStatus = (
	params?: GetOnboardingStatusParams,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<GetOnboardingStatus200>({
		url: `/api/v1/onboarding/status`,
		method: 'GET',
		params,
		signal,
	});
};

export const getGetOnboardingStatusQueryKey = (
	params?: GetOnboardingStatusParams,
) => {
	return [`/api/v1/onboarding/status`, ...(params ? [params] : [])] as const;
};

export const getGetOnboardingStatusQueryOptions = <
	TData = Awaited<ReturnType<typeof getOnboardingStatus>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	params?: GetOnboardingStatusParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof getOnboardingStatus>>,
			TError,
			TData
		>;
	},
) => {
	const { query: queryOptions } = options ?? {};

	const queryKey =
		queryOptions?.queryKey ?? getGetOnboardingStatusQueryKey(params);

	const queryFn: QueryFunction<
		Awaited<ReturnType<typeof getOnboardingStatus>>
	> = ({ signal }) => getOnboardingStatus(params, signal);

	return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
		Awaited<ReturnType<typeof getOnboardingStatus>>,
		TError,
		TData
	> & { queryKey: QueryKey };
};

export type GetOnboardingStatusQueryResult = NonNullable<
	Awaited<ReturnType<typeof getOnboardingStatus>>
>;
export type GetOnboardingStatusQueryError = ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Get onboarding status
 */

export function useGetOnboardingStatus<
	TData = Awaited<ReturnType<typeof getOnboardingStatus>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	params?: GetOnboardingStatusParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof getOnboardingStatus>>,
			TError,
			TData
		>;
	},
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
	const queryOptions = getGetOnboardingStatusQueryOptions(params, options);

	const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
		queryKey: QueryKey;
	};

	return withQueryKey(query, queryOptions.queryKey);
}

/**
 * @summary Get onboarding status
 */
export const invalidateGetOnboardingStatus = async (
	queryClient: QueryClient,
	params?: GetOnboardingStatusParams,
	options?: InvalidateOptions,
): Promise<QueryClient> => {
	await queryClient.invalidateQueries(
		{ queryKey: getGetOnboardingStatusQueryKey(params) },
		options,
	);

	return queryClient;
};
