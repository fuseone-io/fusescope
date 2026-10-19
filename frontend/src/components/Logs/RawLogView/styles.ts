import { Col, Row, Space } from 'antd';
import { FontSize } from 'container/OptionsMenu/types';
import { Info } from '@signozhq/icons';
import styled from 'styled-components';
import {
	getActiveLogBackground,
	getCustomHighlightBackground,
} from 'utils/logs';

import { RawLogContentProps } from './types';

export const RawLogViewContainer = styled(Row)<{
	$isDarkMode: boolean;
	$isReadOnly?: boolean;
	$isActiveLog?: boolean;
	$isHightlightedLog: boolean;
	$isCustomHighlighted?: boolean;
	$logType: string;
	fontSize: FontSize;
}>`
	position: relative;
	width: 100%;

	display: flex;
	align-items: stretch;

	transition: background-color 0.2s ease-in;

	&:not(:hover) .log-line-action-buttons {
		display: none;
	}

	.log-state-indicator {
		margin: 4px 0;

		${({ fontSize }): string =>
			fontSize === FontSize.SMALL
				? `margin: 1px 0;`
				: fontSize === FontSize.MEDIUM
					? `margin: 1px 0;`
					: `margin: 2px 0;`}
	}

	${({ $isReadOnly, $isActiveLog, $isDarkMode, $logType }): string =>
		$isActiveLog
			? getActiveLogBackground($isActiveLog, $isDarkMode, $logType)
			: !$isReadOnly
				? `&:hover { background-color: var(--fs-muted); }`
				: ''}

	${({ $isHightlightedLog }): string =>
		$isHightlightedLog
			? `background-color: var(--fs-primary-soft);
			  transition: background-color 2s ease-in;`
			: ''}

	${({ $isCustomHighlighted }): string =>
		getCustomHighlightBackground($isCustomHighlighted)}
`;

export const InfoIconWrapper = styled(Info)`
	display: flex;
	align-items: center;
	margin-right: 4px;
	cursor: help;
	flex-shrink: 0;
	height: auto;
`;

export const ExpandIconWrapper = styled(Col)`
	color: var(--fs-primary);
	padding: 0.25rem 0.375rem;
	cursor: pointer;
`;

export const RawLogContent = styled.div<RawLogContentProps>`
	margin-bottom: 0;
	font-family: var(--tw-font-mono);
	letter-spacing: 0;
	padding: 4px;
	text-align: left;
	color: var(--fs-foreground);

	${({ $isTextOverflowEllipsisDisabled, linesPerRow }): string =>
		$isTextOverflowEllipsisDisabled
			? 'white-space: nowrap'
			: `overflow: hidden;
		text-overflow: ellipsis; 
		display: -webkit-box;
		-webkit-line-clamp: ${linesPerRow};
		line-clamp: ${linesPerRow}; 
		-webkit-box-orient: vertical;`};

	font-size: 13px;
	font-weight: 400;
	line-height: 24px;
	${({ fontSize }): string =>
		fontSize === FontSize.SMALL
			? `font-size:11px; line-height:16px; padding:1px;`
			: fontSize === FontSize.MEDIUM
				? `font-size:13px; line-height:20px; padding:1px;`
				: `font-size:14px; line-height:24px; padding:2px;`}

	cursor: ${({ $isActiveLog, $isReadOnly }): string =>
		$isActiveLog || $isReadOnly ? 'initial' : 'pointer'};
`;

export const ActionButtonsWrapper = styled(Space)`
	position: absolute;
	transform: translate(-50%, -50%);
	top: 50%;
	right: 0;
	cursor: pointer;
`;
