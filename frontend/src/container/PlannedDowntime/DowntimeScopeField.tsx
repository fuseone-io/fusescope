import { Form, Input, Tooltip } from 'antd';
import { fuseScopeDocsUrl } from 'constants/docs';
import { Info } from 'lucide-react';

/** The optional label expression that narrows a downtime. */
export function DowntimeScopeField(): JSX.Element {
	return (
		<Form.Item
			label={
				<span className="tw:inline-flex tw:items-center tw:gap-1">
					Scope
					<Tooltip
						mouseLeaveDelay={0.3}
						title={
							<span>
								Scope the planned downtime by alert labels.{' '}
								<a
									href={fuseScopeDocsUrl(
										'/alerts/routing-and-downtime/#planned-downtime',
									)}
									target="_blank"
									rel="noopener noreferrer"
								>
									Learn more
								</a>
							</span>
						}
					>
						<Info size={13} className="tw:text-muted-foreground" />
					</Tooltip>
				</span>
			}
			name="scope"
		>
			<Input.TextArea
				placeholder='e.g. env = "prod" AND region = "us-east-1"'
				autoSize={{ minRows: 2, maxRows: 4 }}
				className="tw:font-mono! tw:[font-variant-ligatures:none]"
			/>
		</Form.Item>
	);
}
