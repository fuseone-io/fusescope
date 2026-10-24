import setRetentionApiV2 from 'api/settings/setRetentionV2';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { fireEvent, render, screen, waitFor } from 'tests/test-utils';
import { IDiskType } from 'types/api/disks/getDisks';
import {
	PayloadPropsLogs,
	PayloadPropsMetrics,
	PayloadPropsTraces,
} from 'types/api/settings/getRetention';

import GeneralSettings from '../GeneralSettings';

// Mock dependencies
jest.mock('api/settings/setRetentionV2');

const mockNotifications = {
	error: jest.fn(),
	success: jest.fn(),
};

jest.mock('hooks/useNotifications', () => ({
	useNotifications: (): { notifications: typeof mockNotifications } => ({
		notifications: mockNotifications,
	}),
}));

jest.mock('hooks/useComponentPermission', () => ({
	__esModule: true,
	default: jest.fn(() => [true]),
}));

jest.mock('hooks/useGetTenantLicense', () => ({
	useGetTenantLicense: jest.fn(() => ({
		isCloudUser: false,
	})),
}));

jest.mock('container/GeneralSettingsCloud', () => ({
	__esModule: true,
	default: (): JSX.Element => <div data-testid="general-settings-cloud" />,
}));

jest.mock('container/CustomDomainSettings', () => ({
	__esModule: true,
	default: (): JSX.Element => <div data-testid="custom-domain-settings" />,
}));

// Mock data
const mockMetricsRetention: PayloadPropsMetrics = {
	metrics_ttl_duration_hrs: 168,
	metrics_move_ttl_duration_hrs: -1,
	status: '',
};

const mockTracesRetention: PayloadPropsTraces = {
	traces_ttl_duration_hrs: 168,
	traces_move_ttl_duration_hrs: -1,
	status: '',
};

const mockLogsRetentionWithS3: PayloadPropsLogs = {
	version: 'v2',
	default_ttl_days: 30,
	cold_storage_ttl_days: 24,
	status: '',
};

const mockLogsRetentionWithoutS3: PayloadPropsLogs = {
	version: 'v2',
	default_ttl_days: 30,
	cold_storage_ttl_days: -1,
	status: '',
};

const mockDisksWithS3: IDiskType[] = [
	{
		name: 'default',
		type: 's3',
	},
];

const mockDisksWithObjectStorage: IDiskType[] = [
	{
		name: 'default',
		type: 'ObjectStorage',
	},
];

const mockDisksWithoutS3: IDiskType[] = [
	{
		name: 'default',
		type: 'local',
	},
];

const getLogsRow = (): HTMLElement => {
	const logsLabel = screen.getByText('Logs');
	return logsLabel.closest('.retention-row') as HTMLElement;
};

describe('GeneralSettings - S3 Logs Retention', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(setRetentionApiV2 as jest.Mock).mockResolvedValue({
			httpStatusCode: 200,
			data: { message: 'success' },
		});
	});

	describe('Test 1: S3 Enabled - Only Days in Dropdown', () => {
		it('should show only Days option for S3 retention and send correct API payload', async () => {
			render(
				<GeneralSettings
					metricsTtlValuesPayload={mockMetricsRetention}
					tracesTtlValuesPayload={mockTracesRetention}
					logsTtlValuesPayload={mockLogsRetentionWithS3}
					getAvailableDiskPayload={mockDisksWithS3}
					metricsTtlValuesRefetch={jest.fn()}
					tracesTtlValuesRefetch={jest.fn()}
					logsTtlValuesRefetch={jest.fn()}
				/>,
			);

			const logsRow = getLogsRow();
			expect(logsRow).toBeInTheDocument();

			// Find all inputs in the Logs row - there should be 2 (total retention + S3)
			const inputs = logsRow.querySelectorAll('input[type="number"]');
			expect(inputs).toHaveLength(2);

			// The second input is the S3 retention field
			const s3Input = inputs[1] as HTMLInputElement;

			// The S3 unit select offers only Days
			const s3Dropdown = screen.getByTestId('retention-logs-s3-unit');
			const dropdownOptions = s3Dropdown.querySelectorAll('option');
			expect(dropdownOptions).toHaveLength(1);
			expect(dropdownOptions[0]).toHaveTextContent('Days');

			// Change S3 retention value to 5 days
			fireEvent.change(s3Input, { target: { value: '5' } });

			const saveButton = screen.getByTestId('retention-logs-save');
			await waitFor(() => {
				expect(saveButton).toBeEnabled();
			});

			fireEvent.click(saveButton);

			// Wait for modal to appear
			const modal = await screen.findByRole('dialog');
			expect(modal).toBeInTheDocument();

			// Click OK button
			const okButton = await screen.findByRole('button', { name: /ok/i });
			fireEvent.click(okButton);

			// Verify API was called with correct payload
			await waitFor(() => {
				expect(setRetentionApiV2).toHaveBeenCalledWith({
					type: 'logs',
					defaultTTLDays: 30,
					coldStorageVolume: 's3',
					coldStorageDurationDays: 5,
					ttlConditions: [],
				});
			});
		});

		it('should recognize ObjectStorage disk type as S3 enabled', async () => {
			render(
				<GeneralSettings
					metricsTtlValuesPayload={mockMetricsRetention}
					tracesTtlValuesPayload={mockTracesRetention}
					logsTtlValuesPayload={mockLogsRetentionWithS3}
					getAvailableDiskPayload={mockDisksWithObjectStorage}
					metricsTtlValuesRefetch={jest.fn()}
					tracesTtlValuesRefetch={jest.fn()}
					logsTtlValuesRefetch={jest.fn()}
				/>,
			);

			// Verify S3 field is visible
			const logsRow = getLogsRow();
			const inputs = logsRow.querySelectorAll('input[type="number"]');
			expect(inputs).toHaveLength(2); // Total + S3
		});
	});

	describe('Test 2: No object storage disk - Field Disabled', () => {
		it('should disable the cold storage field, link the docs and send empty S3 values to API', async () => {
			render(
				<GeneralSettings
					metricsTtlValuesPayload={mockMetricsRetention}
					tracesTtlValuesPayload={mockTracesRetention}
					logsTtlValuesPayload={mockLogsRetentionWithoutS3}
					getAvailableDiskPayload={mockDisksWithoutS3}
					metricsTtlValuesRefetch={jest.fn()}
					tracesTtlValuesRefetch={jest.fn()}
					logsTtlValuesRefetch={jest.fn()}
				/>,
			);

			const logsRow = getLogsRow();
			expect(logsRow).toBeInTheDocument();

			(['metrics', 'traces', 'logs'] as const).forEach((type) => {
				expect(screen.getByTestId(`retention-${type}-s3-input`)).toBeDisabled();
				expect(screen.getByTestId(`retention-${type}-s3-unit`)).toBeDisabled();
			});

			const hint = screen.getByTestId('retention-object-storage-hint');
			expect(hint).toHaveTextContent('object_storage_missing');
			expect(hint.querySelector('a')).toHaveAttribute(
				'href',
				expect.stringContaining('/administration/retention/#cold-storage'),
			);
			expect(
				screen.queryByTestId('retention-object-storage-note'),
			).not.toBeInTheDocument();

			const totalInput = screen.getByTestId('retention-logs-total-input');

			// First, change the dropdown to Days (it defaults to Months)
			fireEvent.change(screen.getByTestId('retention-logs-total-unit'), {
				target: { value: 'day' },
			});

			// Now change the value
			fireEvent.change(totalInput, { target: { value: '60' } });

			const saveButton = screen.getByTestId('retention-logs-save');
			await waitFor(() => {
				expect(saveButton).toBeEnabled();
			});

			// Click save button
			fireEvent.click(saveButton);

			// Wait for modal to appear
			const okButton = await screen.findByRole('button', { name: /ok/i });
			expect(okButton).toBeInTheDocument();

			// Click OK button
			fireEvent.click(okButton);

			// Verify API was called with empty S3 values (60 days)
			await waitFor(() => {
				expect(setRetentionApiV2).toHaveBeenCalledWith({
					type: 'logs',
					defaultTTLDays: 60,
					coldStorageVolume: '',
					coldStorageDurationDays: 0,
					ttlConditions: [],
				});
			});
		});

		it('should not send a cold volume for a saved logs move period once the disk is gone', async () => {
			render(
				<GeneralSettings
					metricsTtlValuesPayload={mockMetricsRetention}
					tracesTtlValuesPayload={mockTracesRetention}
					logsTtlValuesPayload={mockLogsRetentionWithS3}
					getAvailableDiskPayload={mockDisksWithoutS3}
					metricsTtlValuesRefetch={jest.fn()}
					tracesTtlValuesRefetch={jest.fn()}
					logsTtlValuesRefetch={jest.fn()}
				/>,
			);

			fireEvent.change(screen.getByTestId('retention-logs-total-input'), {
				target: { value: '2' },
			});

			const saveButton = screen.getByTestId('retention-logs-save');
			await waitFor(() => {
				expect(saveButton).toBeEnabled();
			});
			fireEvent.click(saveButton);
			fireEvent.click(await screen.findByRole('button', { name: /ok/i }));

			await waitFor(() => {
				expect(setRetentionApiV2).toHaveBeenCalledWith({
					type: 'logs',
					defaultTTLDays: 60,
					coldStorageVolume: '',
					coldStorageDurationDays: 0,
					ttlConditions: [],
				});
			});
		});
	});

	describe('Object storage wording', () => {
		it('should label the field for object storage and explain cold data', async () => {
			render(
				<GeneralSettings
					metricsTtlValuesPayload={mockMetricsRetention}
					tracesTtlValuesPayload={mockTracesRetention}
					logsTtlValuesPayload={mockLogsRetentionWithS3}
					getAvailableDiskPayload={mockDisksWithObjectStorage}
					metricsTtlValuesRefetch={jest.fn()}
					tracesTtlValuesRefetch={jest.fn()}
					logsTtlValuesRefetch={jest.fn()}
				/>,
			);

			expect(screen.getAllByText('move_to_object_storage')).toHaveLength(3);

			const note = screen.getByTestId('retention-object-storage-note');
			expect(note).toHaveTextContent('object_storage_note');
			expect(
				screen.queryByTestId('retention-object-storage-hint'),
			).not.toBeInTheDocument();

			fireEvent.focus(screen.getByTestId('retention-logs-s3-info'));
			await expect(screen.findByRole('tooltip')).resolves.toHaveTextContent(
				'object_storage_stores',
			);
		});
	});

	describe('Test 3: Save & Reload - Correct Display', () => {
		it('should display retention values correctly after converting from hours', () => {
			render(
				<GeneralSettings
					metricsTtlValuesPayload={mockMetricsRetention}
					tracesTtlValuesPayload={mockTracesRetention}
					logsTtlValuesPayload={mockLogsRetentionWithS3}
					getAvailableDiskPayload={mockDisksWithS3}
					metricsTtlValuesRefetch={jest.fn()}
					tracesTtlValuesRefetch={jest.fn()}
					logsTtlValuesRefetch={jest.fn()}
				/>,
			);

			const logsRow = getLogsRow();
			const inputs = logsRow.querySelectorAll('input[type="number"]');

			// Total retention: 30 days = 1 month (displays as 1 Month)
			const totalInput = inputs[0] as HTMLInputElement;
			expect(totalInput.value).toBe('1');

			// S3 retention: 24 days
			const s3Input = inputs[1] as HTMLInputElement;
			expect(s3Input.value).toBe('24');

			// Verify dropdowns: total shows Months, S3 shows Days
			expect(screen.getByTestId('retention-logs-total-unit')).toHaveValue('month');
			expect(screen.getByTestId('retention-logs-s3-unit')).toHaveValue('day');
		});
	});

	describe('Test 4: Save Button State with S3 Disabled', () => {
		it('should disable save button when cold_storage_ttl_days is -1 and no changes made', async () => {
			render(
				<GeneralSettings
					metricsTtlValuesPayload={mockMetricsRetention}
					tracesTtlValuesPayload={mockTracesRetention}
					logsTtlValuesPayload={mockLogsRetentionWithoutS3}
					getAvailableDiskPayload={mockDisksWithS3}
					metricsTtlValuesRefetch={jest.fn()}
					tracesTtlValuesRefetch={jest.fn()}
					logsTtlValuesRefetch={jest.fn()}
				/>,
			);

			const logsRow = getLogsRow();
			expect(logsRow).toBeInTheDocument();

			const saveButton = screen.getByTestId('retention-logs-save');

			// Verify save button is disabled on initial load
			expect(saveButton).toBeDisabled();

			// Find the total retention input
			const inputs = logsRow.querySelectorAll('input[type="number"]');
			const totalInput = inputs[0] as HTMLInputElement;

			// Change total retention value to trigger button enable
			fireEvent.change(totalInput, { target: { value: '60' } });

			// Button should now be enabled after change
			await waitFor(() => {
				expect(saveButton).toBeEnabled();
			});

			// Revert to original value (30 days displays as 1 Month)
			fireEvent.change(totalInput, { target: { value: '1' } });

			// Button should be disabled again (back to original state)
			await waitFor(() => {
				expect(saveButton).toBeDisabled();
			});
		});
	});

	describe('Cloud User Rendering', () => {
		beforeEach(() => {
			(useGetTenantLicense as jest.Mock).mockReturnValue({
				isCloudUser: true,
			});
		});

		it('should render CustomDomainSettings and GeneralSettingsCloud for cloud admin', () => {
			render(
				<GeneralSettings
					metricsTtlValuesPayload={mockMetricsRetention}
					tracesTtlValuesPayload={mockTracesRetention}
					logsTtlValuesPayload={mockLogsRetentionWithS3}
					getAvailableDiskPayload={mockDisksWithS3}
					metricsTtlValuesRefetch={jest.fn()}
					tracesTtlValuesRefetch={jest.fn()}
					logsTtlValuesRefetch={jest.fn()}
				/>,
			);

			expect(screen.getByTestId('custom-domain-settings')).toBeInTheDocument();
			expect(screen.getByTestId('general-settings-cloud')).toBeInTheDocument();
		});
	});

	describe('Non-cloud user rendering', () => {
		beforeEach(() => {
			(useGetTenantLicense as jest.Mock).mockReturnValue({
				isCloudUser: false,
			});
		});

		it('should not render CustomDomainSettings or GeneralSettingsCloud', () => {
			render(
				<GeneralSettings
					metricsTtlValuesPayload={mockMetricsRetention}
					tracesTtlValuesPayload={mockTracesRetention}
					logsTtlValuesPayload={mockLogsRetentionWithS3}
					getAvailableDiskPayload={mockDisksWithS3}
					metricsTtlValuesRefetch={jest.fn()}
					tracesTtlValuesRefetch={jest.fn()}
					logsTtlValuesRefetch={jest.fn()}
				/>,
			);

			expect(
				screen.queryByTestId('custom-domain-settings'),
			).not.toBeInTheDocument();
			expect(
				screen.queryByTestId('general-settings-cloud'),
			).not.toBeInTheDocument();

			// Save buttons should be visible for non-cloud users (these are from retentions)
			const saveButtons = screen.getAllByRole('button', { name: /save/i });
			expect(saveButtons.length).toBeGreaterThan(0);
		});
	});
});
