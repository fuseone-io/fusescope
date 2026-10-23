import { renderHook } from '@testing-library/react';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { openInNewTab } from 'utils/navigation';

import {
	KAFKA_SETUP_DOC_LINKS,
	MessagingQueueHealthCheckService,
} from '../MessagingQueuesUtils';
import { useKafkaSetupRedirect } from '../useKafkaSetupRedirect';

const mockPush = jest.fn();

jest.mock('react-router-dom', () => ({
	...jest.requireActual('react-router-dom'),
	useHistory: (): { push: jest.Mock } => ({ push: mockPush }),
}));
jest.mock('hooks/useGetTenantLicense', () => ({
	useGetTenantLicense: jest.fn(),
}));
jest.mock('utils/navigation', () => ({ openInNewTab: jest.fn() }));

describe('useKafkaSetupRedirect', () => {
	it.each([true, false])(
		'opens the Kafka setup docs (cloud: %s)',
		(isCloudUser) => {
			jest.mocked(useGetTenantLicense).mockReturnValue({
				isCloudUser,
				isEnterpriseSelfHostedUser: false,
				isCommunityUser: !isCloudUser,
				isCommunityEnterpriseUser: false,
			});
			const { result } = renderHook(() => useKafkaSetupRedirect());

			result.current(MessagingQueueHealthCheckService.Kafka);

			expect(openInNewTab).toHaveBeenCalledWith(
				KAFKA_SETUP_DOC_LINKS[MessagingQueueHealthCheckService.Kafka],
			);
			expect(mockPush).not.toHaveBeenCalled();
		},
	);
});
