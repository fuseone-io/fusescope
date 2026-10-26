import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';
import { useGetRUMApplication } from 'api/generated/services/rum';

/** The application's platform, from the cached application; undefined while it loads. */
export function useApplicationPlatform(
	applicationId: string,
): RumtypesPlatformDTO | undefined {
	return useGetRUMApplication({ id: applicationId }).data?.data?.platform;
}
