import { Input } from '@signozhq/ui/input';
import { Form } from 'antd';
import { CloudintegrationtypesCredentialsDTO } from 'api/generated/services/fuseScope.schemas';

function RenderConnectionFields({
	isConnectionParamsLoading,
	connectionParams,
	isFormDisabled,
}: {
	isConnectionParamsLoading?: boolean;
	connectionParams?: CloudintegrationtypesCredentialsDTO | null;
	isFormDisabled?: boolean;
}): JSX.Element | null {
	if (
		isConnectionParamsLoading ||
		(!!connectionParams?.ingestionUrl &&
			!!connectionParams?.ingestionKey &&
			!!connectionParams?.sigNozApiUrl &&
			!!connectionParams?.sigNozApiKey)
	) {
		return null;
	}

	return (
		<Form.Item name="connectionParams">
			{!connectionParams?.ingestionUrl && (
				<Form.Item
					name="ingestionUrl"
					label="Ingestion URL"
					rules={[{ required: true, message: 'Please enter ingestion URL' }]}
				>
					<Input placeholder="Enter ingestion URL" disabled={isFormDisabled} />
				</Form.Item>
			)}
			{!connectionParams?.ingestionKey && (
				<Form.Item
					name="ingestionKey"
					label="Ingestion Key"
					rules={[{ required: true, message: 'Please enter ingestion key' }]}
				>
					<Input placeholder="Enter ingestion key" disabled={isFormDisabled} />
				</Form.Item>
			)}
			{!connectionParams?.sigNozApiUrl && (
				<Form.Item
					name="sigNozApiUrl"
					label="FuseScope API URL"
					rules={[{ required: true, message: 'Please enter FuseScope API URL' }]}
				>
					<Input placeholder="Enter FuseScope API URL" disabled={isFormDisabled} />
				</Form.Item>
			)}
			{!connectionParams?.sigNozApiKey && (
				<Form.Item
					name="sigNozApiKey"
					label="FuseScope API KEY"
					rules={[{ required: true, message: 'Please enter FuseScope API Key' }]}
				>
					<Input placeholder="Enter FuseScope API Key" disabled={isFormDisabled} />
				</Form.Item>
			)}
		</Form.Item>
	);
}

RenderConnectionFields.defaultProps = {
	connectionParams: null,
	isFormDisabled: false,
	isConnectionParamsLoading: false,
};

export default RenderConnectionFields;
