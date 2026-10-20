import { Tooltip } from 'antd';

import './OptionRenderer.styles.scss';

function OptionRenderer({
	label,
	value,
	dataType,
	type,
}: OptionRendererProps): JSX.Element {
	return (
		<span className="option">
			{type ? (
				<Tooltip
					title={`${value}`}
					placement="topLeft"
					rootClassName="option-renderer-tooltip"
				>
					<div className="selectOptionContainer">
						<span className="option-value">{value}</span>
						<span className="option-meta-data-container">
							<span className="option-badge" title={`Type: ${type}`}>
								{type}
							</span>
							{dataType ? (
								<span className="option-badge" title={`Data type: ${dataType}`}>
									{dataType}
								</span>
							) : null}
						</span>
					</div>
				</Tooltip>
			) : (
				<Tooltip
					title={label}
					placement="topLeft"
					rootClassName="option-renderer-tooltip"
				>
					<span>{label}</span>
				</Tooltip>
			)}
		</span>
	);
}

interface OptionRendererProps {
	label: string;
	value: string;
	dataType: string | undefined;
	type: string;
}

export default OptionRenderer;
