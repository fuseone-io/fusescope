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
	GetRUMApplication200,
	GetRUMApplicationPathParameters,
	GetRUMApplicationStatus200,
	GetRUMApplicationStatusPathParameters,
	ListRUMApplicationKeys200,
	ListRUMApplicationKeysPathParameters,
	ListRUMApplications200,
	RenderErrorResponseDTO,
	RevokeRUMApplicationKeyPathParameters,
	RotateRUMApplicationKey201,
	RotateRUMApplicationKeyPathParameters,
	RumtypesPostableApplicationDTO,
	RumtypesPostableRotateApplicationKeyDTO,
	RumtypesUpdatableApplicationDTO,
	UpdateRUMApplication200,
	UpdateRUMApplicationPathParameters,
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
