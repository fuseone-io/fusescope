import { useMemo } from 'react';
import { Form, Input, Select } from 'antd';
import FormSheet from 'components/Alerts/FormSheet/FormSheet';
import { Button } from 'components/ui/button';
import { Check, Loader2, X } from 'lucide-react';

import ChannelsNotFound from './ChannelsNotFound';
import { INITIAL_ROUTING_POLICY_DETAILS_FORM_STATE } from './constants';
import {
	RoutingPolicyDetailsFormState,
	RoutingPolicyDetailsProps,
} from './types';

const FORM_NAME = 'routing-policy-form';

function RoutingPolicyDetails({
	closeModal,
	mode,
	channels,
	isErrorChannels,
	isLoadingChannels,
	routingPolicy,
	handlePolicyDetailsModalAction,
	isPolicyDetailsModalActionLoading,
	refreshChannels,
}: RoutingPolicyDetailsProps): JSX.Element {
	const [form] = Form.useForm();

	const initialFormState = useMemo(() => {
		if (mode === 'edit') {
			return {
				name: routingPolicy?.name || '',
				expression: routingPolicy?.expression || '',
				channels: routingPolicy?.channels || [],
				description: routingPolicy?.description || '',
			};
		}
		return INITIAL_ROUTING_POLICY_DETAILS_FORM_STATE;
	}, [routingPolicy, mode]);

	const modalTitle =
		mode === 'edit' ? 'Edit routing policy' : 'Create routing policy';

	const handleSave = (): void => {
		handlePolicyDetailsModalAction(mode, {
			name: form.getFieldValue('name'),
			expression: form.getFieldValue('expression'),
			channels: form.getFieldValue('channels'),
			description: form.getFieldValue('description'),
		});
	};

	return (
		<FormSheet
			open
			onClose={closeModal}
			title={modalTitle}
			description="Send alerts whose labels match the expression to these channels."
			testId="routing-policy-form-sheet"
			closeOnOutsideClick={false}
			footer={
				<>
					<Button
						variant="outline"
						onClick={closeModal}
						disabled={isPolicyDetailsModalActionLoading}
					>
						<X aria-hidden="true" />
						Cancel
					</Button>
					<Button
						type="submit"
						form={FORM_NAME}
						disabled={isPolicyDetailsModalActionLoading}
						aria-busy={isPolicyDetailsModalActionLoading}
					>
						{isPolicyDetailsModalActionLoading ? (
							<Loader2 aria-hidden="true" className="tw:animate-spin" />
						) : (
							<Check aria-hidden="true" />
						)}
						<span className="translate-safe">Save Routing Policy</span>
					</Button>
				</>
			}
		>
			<Form<RoutingPolicyDetailsFormState>
				name={FORM_NAME}
				form={form}
				layout="vertical"
				initialValues={initialFormState}
				onFinish={handleSave}
			>
				<Form.Item
					label="Routing Policy Name"
					name="name"
					rules={[
						{
							required: true,
							message: 'Please provide a name for the routing policy',
						},
					]}
				>
					<Input placeholder="e.g. Base routing policy..." />
				</Form.Item>
				<Form.Item
					label="Description"
					name="description"
					rules={[
						{
							required: false,
						},
					]}
				>
					<Input.TextArea
						placeholder="e.g. This is a routing policy that..."
						autoSize={{ minRows: 1, maxRows: 6 }}
						style={{ resize: 'none' }}
					/>
				</Form.Item>
				<Form.Item
					label="Expression"
					name="expression"
					rules={[
						{
							required: true,
							message: 'Please provide an expression for the routing policy',
						},
					]}
				>
					<Input.TextArea
						placeholder='e.g. service.name == "payment" && threshold.name == "critical"'
						autoSize={{ minRows: 1, maxRows: 6 }}
						style={{ resize: 'none' }}
						className="tw:font-mono! tw:[font-variant-ligatures:none]"
					/>
				</Form.Item>
				<Form.Item
					label="Notification Channels"
					name="channels"
					rules={[
						{
							required: true,
							message: 'Please select at least one notification channel',
						},
					]}
				>
					<Select
						options={channels.map((channel) => ({
							value: channel.name,
							label: channel.name,
						}))}
						mode="multiple"
						placeholder="Select notification channels"
						showSearch
						maxTagCount={3}
						maxTagPlaceholder={(omittedValues): string =>
							`+${omittedValues.length} more`
						}
						maxTagTextLength={10}
						filterOption={(input, option): boolean =>
							option?.label?.toLowerCase().includes(input.toLowerCase()) || false
						}
						status={isErrorChannels ? 'error' : undefined}
						disabled={isLoadingChannels}
						notFoundContent={<ChannelsNotFound refreshChannels={refreshChannels} />}
					/>
				</Form.Item>
			</Form>
		</FormSheet>
	);
}

export default RoutingPolicyDetails;
