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
	CreateRUMApplication201,
	CreateRUMApplicationKey201,
	CreateRUMApplicationKeyPathParameters,
	DeleteRUMApplicationPathParameters,
	DeleteRUMSourceMapPathParameters,
	DeleteRUMSourceMapsParams,
	DeleteRUMSourceMapsPathParameters,
	FormDataRumtypesPostableR8MappingDTO,
	FormDataRumtypesPostableSourceMapsDTO,
	GetRUMApplication200,
	GetRUMApplicationPathParameters,
	GetRUMApplicationStatus200,
	GetRUMApplicationStatusPathParameters,
	GetRUMErrorGroup200,
	GetRUMErrorGroupParams,
	GetRUMErrorGroupPathParameters,
	GetRUMSession200,
	GetRUMSessionParams,
	GetRUMSessionPathParameters,
	GetRUMView200,
	GetRUMViewParams,
	GetRUMViewPathParameters,
	ListRUMApplicationKeys200,
	ListRUMApplicationKeysPathParameters,
	ListRUMApplications200,
	ListRUMErrorGroups200,
	ListRUMErrorGroupsParams,
	ListRUMErrorGroupsPathParameters,
	ListRUMSessions200,
	ListRUMSessionsParams,
	ListRUMSessionsPathParameters,
	ListRUMSourceMaps200,
	ListRUMSourceMapsParams,
	ListRUMSourceMapsPathParameters,
	ListRUMViews200,
	ListRUMViewsParams,
	ListRUMViewsPathParameters,
	RenderErrorResponseDTO,
	RevokeRUMApplicationKeyPathParameters,
	RotateRUMApplicationKey201,
	RotateRUMApplicationKeyPathParameters,
	RumtypesPostableApplicationDTO,
	RumtypesPostableRotateApplicationKeyDTO,
	RumtypesUpdatableApplicationDTO,
	UpdateRUMApplication200,
	UpdateRUMApplicationPathParameters,
	UploadRUMR8Mapping201,
	UploadRUMR8MappingParams,
	UploadRUMR8MappingPathParameters,
	UploadRUMSourceMaps201,
	UploadRUMSourceMapsParams,
	UploadRUMSourceMapsPathParameters,
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
 * Returns the organization's RUM applications.
 * @summary List RUM applications
 */
export const listRUMApplications = (signal?: AbortSignal) => {
	return GeneratedAPIInstance<ListRUMApplications200>({
		url: `/api/v1/rum/applications`,
		method: 'GET',
		signal,
	});
};

export const getListRUMApplicationsQueryKey = () => {
	return [`/api/v1/rum/applications`] as const;
};

export const getListRUMApplicationsQueryOptions = <
	TData = Awaited<ReturnType<typeof listRUMApplications>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(options?: {
	query?: UseQueryOptions<
		Awaited<ReturnType<typeof listRUMApplications>>,
		TError,
		TData
	>;
}) => {
	const { query: queryOptions } = options ?? {};

	const queryKey = queryOptions?.queryKey ?? getListRUMApplicationsQueryKey();

	const queryFn: QueryFunction<
		Awaited<ReturnType<typeof listRUMApplications>>
	> = ({ signal }) => listRUMApplications(signal);

	return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
		Awaited<ReturnType<typeof listRUMApplications>>,
		TError,
		TData
	> & { queryKey: QueryKey };
};

export type ListRUMApplicationsQueryResult = NonNullable<
	Awaited<ReturnType<typeof listRUMApplications>>
>;
export type ListRUMApplicationsQueryError = ErrorType<RenderErrorResponseDTO>;

/**
 * @summary List RUM applications
 */

export function useListRUMApplications<
	TData = Awaited<ReturnType<typeof listRUMApplications>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(options?: {
	query?: UseQueryOptions<
		Awaited<ReturnType<typeof listRUMApplications>>,
		TError,
		TData
	>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
	const queryOptions = getListRUMApplicationsQueryOptions(options);

	const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
		queryKey: QueryKey;
	};

	return withQueryKey(query, queryOptions.queryKey);
}

/**
 * @summary List RUM applications
 */
export const invalidateListRUMApplications = async (
	queryClient: QueryClient,
	options?: InvalidateOptions,
): Promise<QueryClient> => {
	await queryClient.invalidateQueries(
		{ queryKey: getListRUMApplicationsQueryKey() },
		options,
	);

	return queryClient;
};

/**
 * Creates an application and its first public key. The key is returned only in this response.
 * @summary Create RUM application
 */
export const createRUMApplication = (
	rumtypesPostableApplicationDTO?: BodyType<RumtypesPostableApplicationDTO>,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<CreateRUMApplication201>({
		url: `/api/v1/rum/applications`,
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		data: rumtypesPostableApplicationDTO,
		signal,
	});
};

export const getCreateRUMApplicationMutationOptions = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof createRUMApplication>>,
		TError,
		{ data?: BodyType<RumtypesPostableApplicationDTO> },
		TContext
	>;
}): UseMutationOptions<
	Awaited<ReturnType<typeof createRUMApplication>>,
	TError,
	{ data?: BodyType<RumtypesPostableApplicationDTO> },
	TContext
> => {
	const mutationKey = ['createRUMApplication'];
	const { mutation: mutationOptions } = options
		? options.mutation &&
			'mutationKey' in options.mutation &&
			options.mutation.mutationKey
			? options
			: { ...options, mutation: { ...options.mutation, mutationKey } }
		: { mutation: { mutationKey } };

	const mutationFn: MutationFunction<
		Awaited<ReturnType<typeof createRUMApplication>>,
		{ data?: BodyType<RumtypesPostableApplicationDTO> }
	> = (props) => {
		const { data } = props ?? {};

		return createRUMApplication(data);
	};

	return { mutationFn, ...mutationOptions };
};

export type CreateRUMApplicationMutationResult = NonNullable<
	Awaited<ReturnType<typeof createRUMApplication>>
>;
export type CreateRUMApplicationMutationBody =
	| BodyType<RumtypesPostableApplicationDTO>
	| undefined;
export type CreateRUMApplicationMutationError =
	ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Create RUM application
 */
export const useCreateRUMApplication = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof createRUMApplication>>,
		TError,
		{ data?: BodyType<RumtypesPostableApplicationDTO> },
		TContext
	>;
}): UseMutationResult<
	Awaited<ReturnType<typeof createRUMApplication>>,
	TError,
	{ data?: BodyType<RumtypesPostableApplicationDTO> },
	TContext
> => {
	return useMutation(getCreateRUMApplicationMutationOptions(options));
};
/**
 * Deletes a RUM application and its keys. Ingested telemetry is kept.
 * @summary Delete RUM application
 */
export const deleteRUMApplication = (
	{ id }: DeleteRUMApplicationPathParameters,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<void>({
		url: `/api/v1/rum/applications/${id}`,
		method: 'DELETE',
		signal,
	});
};

export const getDeleteRUMApplicationMutationOptions = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof deleteRUMApplication>>,
		TError,
		{ pathParams: DeleteRUMApplicationPathParameters },
		TContext
	>;
}): UseMutationOptions<
	Awaited<ReturnType<typeof deleteRUMApplication>>,
	TError,
	{ pathParams: DeleteRUMApplicationPathParameters },
	TContext
> => {
	const mutationKey = ['deleteRUMApplication'];
	const { mutation: mutationOptions } = options
		? options.mutation &&
			'mutationKey' in options.mutation &&
			options.mutation.mutationKey
			? options
			: { ...options, mutation: { ...options.mutation, mutationKey } }
		: { mutation: { mutationKey } };

	const mutationFn: MutationFunction<
		Awaited<ReturnType<typeof deleteRUMApplication>>,
		{ pathParams: DeleteRUMApplicationPathParameters }
	> = (props) => {
		const { pathParams } = props ?? {};

		return deleteRUMApplication(pathParams);
	};

	return { mutationFn, ...mutationOptions };
};

export type DeleteRUMApplicationMutationResult = NonNullable<
	Awaited<ReturnType<typeof deleteRUMApplication>>
>;

export type DeleteRUMApplicationMutationError =
	ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Delete RUM application
 */
export const useDeleteRUMApplication = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof deleteRUMApplication>>,
		TError,
		{ pathParams: DeleteRUMApplicationPathParameters },
		TContext
	>;
}): UseMutationResult<
	Awaited<ReturnType<typeof deleteRUMApplication>>,
	TError,
	{ pathParams: DeleteRUMApplicationPathParameters },
	TContext
> => {
	return useMutation(getDeleteRUMApplicationMutationOptions(options));
};
/**
 * Returns a RUM application.
 * @summary Get RUM application
 */
export const getRUMApplication = (
	{ id }: GetRUMApplicationPathParameters,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<GetRUMApplication200>({
		url: `/api/v1/rum/applications/${id}`,
		method: 'GET',
		signal,
	});
};

export const getGetRUMApplicationQueryKey = ({
	id,
}: GetRUMApplicationPathParameters) => {
	return [`/api/v1/rum/applications/${id}`] as const;
};

export const getGetRUMApplicationQueryOptions = <
	TData = Awaited<ReturnType<typeof getRUMApplication>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: GetRUMApplicationPathParameters,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof getRUMApplication>>,
			TError,
			TData
		>;
	},
) => {
	const { query: queryOptions } = options ?? {};

	const queryKey =
		queryOptions?.queryKey ?? getGetRUMApplicationQueryKey({ id });

	const queryFn: QueryFunction<
		Awaited<ReturnType<typeof getRUMApplication>>
	> = ({ signal }) => getRUMApplication({ id }, signal);

	return {
		queryKey,
		queryFn,
		enabled: id !== null && id !== undefined,
		...queryOptions,
	} as UseQueryOptions<
		Awaited<ReturnType<typeof getRUMApplication>>,
		TError,
		TData
	> & { queryKey: QueryKey };
};

export type GetRUMApplicationQueryResult = NonNullable<
	Awaited<ReturnType<typeof getRUMApplication>>
>;
export type GetRUMApplicationQueryError = ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Get RUM application
 */

export function useGetRUMApplication<
	TData = Awaited<ReturnType<typeof getRUMApplication>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: GetRUMApplicationPathParameters,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof getRUMApplication>>,
			TError,
			TData
		>;
	},
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
	const queryOptions = getGetRUMApplicationQueryOptions({ id }, options);

	const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
		queryKey: QueryKey;
	};

	return withQueryKey(query, queryOptions.queryKey);
}

/**
 * @summary Get RUM application
 */
export const invalidateGetRUMApplication = async (
	queryClient: QueryClient,
	{ id }: GetRUMApplicationPathParameters,
	options?: InvalidateOptions,
): Promise<QueryClient> => {
	await queryClient.invalidateQueries(
		{ queryKey: getGetRUMApplicationQueryKey({ id }) },
		options,
	);

	return queryClient;
};

/**
 * Replaces a RUM application's settings. The platform cannot change.
 * @summary Update RUM application
 */
export const updateRUMApplication = (
	{ id }: UpdateRUMApplicationPathParameters,
	rumtypesUpdatableApplicationDTO?: BodyType<RumtypesUpdatableApplicationDTO>,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<UpdateRUMApplication200>({
		url: `/api/v1/rum/applications/${id}`,
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		data: rumtypesUpdatableApplicationDTO,
		signal,
	});
};

export const getUpdateRUMApplicationMutationOptions = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof updateRUMApplication>>,
		TError,
		{
			pathParams: UpdateRUMApplicationPathParameters;
			data?: BodyType<RumtypesUpdatableApplicationDTO>;
		},
		TContext
	>;
}): UseMutationOptions<
	Awaited<ReturnType<typeof updateRUMApplication>>,
	TError,
	{
		pathParams: UpdateRUMApplicationPathParameters;
		data?: BodyType<RumtypesUpdatableApplicationDTO>;
	},
	TContext
> => {
	const mutationKey = ['updateRUMApplication'];
	const { mutation: mutationOptions } = options
		? options.mutation &&
			'mutationKey' in options.mutation &&
			options.mutation.mutationKey
			? options
			: { ...options, mutation: { ...options.mutation, mutationKey } }
		: { mutation: { mutationKey } };

	const mutationFn: MutationFunction<
		Awaited<ReturnType<typeof updateRUMApplication>>,
		{
			pathParams: UpdateRUMApplicationPathParameters;
			data?: BodyType<RumtypesUpdatableApplicationDTO>;
		}
	> = (props) => {
		const { pathParams, data } = props ?? {};

		return updateRUMApplication(pathParams, data);
	};

	return { mutationFn, ...mutationOptions };
};

export type UpdateRUMApplicationMutationResult = NonNullable<
	Awaited<ReturnType<typeof updateRUMApplication>>
>;
export type UpdateRUMApplicationMutationBody =
	| BodyType<RumtypesUpdatableApplicationDTO>
	| undefined;
export type UpdateRUMApplicationMutationError =
	ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Update RUM application
 */
export const useUpdateRUMApplication = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof updateRUMApplication>>,
		TError,
		{
			pathParams: UpdateRUMApplicationPathParameters;
			data?: BodyType<RumtypesUpdatableApplicationDTO>;
		},
		TContext
	>;
}): UseMutationResult<
	Awaited<ReturnType<typeof updateRUMApplication>>,
	TError,
	{
		pathParams: UpdateRUMApplicationPathParameters;
		data?: BodyType<RumtypesUpdatableApplicationDTO>;
	},
	TContext
> => {
	return useMutation(getUpdateRUMApplicationMutationOptions(options));
};
/**
 * Groups error events by fingerprint: exception type, message with numbers, ids and URLs replaced, and the top frame's file and function. First seen and new in release look back 30 days, or the retention if shorter, and ignore the release filter. Defaults to the last 24 hours; ranges are at most 31 days. release and environment filter on service.version and deployment.environment.name.
 * @summary List RUM error groups
 */
export const listRUMErrorGroups = (
	{ id }: ListRUMErrorGroupsPathParameters,
	params?: ListRUMErrorGroupsParams,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<ListRUMErrorGroups200>({
		url: `/api/v1/rum/applications/${id}/errors`,
		method: 'GET',
		params,
		signal,
	});
};

export const getListRUMErrorGroupsQueryKey = (
	{ id }: ListRUMErrorGroupsPathParameters,
	params?: ListRUMErrorGroupsParams,
) => {
	return [
		`/api/v1/rum/applications/${id}/errors`,
		...(params ? [params] : []),
	] as const;
};

export const getListRUMErrorGroupsQueryOptions = <
	TData = Awaited<ReturnType<typeof listRUMErrorGroups>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: ListRUMErrorGroupsPathParameters,
	params?: ListRUMErrorGroupsParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof listRUMErrorGroups>>,
			TError,
			TData
		>;
	},
) => {
	const { query: queryOptions } = options ?? {};

	const queryKey =
		queryOptions?.queryKey ?? getListRUMErrorGroupsQueryKey({ id }, params);

	const queryFn: QueryFunction<
		Awaited<ReturnType<typeof listRUMErrorGroups>>
	> = ({ signal }) => listRUMErrorGroups({ id }, params, signal);

	return {
		queryKey,
		queryFn,
		enabled: id !== null && id !== undefined,
		...queryOptions,
	} as UseQueryOptions<
		Awaited<ReturnType<typeof listRUMErrorGroups>>,
		TError,
		TData
	> & { queryKey: QueryKey };
};

export type ListRUMErrorGroupsQueryResult = NonNullable<
	Awaited<ReturnType<typeof listRUMErrorGroups>>
>;
export type ListRUMErrorGroupsQueryError = ErrorType<RenderErrorResponseDTO>;

/**
 * @summary List RUM error groups
 */

export function useListRUMErrorGroups<
	TData = Awaited<ReturnType<typeof listRUMErrorGroups>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: ListRUMErrorGroupsPathParameters,
	params?: ListRUMErrorGroupsParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof listRUMErrorGroups>>,
			TError,
			TData
		>;
	},
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
	const queryOptions = getListRUMErrorGroupsQueryOptions(
		{ id },
		params,
		options,
	);

	const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
		queryKey: QueryKey;
	};

	return withQueryKey(query, queryOptions.queryKey);
}

/**
 * @summary List RUM error groups
 */
export const invalidateListRUMErrorGroups = async (
	queryClient: QueryClient,
	{ id }: ListRUMErrorGroupsPathParameters,
	params?: ListRUMErrorGroupsParams,
	options?: InvalidateOptions,
): Promise<QueryClient> => {
	await queryClient.invalidateQueries(
		{ queryKey: getListRUMErrorGroupsQueryKey({ id }, params) },
		options,
	);

	return queryClient;
};

/**
 * Returns an error group with its latest events and raw stack traces, the selected event's breadcrumbs and linked failed request, and the latest affected sessions. Event frames carry their original position when the event's release has uploaded source maps; missingSourceMap is set when it has none. Defaults to the last 24 hours; ranges are at most 31 days. release and environment filter on service.version and deployment.environment.name.
 * @summary Get RUM error group
 */
export const getRUMErrorGroup = (
	{ id, fingerprint }: GetRUMErrorGroupPathParameters,
	params?: GetRUMErrorGroupParams,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<GetRUMErrorGroup200>({
		url: `/api/v1/rum/applications/${id}/errors/${fingerprint}`,
		method: 'GET',
		params,
		signal,
	});
};

export const getGetRUMErrorGroupQueryKey = (
	{ id, fingerprint }: GetRUMErrorGroupPathParameters,
	params?: GetRUMErrorGroupParams,
) => {
	return [
		`/api/v1/rum/applications/${id}/errors/${fingerprint}`,
		...(params ? [params] : []),
	] as const;
};

export const getGetRUMErrorGroupQueryOptions = <
	TData = Awaited<ReturnType<typeof getRUMErrorGroup>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id, fingerprint }: GetRUMErrorGroupPathParameters,
	params?: GetRUMErrorGroupParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof getRUMErrorGroup>>,
			TError,
			TData
		>;
	},
) => {
	const { query: queryOptions } = options ?? {};

	const queryKey =
		queryOptions?.queryKey ??
		getGetRUMErrorGroupQueryKey({ id, fingerprint }, params);

	const queryFn: QueryFunction<Awaited<ReturnType<typeof getRUMErrorGroup>>> = ({
		signal,
	}) => getRUMErrorGroup({ id, fingerprint }, params, signal);

	return {
		queryKey,
		queryFn,
		enabled:
			id !== null &&
			id !== undefined &&
			fingerprint !== null &&
			fingerprint !== undefined,
		...queryOptions,
	} as UseQueryOptions<
		Awaited<ReturnType<typeof getRUMErrorGroup>>,
		TError,
		TData
	> & { queryKey: QueryKey };
};

export type GetRUMErrorGroupQueryResult = NonNullable<
	Awaited<ReturnType<typeof getRUMErrorGroup>>
>;
export type GetRUMErrorGroupQueryError = ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Get RUM error group
 */

export function useGetRUMErrorGroup<
	TData = Awaited<ReturnType<typeof getRUMErrorGroup>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id, fingerprint }: GetRUMErrorGroupPathParameters,
	params?: GetRUMErrorGroupParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof getRUMErrorGroup>>,
			TError,
			TData
		>;
	},
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
	const queryOptions = getGetRUMErrorGroupQueryOptions(
		{ id, fingerprint },
		params,
		options,
	);

	const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
		queryKey: QueryKey;
	};

	return withQueryKey(query, queryOptions.queryKey);
}

/**
 * @summary Get RUM error group
 */
export const invalidateGetRUMErrorGroup = async (
	queryClient: QueryClient,
	{ id, fingerprint }: GetRUMErrorGroupPathParameters,
	params?: GetRUMErrorGroupParams,
	options?: InvalidateOptions,
): Promise<QueryClient> => {
	await queryClient.invalidateQueries(
		{ queryKey: getGetRUMErrorGroupQueryKey({ id, fingerprint }, params) },
		options,
	);

	return queryClient;
};

/**
 * Returns the application's usable keys: the active one and, during a rotation, the expiring one.
 * @summary List RUM application keys
 */
export const listRUMApplicationKeys = (
	{ id }: ListRUMApplicationKeysPathParameters,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<ListRUMApplicationKeys200>({
		url: `/api/v1/rum/applications/${id}/keys`,
		method: 'GET',
		signal,
	});
};

export const getListRUMApplicationKeysQueryKey = ({
	id,
}: ListRUMApplicationKeysPathParameters) => {
	return [`/api/v1/rum/applications/${id}/keys`] as const;
};

export const getListRUMApplicationKeysQueryOptions = <
	TData = Awaited<ReturnType<typeof listRUMApplicationKeys>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: ListRUMApplicationKeysPathParameters,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof listRUMApplicationKeys>>,
			TError,
			TData
		>;
	},
) => {
	const { query: queryOptions } = options ?? {};

	const queryKey =
		queryOptions?.queryKey ?? getListRUMApplicationKeysQueryKey({ id });

	const queryFn: QueryFunction<
		Awaited<ReturnType<typeof listRUMApplicationKeys>>
	> = ({ signal }) => listRUMApplicationKeys({ id }, signal);

	return {
		queryKey,
		queryFn,
		enabled: id !== null && id !== undefined,
		...queryOptions,
	} as UseQueryOptions<
		Awaited<ReturnType<typeof listRUMApplicationKeys>>,
		TError,
		TData
	> & { queryKey: QueryKey };
};

export type ListRUMApplicationKeysQueryResult = NonNullable<
	Awaited<ReturnType<typeof listRUMApplicationKeys>>
>;
export type ListRUMApplicationKeysQueryError =
	ErrorType<RenderErrorResponseDTO>;

/**
 * @summary List RUM application keys
 */

export function useListRUMApplicationKeys<
	TData = Awaited<ReturnType<typeof listRUMApplicationKeys>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: ListRUMApplicationKeysPathParameters,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof listRUMApplicationKeys>>,
			TError,
			TData
		>;
	},
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
	const queryOptions = getListRUMApplicationKeysQueryOptions({ id }, options);

	const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
		queryKey: QueryKey;
	};

	return withQueryKey(query, queryOptions.queryKey);
}

/**
 * @summary List RUM application keys
 */
export const invalidateListRUMApplicationKeys = async (
	queryClient: QueryClient,
	{ id }: ListRUMApplicationKeysPathParameters,
	options?: InvalidateOptions,
): Promise<QueryClient> => {
	await queryClient.invalidateQueries(
		{ queryKey: getListRUMApplicationKeysQueryKey({ id }) },
		options,
	);

	return queryClient;
};

/**
 * Creates a key for an application that has none left, e.g. after a revoke. Use rotate otherwise. The key is returned only in this response.
 * @summary Create RUM application key
 */
export const createRUMApplicationKey = (
	{ id }: CreateRUMApplicationKeyPathParameters,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<CreateRUMApplicationKey201>({
		url: `/api/v1/rum/applications/${id}/keys`,
		method: 'POST',
		signal,
	});
};

export const getCreateRUMApplicationKeyMutationOptions = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof createRUMApplicationKey>>,
		TError,
		{ pathParams: CreateRUMApplicationKeyPathParameters },
		TContext
	>;
}): UseMutationOptions<
	Awaited<ReturnType<typeof createRUMApplicationKey>>,
	TError,
	{ pathParams: CreateRUMApplicationKeyPathParameters },
	TContext
> => {
	const mutationKey = ['createRUMApplicationKey'];
	const { mutation: mutationOptions } = options
		? options.mutation &&
			'mutationKey' in options.mutation &&
			options.mutation.mutationKey
			? options
			: { ...options, mutation: { ...options.mutation, mutationKey } }
		: { mutation: { mutationKey } };

	const mutationFn: MutationFunction<
		Awaited<ReturnType<typeof createRUMApplicationKey>>,
		{ pathParams: CreateRUMApplicationKeyPathParameters }
	> = (props) => {
		const { pathParams } = props ?? {};

		return createRUMApplicationKey(pathParams);
	};

	return { mutationFn, ...mutationOptions };
};

export type CreateRUMApplicationKeyMutationResult = NonNullable<
	Awaited<ReturnType<typeof createRUMApplicationKey>>
>;

export type CreateRUMApplicationKeyMutationError =
	ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Create RUM application key
 */
export const useCreateRUMApplicationKey = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof createRUMApplicationKey>>,
		TError,
		{ pathParams: CreateRUMApplicationKeyPathParameters },
		TContext
	>;
}): UseMutationResult<
	Awaited<ReturnType<typeof createRUMApplicationKey>>,
	TError,
	{ pathParams: CreateRUMApplicationKeyPathParameters },
	TContext
> => {
	return useMutation(getCreateRUMApplicationKeyMutationOptions(options));
};
/**
 * Revokes a key at once, e.g. to end a rotation's overlap early.
 * @summary Revoke RUM application key
 */
export const revokeRUMApplicationKey = (
	{ id, keyId }: RevokeRUMApplicationKeyPathParameters,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<void>({
		url: `/api/v1/rum/applications/${id}/keys/${keyId}`,
		method: 'DELETE',
		signal,
	});
};

export const getRevokeRUMApplicationKeyMutationOptions = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof revokeRUMApplicationKey>>,
		TError,
		{ pathParams: RevokeRUMApplicationKeyPathParameters },
		TContext
	>;
}): UseMutationOptions<
	Awaited<ReturnType<typeof revokeRUMApplicationKey>>,
	TError,
	{ pathParams: RevokeRUMApplicationKeyPathParameters },
	TContext
> => {
	const mutationKey = ['revokeRUMApplicationKey'];
	const { mutation: mutationOptions } = options
		? options.mutation &&
			'mutationKey' in options.mutation &&
			options.mutation.mutationKey
			? options
			: { ...options, mutation: { ...options.mutation, mutationKey } }
		: { mutation: { mutationKey } };

	const mutationFn: MutationFunction<
		Awaited<ReturnType<typeof revokeRUMApplicationKey>>,
		{ pathParams: RevokeRUMApplicationKeyPathParameters }
	> = (props) => {
		const { pathParams } = props ?? {};

		return revokeRUMApplicationKey(pathParams);
	};

	return { mutationFn, ...mutationOptions };
};

export type RevokeRUMApplicationKeyMutationResult = NonNullable<
	Awaited<ReturnType<typeof revokeRUMApplicationKey>>
>;

export type RevokeRUMApplicationKeyMutationError =
	ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Revoke RUM application key
 */
export const useRevokeRUMApplicationKey = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof revokeRUMApplicationKey>>,
		TError,
		{ pathParams: RevokeRUMApplicationKeyPathParameters },
		TContext
	>;
}): UseMutationResult<
	Awaited<ReturnType<typeof revokeRUMApplicationKey>>,
	TError,
	{ pathParams: RevokeRUMApplicationKeyPathParameters },
	TContext
> => {
	return useMutation(getRevokeRUMApplicationKeyMutationOptions(options));
};
/**
 * Issues a new key and keeps the current one working for the overlap. One rotation runs at a time. The new key is returned only in this response.
 * @summary Rotate RUM application key
 */
export const rotateRUMApplicationKey = (
	{ id, keyId }: RotateRUMApplicationKeyPathParameters,
	rumtypesPostableRotateApplicationKeyDTO?: BodyType<RumtypesPostableRotateApplicationKeyDTO>,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<RotateRUMApplicationKey201>({
		url: `/api/v1/rum/applications/${id}/keys/${keyId}/rotate`,
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		data: rumtypesPostableRotateApplicationKeyDTO,
		signal,
	});
};

export const getRotateRUMApplicationKeyMutationOptions = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof rotateRUMApplicationKey>>,
		TError,
		{
			pathParams: RotateRUMApplicationKeyPathParameters;
			data?: BodyType<RumtypesPostableRotateApplicationKeyDTO>;
		},
		TContext
	>;
}): UseMutationOptions<
	Awaited<ReturnType<typeof rotateRUMApplicationKey>>,
	TError,
	{
		pathParams: RotateRUMApplicationKeyPathParameters;
		data?: BodyType<RumtypesPostableRotateApplicationKeyDTO>;
	},
	TContext
> => {
	const mutationKey = ['rotateRUMApplicationKey'];
	const { mutation: mutationOptions } = options
		? options.mutation &&
			'mutationKey' in options.mutation &&
			options.mutation.mutationKey
			? options
			: { ...options, mutation: { ...options.mutation, mutationKey } }
		: { mutation: { mutationKey } };

	const mutationFn: MutationFunction<
		Awaited<ReturnType<typeof rotateRUMApplicationKey>>,
		{
			pathParams: RotateRUMApplicationKeyPathParameters;
			data?: BodyType<RumtypesPostableRotateApplicationKeyDTO>;
		}
	> = (props) => {
		const { pathParams, data } = props ?? {};

		return rotateRUMApplicationKey(pathParams, data);
	};

	return { mutationFn, ...mutationOptions };
};

export type RotateRUMApplicationKeyMutationResult = NonNullable<
	Awaited<ReturnType<typeof rotateRUMApplicationKey>>
>;
export type RotateRUMApplicationKeyMutationBody =
	| BodyType<RumtypesPostableRotateApplicationKeyDTO>
	| undefined;
export type RotateRUMApplicationKeyMutationError =
	ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Rotate RUM application key
 */
export const useRotateRUMApplicationKey = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof rotateRUMApplicationKey>>,
		TError,
		{
			pathParams: RotateRUMApplicationKeyPathParameters;
			data?: BodyType<RumtypesPostableRotateApplicationKeyDTO>;
		},
		TContext
	>;
}): UseMutationResult<
	Awaited<ReturnType<typeof rotateRUMApplicationKey>>,
	TError,
	{
		pathParams: RotateRUMApplicationKeyPathParameters;
		data?: BodyType<RumtypesPostableRotateApplicationKeyDTO>;
	},
	TContext
> => {
	return useMutation(getRotateRUMApplicationKeyMutationOptions(options));
};
/**
 * Stores the R8 or ProGuard mapping.txt of an Android application's release, replacing the release's mapping if it has one. JVM stack traces of events whose service.version equals the release are retraced with it when read. The body is the mapping itself (any content type but multipart, optionally with Content-Encoding: gzip), or multipart/form-data with the mapping in a part named file and the release in a release field. release comes from the query, or from that field. A body that is not a mapping, empty or larger than the file limit (50 MB by default, after decompression) is refused with 400; more than the application's quota, 2 GB by default, with 413. Uploads share the source map store, limits and retention, and are listed and deleted with the sourcemaps endpoints. Use an API key with the Editor role in SigNoz-Api-Key; the public RUM key is not accepted.
 * @summary Upload RUM R8 mapping
 */
export const uploadRUMR8Mapping = (
	{ id }: UploadRUMR8MappingPathParameters,
	formDataRumtypesPostableR8MappingDTO?: BodyType<FormDataRumtypesPostableR8MappingDTO>,
	params?: UploadRUMR8MappingParams,
	signal?: AbortSignal,
) => {
	const formData = new FormData();
	if (formDataRumtypesPostableR8MappingDTO?.file !== undefined) {
		formData.append(`file`, formDataRumtypesPostableR8MappingDTO.file);
	}
	if (formDataRumtypesPostableR8MappingDTO?.map_id !== undefined) {
		formData.append(`map_id`, formDataRumtypesPostableR8MappingDTO.map_id);
	}
	if (formDataRumtypesPostableR8MappingDTO?.release !== undefined) {
		formData.append(`release`, formDataRumtypesPostableR8MappingDTO.release);
	}

	return GeneratedAPIInstance<UploadRUMR8Mapping201>({
		url: `/api/v1/rum/applications/${id}/mappings`,
		method: 'POST',
		headers: { 'Content-Type': 'multipart/form-data' },
		data: formData,
		params,
		signal,
	});
};

export const getUploadRUMR8MappingMutationOptions = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof uploadRUMR8Mapping>>,
		TError,
		{
			pathParams: UploadRUMR8MappingPathParameters;
			data?: BodyType<FormDataRumtypesPostableR8MappingDTO>;
			params?: UploadRUMR8MappingParams;
		},
		TContext
	>;
}): UseMutationOptions<
	Awaited<ReturnType<typeof uploadRUMR8Mapping>>,
	TError,
	{
		pathParams: UploadRUMR8MappingPathParameters;
		data?: BodyType<FormDataRumtypesPostableR8MappingDTO>;
		params?: UploadRUMR8MappingParams;
	},
	TContext
> => {
	const mutationKey = ['uploadRUMR8Mapping'];
	const { mutation: mutationOptions } = options
		? options.mutation &&
			'mutationKey' in options.mutation &&
			options.mutation.mutationKey
			? options
			: { ...options, mutation: { ...options.mutation, mutationKey } }
		: { mutation: { mutationKey } };

	const mutationFn: MutationFunction<
		Awaited<ReturnType<typeof uploadRUMR8Mapping>>,
		{
			pathParams: UploadRUMR8MappingPathParameters;
			data?: BodyType<FormDataRumtypesPostableR8MappingDTO>;
			params?: UploadRUMR8MappingParams;
		}
	> = (props) => {
		const { pathParams, data, params } = props ?? {};

		return uploadRUMR8Mapping(pathParams, data, params);
	};

	return { mutationFn, ...mutationOptions };
};

export type UploadRUMR8MappingMutationResult = NonNullable<
	Awaited<ReturnType<typeof uploadRUMR8Mapping>>
>;
export type UploadRUMR8MappingMutationBody =
	| BodyType<FormDataRumtypesPostableR8MappingDTO>
	| undefined;
export type UploadRUMR8MappingMutationError = ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Upload RUM R8 mapping
 */
export const useUploadRUMR8Mapping = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof uploadRUMR8Mapping>>,
		TError,
		{
			pathParams: UploadRUMR8MappingPathParameters;
			data?: BodyType<FormDataRumtypesPostableR8MappingDTO>;
			params?: UploadRUMR8MappingParams;
		},
		TContext
	>;
}): UseMutationResult<
	Awaited<ReturnType<typeof uploadRUMR8Mapping>>,
	TError,
	{
		pathParams: UploadRUMR8MappingPathParameters;
		data?: BodyType<FormDataRumtypesPostableR8MappingDTO>;
		params?: UploadRUMR8MappingParams;
	},
	TContext
> => {
	return useMutation(getUploadRUMR8MappingMutationOptions(options));
};
/**
 * Returns sessions newest first, with views, actions, errors, client, release and the previous session. Defaults to the last 24 hours; ranges are at most 31 days. release and environment filter on service.version and deployment.environment.name.
 * @summary List RUM sessions
 */
export const listRUMSessions = (
	{ id }: ListRUMSessionsPathParameters,
	params?: ListRUMSessionsParams,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<ListRUMSessions200>({
		url: `/api/v1/rum/applications/${id}/sessions`,
		method: 'GET',
		params,
		signal,
	});
};

export const getListRUMSessionsQueryKey = (
	{ id }: ListRUMSessionsPathParameters,
	params?: ListRUMSessionsParams,
) => {
	return [
		`/api/v1/rum/applications/${id}/sessions`,
		...(params ? [params] : []),
	] as const;
};

export const getListRUMSessionsQueryOptions = <
	TData = Awaited<ReturnType<typeof listRUMSessions>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: ListRUMSessionsPathParameters,
	params?: ListRUMSessionsParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof listRUMSessions>>,
			TError,
			TData
		>;
	},
) => {
	const { query: queryOptions } = options ?? {};

	const queryKey =
		queryOptions?.queryKey ?? getListRUMSessionsQueryKey({ id }, params);

	const queryFn: QueryFunction<Awaited<ReturnType<typeof listRUMSessions>>> = ({
		signal,
	}) => listRUMSessions({ id }, params, signal);

	return {
		queryKey,
		queryFn,
		enabled: id !== null && id !== undefined,
		...queryOptions,
	} as UseQueryOptions<
		Awaited<ReturnType<typeof listRUMSessions>>,
		TError,
		TData
	> & { queryKey: QueryKey };
};

export type ListRUMSessionsQueryResult = NonNullable<
	Awaited<ReturnType<typeof listRUMSessions>>
>;
export type ListRUMSessionsQueryError = ErrorType<RenderErrorResponseDTO>;

/**
 * @summary List RUM sessions
 */

export function useListRUMSessions<
	TData = Awaited<ReturnType<typeof listRUMSessions>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: ListRUMSessionsPathParameters,
	params?: ListRUMSessionsParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof listRUMSessions>>,
			TError,
			TData
		>;
	},
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
	const queryOptions = getListRUMSessionsQueryOptions({ id }, params, options);

	const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
		queryKey: QueryKey;
	};

	return withQueryKey(query, queryOptions.queryKey);
}

/**
 * @summary List RUM sessions
 */
export const invalidateListRUMSessions = async (
	queryClient: QueryClient,
	{ id }: ListRUMSessionsPathParameters,
	params?: ListRUMSessionsParams,
	options?: InvalidateOptions,
): Promise<QueryClient> => {
	await queryClient.invalidateQueries(
		{ queryKey: getListRUMSessionsQueryKey({ id }, params) },
		options,
	);

	return queryClient;
};

/**
 * Returns a session's timeline: its views in order, each with the requests, clicks, actions, errors and vitals that happened on it. Requests carry their trace id and whether backend spans share the trace. Defaults to the last 24 hours; ranges are at most 31 days. release is ignored, since a session can span releases; environment filters on deployment.environment.name.
 * @summary Get RUM session
 */
export const getRUMSession = (
	{ id, sessionId }: GetRUMSessionPathParameters,
	params?: GetRUMSessionParams,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<GetRUMSession200>({
		url: `/api/v1/rum/applications/${id}/sessions/${sessionId}`,
		method: 'GET',
		params,
		signal,
	});
};

export const getGetRUMSessionQueryKey = (
	{ id, sessionId }: GetRUMSessionPathParameters,
	params?: GetRUMSessionParams,
) => {
	return [
		`/api/v1/rum/applications/${id}/sessions/${sessionId}`,
		...(params ? [params] : []),
	] as const;
};

export const getGetRUMSessionQueryOptions = <
	TData = Awaited<ReturnType<typeof getRUMSession>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id, sessionId }: GetRUMSessionPathParameters,
	params?: GetRUMSessionParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof getRUMSession>>,
			TError,
			TData
		>;
	},
) => {
	const { query: queryOptions } = options ?? {};

	const queryKey =
		queryOptions?.queryKey ?? getGetRUMSessionQueryKey({ id, sessionId }, params);

	const queryFn: QueryFunction<Awaited<ReturnType<typeof getRUMSession>>> = ({
		signal,
	}) => getRUMSession({ id, sessionId }, params, signal);

	return {
		queryKey,
		queryFn,
		enabled:
			id !== null &&
			id !== undefined &&
			sessionId !== null &&
			sessionId !== undefined,
		...queryOptions,
	} as UseQueryOptions<
		Awaited<ReturnType<typeof getRUMSession>>,
		TError,
		TData
	> & { queryKey: QueryKey };
};

export type GetRUMSessionQueryResult = NonNullable<
	Awaited<ReturnType<typeof getRUMSession>>
>;
export type GetRUMSessionQueryError = ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Get RUM session
 */

export function useGetRUMSession<
	TData = Awaited<ReturnType<typeof getRUMSession>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id, sessionId }: GetRUMSessionPathParameters,
	params?: GetRUMSessionParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof getRUMSession>>,
			TError,
			TData
		>;
	},
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
	const queryOptions = getGetRUMSessionQueryOptions(
		{ id, sessionId },
		params,
		options,
	);

	const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
		queryKey: QueryKey;
	};

	return withQueryKey(query, queryOptions.queryKey);
}

/**
 * @summary Get RUM session
 */
export const invalidateGetRUMSession = async (
	queryClient: QueryClient,
	{ id, sessionId }: GetRUMSessionPathParameters,
	params?: GetRUMSessionParams,
	options?: InvalidateOptions,
): Promise<QueryClient> => {
	await queryClient.invalidateQueries(
		{ queryKey: getGetRUMSessionQueryKey({ id, sessionId }, params) },
		options,
	);

	return queryClient;
};

/**
 * Deletes every source map of the release. Its events are kept and show minified frames again.
 * @summary Delete RUM source maps of a release
 */
export const deleteRUMSourceMaps = (
	{ id }: DeleteRUMSourceMapsPathParameters,
	params: DeleteRUMSourceMapsParams,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<void>({
		url: `/api/v1/rum/applications/${id}/sourcemaps`,
		method: 'DELETE',
		params,
		signal,
	});
};

export const getDeleteRUMSourceMapsMutationOptions = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof deleteRUMSourceMaps>>,
		TError,
		{
			pathParams: DeleteRUMSourceMapsPathParameters;
			params: DeleteRUMSourceMapsParams;
		},
		TContext
	>;
}): UseMutationOptions<
	Awaited<ReturnType<typeof deleteRUMSourceMaps>>,
	TError,
	{
		pathParams: DeleteRUMSourceMapsPathParameters;
		params: DeleteRUMSourceMapsParams;
	},
	TContext
> => {
	const mutationKey = ['deleteRUMSourceMaps'];
	const { mutation: mutationOptions } = options
		? options.mutation &&
			'mutationKey' in options.mutation &&
			options.mutation.mutationKey
			? options
			: { ...options, mutation: { ...options.mutation, mutationKey } }
		: { mutation: { mutationKey } };

	const mutationFn: MutationFunction<
		Awaited<ReturnType<typeof deleteRUMSourceMaps>>,
		{
			pathParams: DeleteRUMSourceMapsPathParameters;
			params: DeleteRUMSourceMapsParams;
		}
	> = (props) => {
		const { pathParams, params } = props ?? {};

		return deleteRUMSourceMaps(pathParams, params);
	};

	return { mutationFn, ...mutationOptions };
};

export type DeleteRUMSourceMapsMutationResult = NonNullable<
	Awaited<ReturnType<typeof deleteRUMSourceMaps>>
>;

export type DeleteRUMSourceMapsMutationError =
	ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Delete RUM source maps of a release
 */
export const useDeleteRUMSourceMaps = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof deleteRUMSourceMaps>>,
		TError,
		{
			pathParams: DeleteRUMSourceMapsPathParameters;
			params: DeleteRUMSourceMapsParams;
		},
		TContext
	>;
}): UseMutationResult<
	Awaited<ReturnType<typeof deleteRUMSourceMaps>>,
	TError,
	{
		pathParams: DeleteRUMSourceMapsPathParameters;
		params: DeleteRUMSourceMapsParams;
	},
	TContext
> => {
	return useMutation(getDeleteRUMSourceMapsMutationOptions(options));
};
/**
 * Returns the application's releases with source maps or R8 mappings, newest upload first, with their size, uploader, last use and expiry, plus the storage used, the limits and the retention settings. With release, returns that release and its files.
 * @summary List RUM source maps
 */
export const listRUMSourceMaps = (
	{ id }: ListRUMSourceMapsPathParameters,
	params?: ListRUMSourceMapsParams,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<ListRUMSourceMaps200>({
		url: `/api/v1/rum/applications/${id}/sourcemaps`,
		method: 'GET',
		params,
		signal,
	});
};

export const getListRUMSourceMapsQueryKey = (
	{ id }: ListRUMSourceMapsPathParameters,
	params?: ListRUMSourceMapsParams,
) => {
	return [
		`/api/v1/rum/applications/${id}/sourcemaps`,
		...(params ? [params] : []),
	] as const;
};

export const getListRUMSourceMapsQueryOptions = <
	TData = Awaited<ReturnType<typeof listRUMSourceMaps>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: ListRUMSourceMapsPathParameters,
	params?: ListRUMSourceMapsParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof listRUMSourceMaps>>,
			TError,
			TData
		>;
	},
) => {
	const { query: queryOptions } = options ?? {};

	const queryKey =
		queryOptions?.queryKey ?? getListRUMSourceMapsQueryKey({ id }, params);

	const queryFn: QueryFunction<
		Awaited<ReturnType<typeof listRUMSourceMaps>>
	> = ({ signal }) => listRUMSourceMaps({ id }, params, signal);

	return {
		queryKey,
		queryFn,
		enabled: id !== null && id !== undefined,
		...queryOptions,
	} as UseQueryOptions<
		Awaited<ReturnType<typeof listRUMSourceMaps>>,
		TError,
		TData
	> & { queryKey: QueryKey };
};

export type ListRUMSourceMapsQueryResult = NonNullable<
	Awaited<ReturnType<typeof listRUMSourceMaps>>
>;
export type ListRUMSourceMapsQueryError = ErrorType<RenderErrorResponseDTO>;

/**
 * @summary List RUM source maps
 */

export function useListRUMSourceMaps<
	TData = Awaited<ReturnType<typeof listRUMSourceMaps>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: ListRUMSourceMapsPathParameters,
	params?: ListRUMSourceMapsParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof listRUMSourceMaps>>,
			TError,
			TData
		>;
	},
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
	const queryOptions = getListRUMSourceMapsQueryOptions({ id }, params, options);

	const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
		queryKey: QueryKey;
	};

	return withQueryKey(query, queryOptions.queryKey);
}

/**
 * @summary List RUM source maps
 */
export const invalidateListRUMSourceMaps = async (
	queryClient: QueryClient,
	{ id }: ListRUMSourceMapsPathParameters,
	params?: ListRUMSourceMapsParams,
	options?: InvalidateOptions,
): Promise<QueryClient> => {
	await queryClient.invalidateQueries(
		{ queryKey: getListRUMSourceMapsQueryKey({ id }, params) },
		options,
	);

	return queryClient;
};

/**
 * Stores source maps for a release, from multipart/form-data: each part named by the URL path its map is served from (e.g. /assets/index-abc.js.map) is a map; a part named file uses its filename as that path instead. The map matches the bundle at its path without .map, or a bundle served under a prefix. An optional debug_ids field maps URL paths to debug IDs. release comes from the query, or from a release field before the first map. A map replaces the release's map with the same path. A map that is not version 3 JSON, empty or larger than the file limit (50 MB by default) is returned in rejected and the others are stored. More than 1,000 maps in the release (400) or more than the application's quota, 2 GB by default (413), stores nothing. Use an API key with the Editor role in SigNoz-Api-Key; the public RUM key is not accepted.
 * @summary Upload RUM source maps
 */
export const uploadRUMSourceMaps = (
	{ id }: UploadRUMSourceMapsPathParameters,
	params: UploadRUMSourceMapsParams,
	formDataRumtypesPostableSourceMapsDTO?: BodyType<FormDataRumtypesPostableSourceMapsDTO>,
	signal?: AbortSignal,
) => {
	const formData = new FormData();
	if (formDataRumtypesPostableSourceMapsDTO?.debug_ids !== undefined) {
		formData.append(`debug_ids`, formDataRumtypesPostableSourceMapsDTO.debug_ids);
	}
	if (formDataRumtypesPostableSourceMapsDTO?.file !== undefined) {
		formData.append(`file`, formDataRumtypesPostableSourceMapsDTO.file);
	}

	return GeneratedAPIInstance<UploadRUMSourceMaps201>({
		url: `/api/v1/rum/applications/${id}/sourcemaps`,
		method: 'POST',
		headers: { 'Content-Type': 'multipart/form-data' },
		data: formData,
		params,
		signal,
	});
};

export const getUploadRUMSourceMapsMutationOptions = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof uploadRUMSourceMaps>>,
		TError,
		{
			pathParams: UploadRUMSourceMapsPathParameters;
			params: UploadRUMSourceMapsParams;
			data?: BodyType<FormDataRumtypesPostableSourceMapsDTO>;
		},
		TContext
	>;
}): UseMutationOptions<
	Awaited<ReturnType<typeof uploadRUMSourceMaps>>,
	TError,
	{
		pathParams: UploadRUMSourceMapsPathParameters;
		params: UploadRUMSourceMapsParams;
		data?: BodyType<FormDataRumtypesPostableSourceMapsDTO>;
	},
	TContext
> => {
	const mutationKey = ['uploadRUMSourceMaps'];
	const { mutation: mutationOptions } = options
		? options.mutation &&
			'mutationKey' in options.mutation &&
			options.mutation.mutationKey
			? options
			: { ...options, mutation: { ...options.mutation, mutationKey } }
		: { mutation: { mutationKey } };

	const mutationFn: MutationFunction<
		Awaited<ReturnType<typeof uploadRUMSourceMaps>>,
		{
			pathParams: UploadRUMSourceMapsPathParameters;
			params: UploadRUMSourceMapsParams;
			data?: BodyType<FormDataRumtypesPostableSourceMapsDTO>;
		}
	> = (props) => {
		const { pathParams, params, data } = props ?? {};

		return uploadRUMSourceMaps(pathParams, params, data);
	};

	return { mutationFn, ...mutationOptions };
};

export type UploadRUMSourceMapsMutationResult = NonNullable<
	Awaited<ReturnType<typeof uploadRUMSourceMaps>>
>;
export type UploadRUMSourceMapsMutationBody =
	| BodyType<FormDataRumtypesPostableSourceMapsDTO>
	| undefined;
export type UploadRUMSourceMapsMutationError =
	ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Upload RUM source maps
 */
export const useUploadRUMSourceMaps = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof uploadRUMSourceMaps>>,
		TError,
		{
			pathParams: UploadRUMSourceMapsPathParameters;
			params: UploadRUMSourceMapsParams;
			data?: BodyType<FormDataRumtypesPostableSourceMapsDTO>;
		},
		TContext
	>;
}): UseMutationResult<
	Awaited<ReturnType<typeof uploadRUMSourceMaps>>,
	TError,
	{
		pathParams: UploadRUMSourceMapsPathParameters;
		params: UploadRUMSourceMapsParams;
		data?: BodyType<FormDataRumtypesPostableSourceMapsDTO>;
	},
	TContext
> => {
	return useMutation(getUploadRUMSourceMapsMutationOptions(options));
};
/**
 * Deletes one source map file.
 * @summary Delete RUM source map
 */
export const deleteRUMSourceMap = (
	{ id, fileId }: DeleteRUMSourceMapPathParameters,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<void>({
		url: `/api/v1/rum/applications/${id}/sourcemaps/${fileId}`,
		method: 'DELETE',
		signal,
	});
};

export const getDeleteRUMSourceMapMutationOptions = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof deleteRUMSourceMap>>,
		TError,
		{ pathParams: DeleteRUMSourceMapPathParameters },
		TContext
	>;
}): UseMutationOptions<
	Awaited<ReturnType<typeof deleteRUMSourceMap>>,
	TError,
	{ pathParams: DeleteRUMSourceMapPathParameters },
	TContext
> => {
	const mutationKey = ['deleteRUMSourceMap'];
	const { mutation: mutationOptions } = options
		? options.mutation &&
			'mutationKey' in options.mutation &&
			options.mutation.mutationKey
			? options
			: { ...options, mutation: { ...options.mutation, mutationKey } }
		: { mutation: { mutationKey } };

	const mutationFn: MutationFunction<
		Awaited<ReturnType<typeof deleteRUMSourceMap>>,
		{ pathParams: DeleteRUMSourceMapPathParameters }
	> = (props) => {
		const { pathParams } = props ?? {};

		return deleteRUMSourceMap(pathParams);
	};

	return { mutationFn, ...mutationOptions };
};

export type DeleteRUMSourceMapMutationResult = NonNullable<
	Awaited<ReturnType<typeof deleteRUMSourceMap>>
>;

export type DeleteRUMSourceMapMutationError = ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Delete RUM source map
 */
export const useDeleteRUMSourceMap = <
	TError = ErrorType<RenderErrorResponseDTO>,
	TContext = unknown,
>(options?: {
	mutation?: UseMutationOptions<
		Awaited<ReturnType<typeof deleteRUMSourceMap>>,
		TError,
		{ pathParams: DeleteRUMSourceMapPathParameters },
		TContext
	>;
}): UseMutationResult<
	Awaited<ReturnType<typeof deleteRUMSourceMap>>,
	TError,
	{ pathParams: DeleteRUMSourceMapPathParameters },
	TContext
> => {
	return useMutation(getDeleteRUMSourceMapMutationOptions(options));
};
/**
 * Returns what the gateway saw for the application over the last five minutes, the SDK versions this server supports and refused requests by reason. Counts are kept in memory by the server instance that answers.
 * @summary Get RUM application setup status
 */
export const getRUMApplicationStatus = (
	{ id }: GetRUMApplicationStatusPathParameters,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<GetRUMApplicationStatus200>({
		url: `/api/v1/rum/applications/${id}/status`,
		method: 'GET',
		signal,
	});
};

export const getGetRUMApplicationStatusQueryKey = ({
	id,
}: GetRUMApplicationStatusPathParameters) => {
	return [`/api/v1/rum/applications/${id}/status`] as const;
};

export const getGetRUMApplicationStatusQueryOptions = <
	TData = Awaited<ReturnType<typeof getRUMApplicationStatus>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: GetRUMApplicationStatusPathParameters,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof getRUMApplicationStatus>>,
			TError,
			TData
		>;
	},
) => {
	const { query: queryOptions } = options ?? {};

	const queryKey =
		queryOptions?.queryKey ?? getGetRUMApplicationStatusQueryKey({ id });

	const queryFn: QueryFunction<
		Awaited<ReturnType<typeof getRUMApplicationStatus>>
	> = ({ signal }) => getRUMApplicationStatus({ id }, signal);

	return {
		queryKey,
		queryFn,
		enabled: id !== null && id !== undefined,
		...queryOptions,
	} as UseQueryOptions<
		Awaited<ReturnType<typeof getRUMApplicationStatus>>,
		TError,
		TData
	> & { queryKey: QueryKey };
};

export type GetRUMApplicationStatusQueryResult = NonNullable<
	Awaited<ReturnType<typeof getRUMApplicationStatus>>
>;
export type GetRUMApplicationStatusQueryError =
	ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Get RUM application setup status
 */

export function useGetRUMApplicationStatus<
	TData = Awaited<ReturnType<typeof getRUMApplicationStatus>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: GetRUMApplicationStatusPathParameters,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof getRUMApplicationStatus>>,
			TError,
			TData
		>;
	},
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
	const queryOptions = getGetRUMApplicationStatusQueryOptions({ id }, options);

	const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
		queryKey: QueryKey;
	};

	return withQueryKey(query, queryOptions.queryKey);
}

/**
 * @summary Get RUM application setup status
 */
export const invalidateGetRUMApplicationStatus = async (
	queryClient: QueryClient,
	{ id }: GetRUMApplicationStatusPathParameters,
	options?: InvalidateOptions,
): Promise<QueryClient> => {
	await queryClient.invalidateQueries(
		{ queryKey: getGetRUMApplicationStatusQueryKey({ id }) },
		options,
	);

	return queryClient;
};

/**
 * Returns per route template the views by loading type, the median time on view, the p75 and rating split of lcp, inp and cls, the error count and the request template with the highest p75. Defaults to the last 24 hours; ranges are at most 31 days. release and environment filter on service.version and deployment.environment.name.
 * @summary List RUM views by route
 */
export const listRUMViews = (
	{ id }: ListRUMViewsPathParameters,
	params?: ListRUMViewsParams,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<ListRUMViews200>({
		url: `/api/v1/rum/applications/${id}/views`,
		method: 'GET',
		params,
		signal,
	});
};

export const getListRUMViewsQueryKey = (
	{ id }: ListRUMViewsPathParameters,
	params?: ListRUMViewsParams,
) => {
	return [
		`/api/v1/rum/applications/${id}/views`,
		...(params ? [params] : []),
	] as const;
};

export const getListRUMViewsQueryOptions = <
	TData = Awaited<ReturnType<typeof listRUMViews>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: ListRUMViewsPathParameters,
	params?: ListRUMViewsParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof listRUMViews>>,
			TError,
			TData
		>;
	},
) => {
	const { query: queryOptions } = options ?? {};

	const queryKey =
		queryOptions?.queryKey ?? getListRUMViewsQueryKey({ id }, params);

	const queryFn: QueryFunction<Awaited<ReturnType<typeof listRUMViews>>> = ({
		signal,
	}) => listRUMViews({ id }, params, signal);

	return {
		queryKey,
		queryFn,
		enabled: id !== null && id !== undefined,
		...queryOptions,
	} as UseQueryOptions<
		Awaited<ReturnType<typeof listRUMViews>>,
		TError,
		TData
	> & { queryKey: QueryKey };
};

export type ListRUMViewsQueryResult = NonNullable<
	Awaited<ReturnType<typeof listRUMViews>>
>;
export type ListRUMViewsQueryError = ErrorType<RenderErrorResponseDTO>;

/**
 * @summary List RUM views by route
 */

export function useListRUMViews<
	TData = Awaited<ReturnType<typeof listRUMViews>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id }: ListRUMViewsPathParameters,
	params?: ListRUMViewsParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof listRUMViews>>,
			TError,
			TData
		>;
	},
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
	const queryOptions = getListRUMViewsQueryOptions({ id }, params, options);

	const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
		queryKey: QueryKey;
	};

	return withQueryKey(query, queryOptions.queryKey);
}

/**
 * @summary List RUM views by route
 */
export const invalidateListRUMViews = async (
	queryClient: QueryClient,
	{ id }: ListRUMViewsPathParameters,
	params?: ListRUMViewsParams,
	options?: InvalidateOptions,
): Promise<QueryClient> => {
	await queryClient.invalidateQueries(
		{ queryKey: getListRUMViewsQueryKey({ id }, params) },
		options,
	);

	return queryClient;
};

/**
 * Returns one route template, percent-encoded in the path (/product/:id is %2Fproduct%2F%3Aid): vitals p75 per time bucket, releases, the slowest request templates with an example trace, browser and OS breakdowns with LCP p75 and the latest sessions on the route. A route without views in the range is not found. Defaults to the last 24 hours; ranges are at most 31 days. release and environment filter on service.version and deployment.environment.name.
 * @summary Get RUM view
 */
export const getRUMView = (
	{ id, route }: GetRUMViewPathParameters,
	params?: GetRUMViewParams,
	signal?: AbortSignal,
) => {
	return GeneratedAPIInstance<GetRUMView200>({
		url: `/api/v1/rum/applications/${id}/views/${route}`,
		method: 'GET',
		params,
		signal,
	});
};

export const getGetRUMViewQueryKey = (
	{ id, route }: GetRUMViewPathParameters,
	params?: GetRUMViewParams,
) => {
	return [
		`/api/v1/rum/applications/${id}/views/${route}`,
		...(params ? [params] : []),
	] as const;
};

export const getGetRUMViewQueryOptions = <
	TData = Awaited<ReturnType<typeof getRUMView>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id, route }: GetRUMViewPathParameters,
	params?: GetRUMViewParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof getRUMView>>,
			TError,
			TData
		>;
	},
) => {
	const { query: queryOptions } = options ?? {};

	const queryKey =
		queryOptions?.queryKey ?? getGetRUMViewQueryKey({ id, route }, params);

	const queryFn: QueryFunction<Awaited<ReturnType<typeof getRUMView>>> = ({
		signal,
	}) => getRUMView({ id, route }, params, signal);

	return {
		queryKey,
		queryFn,
		enabled:
			id !== null && id !== undefined && route !== null && route !== undefined,
		...queryOptions,
	} as UseQueryOptions<Awaited<ReturnType<typeof getRUMView>>, TError, TData> & {
		queryKey: QueryKey;
	};
};

export type GetRUMViewQueryResult = NonNullable<
	Awaited<ReturnType<typeof getRUMView>>
>;
export type GetRUMViewQueryError = ErrorType<RenderErrorResponseDTO>;

/**
 * @summary Get RUM view
 */

export function useGetRUMView<
	TData = Awaited<ReturnType<typeof getRUMView>>,
	TError = ErrorType<RenderErrorResponseDTO>,
>(
	{ id, route }: GetRUMViewPathParameters,
	params?: GetRUMViewParams,
	options?: {
		query?: UseQueryOptions<
			Awaited<ReturnType<typeof getRUMView>>,
			TError,
			TData
		>;
	},
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
	const queryOptions = getGetRUMViewQueryOptions({ id, route }, params, options);

	const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
		queryKey: QueryKey;
	};

	return withQueryKey(query, queryOptions.queryKey);
}

/**
 * @summary Get RUM view
 */
export const invalidateGetRUMView = async (
	queryClient: QueryClient,
	{ id, route }: GetRUMViewPathParameters,
	params?: GetRUMViewParams,
	options?: InvalidateOptions,
): Promise<QueryClient> => {
	await queryClient.invalidateQueries(
		{ queryKey: getGetRUMViewQueryKey({ id, route }, params) },
		options,
	);

	return queryClient;
};
