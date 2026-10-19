import { Card } from 'antd';
import { FontSize } from 'container/OptionsMenu/types';
import styled from 'styled-components';
import { getActiveLogBackground } from 'utils/logs';

interface LogTextProps {
	linesPerRow?: number;
}

interface LogContainerProps {
	fontSize: FontSize;
}

export const Container = styled(Card)<{
	$isActiveLog: boolean;
	$isDarkMode: boolean;
	$logType: string;
	fontSize: FontSize;
}>`
	position: relative;
	width: 100% !important;
	margin: 0;
	border: 0;
	border-bottom: 1px solid var(--fs-border);
	border-radius: 0;
	background: transparent;
	cursor: pointer;

	&:not(:hover) .log-line-action-buttons {
		display: none;
	}

	.ant-card-body {
		border-radius: 0;
		padding: 4px 16px 4px 0;

		${({ fontSize }): string =>
			fontSize === FontSize.SMALL
				? `padding: 2px 16px 2px 0;`
				: fontSize === FontSize.LARGE
					? `padding: 6px 16px 6px 0;`
					: ``}
	}

	&:hover .ant-card-body {
		background-color: var(--fs-muted);
	}

	.ant-card-body {
		${({ $isActiveLog, $isDarkMode, $logType }): string =>
			getActiveLogBackground($isActiveLog, $isDarkMode, $logType)}
	}
`;

export const LogContainer = styled.div<LogContainerProps>`
	margin-left: 0.5rem;
	display: flex;
	flex-direction: column;
	gap: 6px;
	${({ fontSize }): string =>
		fontSize === FontSize.SMALL
			? `gap: 2px;`
			: fontSize === FontSize.MEDIUM
				? ` gap:4px;`
				: `gap:6px;`}
`;

export const LogText = styled.div<LogTextProps>`
	display: inline-block;
	text-overflow: ellipsis;
	overflow: hidden;
	${({ linesPerRow }): string =>
		linesPerRow
			? `-webkit-line-clamp: ${linesPerRow};
		line-clamp: ${linesPerRow};
		display: -webkit-box;
		-webkit-box-orient: vertical;
		white-space: normal; `
			: 'white-space: nowrap;'};
	};
`;

export const SelectedLog = styled.div`
	display: flex;
	width: 100%;
	overflow: hidden;
`;
