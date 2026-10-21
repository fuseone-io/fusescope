import setRetentionApi from 'api/settings/setRetention';
import setRetentionApiV2 from 'api/settings/setRetentionV2';
import { fireEvent, render, screen, waitFor } from 'tests/test-utils';
import { IDiskType } from 'types/api/disks/getDisks';
import { TTTLType } from 'types/api/settings/common';

import GeneralSettings from '../GeneralSettings';

jest.mock('api/settings/setRetention');
jest.mock('api/settings/setRetentionV2');

jest.mock('hooks/useNotifications', () => ({
	useNotifications: (): unknown => ({
		notifications: { error: jest.fn(), success: jest.fn() },
	}),
}));

jest.mock('hooks/useComponentPermission', () => ({
	__esModule: true,
	default: jest.fn(() => [true]),
}));

jest.mock('hooks/useGetTenantLicense', () => ({
	useGetTenantLicense: jest.fn(() => ({ isCloudUser: false })),
}));

const localDisks: IDiskType[] = [{ name: 'default', type: 'local' }];
const s3Disks: IDiskType[] = [{ name: 'default', type: 's3' }];

function renderSettings(disks: IDiskType[]): void {
	render(
		<GeneralSettings
			metricsTtlValuesPayload={{
				metrics_ttl_duration_hrs: 168,
				metrics_move_ttl_duration_hrs: -1,
				status: '',
			}}
			tracesTtlValuesPayload={{
				traces_ttl_duration_hrs: 168,
				traces_move_ttl_duration_hrs: -1,
				status: '',
			}}
			logsTtlValuesPayload={{
				version: 'v2',
				default_ttl_days: 15,
				cold_storage_ttl_days: -1,
				status: '',
			}}
			getAvailableDiskPayload={disks}
			metricsTtlValuesRefetch={jest.fn()}
			tracesTtlValuesRefetch={jest.fn()}
			logsTtlValuesRefetch={jest.fn()}
		/>,
	);
}

interface RetentionInput {
	field: 'total' | 's3';
	value: string;
	unit: 'hr' | 'day' | 'month';
}

interface PayloadCase {
	name: string;
	type: TTTLType;
	disks: IDiskType[];
	inputs: RetentionInput[];
	api: jest.Mock;
	payload: unknown;
}

const cases: PayloadCase[] = [
	{
		name: 'metrics total retention',
		type: 'metrics',
		disks: localDisks,
		inputs: [{ field: 'total', value: '30', unit: 'day' }],
		api: setRetentionApi as jest.Mock,
		payload: { type: 'metrics', totalDuration: '720h' },
	},
	{
		name: 'traces total and cold storage retention',
		type: 'traces',
		disks: s3Disks,
		inputs: [
			{ field: 'total', value: '30', unit: 'day' },
			{ field: 's3', value: '10', unit: 'day' },
		],
		api: setRetentionApi as jest.Mock,
		payload: {
			type: 'traces',
			totalDuration: '720h',
			coldStorage: 's3',
			toColdDuration: '240h',
		},
	},
	{
		name: 'logs total retention',
		type: 'logs',
		disks: localDisks,
		inputs: [{ field: 'total', value: '2', unit: 'month' }],
		api: setRetentionApiV2 as jest.Mock,
		payload: {
			type: 'logs',
			defaultTTLDays: 60,
			coldStorageVolume: '',
			coldStorageDurationDays: 0,
			ttlConditions: [],
		},
	},
];

describe('GeneralSettings retention payloads', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(setRetentionApi as jest.Mock).mockResolvedValue({ statusCode: 200 });
		(setRetentionApiV2 as jest.Mock).mockResolvedValue({ httpStatusCode: 200 });
	});

	it.each(cases)(
		'saves $name after confirmation',
		async ({ type, disks, inputs, api, payload }) => {
			renderSettings(disks);

			inputs.forEach(({ field, value, unit }) => {
				fireEvent.change(screen.getByTestId(`retention-${type}-${field}-unit`), {
					target: { value: unit },
				});
				fireEvent.change(screen.getByTestId(`retention-${type}-${field}-input`), {
					target: { value },
				});
			});

			const save = screen.getByTestId(`retention-${type}-save`);
			await waitFor(() => expect(save).toBeEnabled());
			fireEvent.click(save);

			fireEvent.click(await screen.findByTestId('retention-confirm-ok'));

			await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
			expect(api).toHaveBeenCalledWith(payload);
		},
	);

	it('does not save when the confirmation is cancelled', async () => {
		renderSettings(localDisks);

		fireEvent.change(screen.getByTestId('retention-metrics-total-input'), {
			target: { value: '9' },
		});
		fireEvent.click(screen.getByTestId('retention-metrics-save'));
		fireEvent.click(await screen.findByTestId('retention-confirm-cancel'));

		await waitFor(() =>
			expect(screen.queryByTestId('retention-confirm-ok')).not.toBeInTheDocument(),
		);
		expect(setRetentionApi).not.toHaveBeenCalled();
	});
});
