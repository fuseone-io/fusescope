import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, renderHook } from '@testing-library/react';

import { useQueryParamTab } from '../hooks/useQueryParamTab';

const mockSafeNavigate = jest.fn();

jest.mock('hooks/useSafeNavigate', () => ({
	useSafeNavigate: (): { safeNavigate: jest.Mock } => ({
		safeNavigate: mockSafeNavigate,
	}),
}));

const TABS = ['OVERVIEW', 'DB', 'EXTERNAL'] as const;

function wrapperAt(url: string) {
	return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
		return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
	};
}

describe('useQueryParamTab', () => {
	beforeEach(() => mockSafeNavigate.mockClear());

	it('reads the tab from the query param', () => {
		const { result } = renderHook(
			() => useQueryParamTab({ param: 'tab', values: TABS, fallback: 'OVERVIEW' }),
			{ wrapper: wrapperAt('/services/api?tab=DB') },
		);

		expect(result.current[0]).toBe('DB');
	});

	it('falls back when the param is missing or unknown', () => {
		const { result } = renderHook(
			() => useQueryParamTab({ param: 'tab', values: TABS, fallback: 'OVERVIEW' }),
			{ wrapper: wrapperAt('/services/api?tab=NOPE') },
		);

		expect(result.current[0]).toBe('OVERVIEW');
	});

	it('navigates to the same path with the new tab, keeping the other params', () => {
		const { result } = renderHook(
			() => useQueryParamTab({ param: 'tab', values: TABS, fallback: 'OVERVIEW' }),
			{ wrapper: wrapperAt('/services/api?relativeTime=30m&tab=DB') },
		);

		act(() => result.current[1]('EXTERNAL'));

		expect(mockSafeNavigate).toHaveBeenCalledWith(
			'/services/api?relativeTime=30m&tab=EXTERNAL',
		);
	});
});
