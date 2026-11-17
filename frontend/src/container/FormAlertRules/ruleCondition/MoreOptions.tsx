import { useTranslation } from 'react-i18next';
import { Checkbox, Collapse, Form, InputNumber, Select, Space } from 'antd';
import { Typography } from '@signozhq/ui/typography';
import { defaultFrequency } from 'types/api/alerts/def';
import { popupContainer } from 'utils/selectPopupContainer';

import { InlineSelect, VerticalLine } from '../styles';
import { ConditionFieldsProps } from './types';

function MoreOptions({
	alertDef,
	setAlertDef,
}: ConditionFieldsProps): JSX.Element {
	const { t } = useTranslation('alerts');

	const onChangeFrequency = (value: unknown): void => {
		const freq = (value as string) || alertDef.frequency;
		setAlertDef({
			...alertDef,
			frequency: freq,
		});
	};

	const renderFrequency = (): JSX.Element => (
		<InlineSelect
			getPopupContainer={popupContainer}
			defaultValue={defaultFrequency}
			style={{ minWidth: '120px' }}
			value={alertDef.frequency}
			onChange={onChangeFrequency}
		>
			<Select.Option value="1m0s">{t('option_1min')}</Select.Option>
			<Select.Option value="5m0s">{t('option_5min')}</Select.Option>
			<Select.Option value="10m0s">{t('option_10min')}</Select.Option>
			<Select.Option value="15m0s">{t('option_15min')}</Select.Option>
			<Select.Option value="30m0s">{t('option_30min')}</Select.Option>
			<Select.Option value="1h0m0s">{t('option_60min')}</Select.Option>
			<Select.Option value="3h0m0s">{t('option_3hours')}</Select.Option>
			<Select.Option value="6h0m0s">{t('option_6hours')}</Select.Option>
			<Select.Option value="12h0m0s">{t('option_12hours')}</Select.Option>
			<Select.Option value="24h0m0s">{t('option_24hours')}</Select.Option>
		</InlineSelect>
	);

	return (
		<Collapse>
			<Collapse.Panel header={t('More options')} key="1">
				<Space direction="vertical" size="large">
					<VerticalLine>
						<Space direction="horizontal" align="center">
							<Typography.Text>{t('text_alert_frequency')}</Typography.Text>
							{renderFrequency()}
						</Space>
					</VerticalLine>

					<VerticalLine>
						<Space direction="horizontal" align="center">
							<Form.Item noStyle name={['condition', 'alertOnAbsent']}>
								<Checkbox
									checked={alertDef?.condition?.alertOnAbsent}
									onChange={(e): void => {
										setAlertDef({
											...alertDef,
											condition: {
												...alertDef.condition,
												alertOnAbsent: e.target.checked,
											},
										});
									}}
								/>
							</Form.Item>
							<Typography.Text>{t('text_alert_on_absent')}</Typography.Text>

							<Form.Item noStyle name={['condition', 'absentFor']}>
								<InputNumber
									min={1}
									value={alertDef?.condition?.absentFor}
									onChange={(value): void => {
										setAlertDef({
											...alertDef,
											condition: {
												...alertDef.condition,
												absentFor: Number(value) || 0,
											},
										});
									}}
									type="number"
									onWheel={(e): void => e.currentTarget.blur()}
								/>
							</Form.Item>
							<Typography.Text>{t('text_for')}</Typography.Text>
						</Space>
					</VerticalLine>

					<VerticalLine>
						<Space direction="horizontal" align="center">
							<Form.Item noStyle name={['condition', 'requireMinPoints']}>
								<Checkbox
									checked={alertDef?.condition?.requireMinPoints}
									onChange={(e): void => {
										setAlertDef({
											...alertDef,
											condition: {
												...alertDef.condition,
												requireMinPoints: e.target.checked,
											},
										});
									}}
								/>
							</Form.Item>
							<Typography.Text>{t('text_require_min_points')}</Typography.Text>

							<Form.Item noStyle name={['condition', 'requiredNumPoints']}>
								<InputNumber
									min={1}
									value={alertDef?.condition?.requiredNumPoints}
									onChange={(value): void => {
										setAlertDef({
											...alertDef,
											condition: {
												...alertDef.condition,
												requiredNumPoints: Number(value) || 0,
											},
										});
									}}
									type="number"
									onWheel={(e): void => e.currentTarget.blur()}
								/>
							</Form.Item>
							<Typography.Text>{t('text_num_points')}</Typography.Text>
						</Space>
					</VerticalLine>
				</Space>
			</Collapse.Panel>
		</Collapse>
	);
}

export default MoreOptions;
