import { render, screen } from 'tests/test-utils';

import CreateEdit from '../CreateEdit/CreateEdit';
import {
	mockGoogleAuthDomain,
	mockOidcAuthDomain,
	mockSamlAuthDomain,
} from './mocks';

const FUSESCOPE_SSO_DOCS =
	'https://docs.fusescope.fuseone.io/configuration/sso/';

describe('SSO provider forms link to the FuseScope docs', () => {
	it.each([
		['Google', mockGoogleAuthDomain],
		['SAML', mockSamlAuthDomain],
		['OIDC', mockOidcAuthDomain],
	])('%s', (_, record) => {
		render(<CreateEdit isCreate={false} record={record} onClose={jest.fn()} />);

		expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute(
			'href',
			FUSESCOPE_SSO_DOCS,
		);
	});
});
