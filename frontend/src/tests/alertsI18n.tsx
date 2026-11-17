import { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { render, RenderResult } from '@testing-library/react';
import { createInstance } from 'i18next';

import alerts from '../../public/locales/en/alerts.json';

/** Renders with the real English `alerts` namespace, so tests assert user-facing copy. */
export function renderWithAlertsI18n(ui: ReactElement): RenderResult {
	const i18n = createInstance();
	void i18n.init({
		lng: 'en',
		initImmediate: false,
		resources: { en: { alerts } },
		interpolation: { escapeValue: false },
	});
	return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}
