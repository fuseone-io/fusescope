import { CSSProperties, forwardRef } from 'react';
import TanStackTable from 'components/TanStackTableView';

export interface TextNoDataProps {
	type: 'typography' | 'tanstack';
	className?: string;
	style?: CSSProperties;
}

export const TextNoData = forwardRef<HTMLSpanElement, TextNoDataProps>(
	function TextNoData({ type, className, style, ...props }, ref) {
		const combinedStyle = { opacity: 0.6, ...style };

		if (type === 'tanstack') {
			return (
				<TanStackTable.Text
					ref={ref}
					className={className}
					style={combinedStyle}
					{...props}
				>
					-
				</TanStackTable.Text>
			);
		}

		return (
			<span ref={ref} className={className} style={combinedStyle} {...props}>
				-
			</span>
		);
	},
);
