import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@signozhq/ui/input';
import { Button, Form } from 'antd';
import { activateLicense } from 'api/generated/services/licenses';
import { useNotifications } from 'hooks/useNotifications';
import { toAPIError } from 'utils/errorUtils';
import { requireErrorMessage } from 'utils/form/requireErrorMessage';

function ApplyLicenseForm({
	licenseRefetch,
}: ApplyLicenseFormProps): JSX.Element {
	const { t } = useTranslation(['licenses']);
	const [isLoading, setIsLoading] = useState(false);
	const [form] = Form.useForm<FormValues>();

	const { notifications } = useNotifications();
	const key = Form.useWatch('key', form);

	const isDisabled = isLoading || !key;

	const onFinish = async (values: unknown): Promise<void> => {
		const params = values as { key: string };
		if (params.key === '' || !params.key) {
			notifications.error({
				message: 'Error',
				description: t('enter_license_key'),
			});
			return;
		}

		setIsLoading(true);
		try {
			await activateLicense({
				key: params.key,
			});
			licenseRefetch();
			notifications.success({
				message: 'Success',
				description: t('license_applied'),
			});
		} catch (e) {
			const apiError = toAPIError(e as Parameters<typeof toAPIError>[0]);
			notifications.error({
				message: apiError.getErrorCode(),
				description: apiError.getErrorMessage(),
			});
		}
		setIsLoading(false);
	};

	return (
		<div className="tw:flex tw:flex-col tw:gap-2 tw:px-5 tw:py-4">
			<Form
				form={form}
				layout="inline"
				onFinish={onFinish}
				autoComplete="off"
				className="tw:w-full"
			>
				<Form.Item
					name="key"
					rules={[{ required: true, message: requireErrorMessage('License Key') }]}
					className="tw:w-full tw:max-w-[420px]"
				>
					<Input placeholder={t('placeholder_license_key')} />
				</Form.Item>
				<Form.Item>
					<Button
						loading={isLoading}
						disabled={isDisabled}
						type="primary"
						htmlType="submit"
					>
						{t('button_apply')}
					</Button>
				</Form.Item>
			</Form>
			{key && (
				<div className="tw:font-mono tw:text-xs tw:break-all tw:text-muted-foreground">
					{key}
				</div>
			)}
		</div>
	);
}

interface ApplyLicenseFormProps {
	licenseRefetch: () => void;
}

interface FormValues {
	key: string;
}

export default ApplyLicenseForm;
