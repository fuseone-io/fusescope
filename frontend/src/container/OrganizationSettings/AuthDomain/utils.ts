import { AuthtypesGettableAuthDomainDTO } from 'api/generated/services/fuseScope.schemas';

// Domains declared in the configuration file are reconciled from it and rejected by the API.
export const isManagedByConfig = (
	record: AuthtypesGettableAuthDomainDTO,
): boolean => record.managedBy === 'config';
