import { ReactNode } from 'react';
import { ConfigProvider } from 'antd';

interface AlertsFormThemeProps {
	children: ReactNode;
	/** 36px for stacked form fields, 32px for controls inline in a sentence. */
	controlHeight?: 32 | 36;
	getPopupContainer?: (trigger?: HTMLElement) => HTMLElement;
}

/**
 * Sizes the antd fields of the Alerts forms like the new UI's: 8px radius and
 * 36px (or 32px inline) controls. Colours still come from the app theme.
 */
function AlertsFormTheme({
	children,
	controlHeight = 36,
	getPopupContainer,
}: AlertsFormThemeProps): JSX.Element {
	return (
		<ConfigProvider
			getPopupContainer={getPopupContainer}
			theme={{
				token: { controlHeight, borderRadius: 8, borderRadiusLG: 12 },
			}}
		>
			{children}
		</ConfigProvider>
	);
}

export default AlertsFormTheme;
