import { RumtypesRejectionReasonDTO } from 'api/generated/services/fuseScope.schemas';
import { render, screen } from 'tests/test-utils';

import RejectionLine from '../components/RejectionLine';

const rejection = (
	reason: RumtypesRejectionReasonDTO,
	count: number,
	lastOrigin: string,
) => ({ reason, count, lastOrigin, lastSeenAt: '2026-10-21T10:01:00Z' });

describe('RejectionLine', () => {
	it.each<[string, ReturnType<typeof rejection>, string]>([
		[
			'an unknown key names the origin and where to look',
			rejection(
				RumtypesRejectionReasonDTO.unknown_key,
				3,
				'https://shop.example.com',
			),
			'3 requests with an unknown key from https://shop.example.com. Check the publicKey in your snippet; it may be from another application or revoked.',
		],
		[
			'a single unknown key request is singular',
			rejection(
				RumtypesRejectionReasonDTO.unknown_key,
				1,
				'https://shop.example.com',
			),
			'1 request with an unknown key from https://shop.example.com.',
		],
		[
			'other reasons keep their short label',
			rejection(RumtypesRejectionReasonDTO.too_large, 2, ''),
			'2 requests rejected: payload too large.',
		],
	])('%s', (_name, value, expected) => {
		render(<RejectionLine rejection={value} />);
		expect(screen.getByTestId('rum-rejection')).toHaveTextContent(expected);
	});
});
