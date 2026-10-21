import { FUSESCOPE_DOCS_URL } from 'constants/docs';
import { ALERT_CARDS } from 'container/ListAlertRules/AlertsEmptyState/alertLinks';

import { ALERT_TYPE_URL_MAP } from '../constants';
import { ALERTS_VALUES_MAP } from '../defaults';

const links: [string, string][] = [
	...Object.entries(ALERT_TYPE_URL_MAP).flatMap(
		([type, urls]): [string, string][] => [
			[`${type} selection`, urls.selection],
			[`${type} creation`, urls.creation],
		],
	),
	...ALERT_CARDS.map((card): [string, string] => [card.header, card.link]),
];

describe('alert docs links', () => {
	it.each(links)('%s points at the FuseScope docs', (_name, link) => {
		expect(link.startsWith(`${FUSESCOPE_DOCS_URL}/`)).toBe(true);
	});

	it.each(Object.entries(ALERTS_VALUES_MAP))(
		'%s default queries do not link to signoz.io',
		(_type, def) => {
			expect(JSON.stringify(def)).not.toContain('signoz.io');
		},
	);
});
