// jest.setup's matchMedia stub lacks addEventListener, which useIsMobile needs.
export function mockMatchMedia(): jest.SpyInstance {
	return jest.spyOn(window, 'matchMedia').mockImplementation((query) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: jest.fn(),
		removeEventListener: jest.fn(),
		addListener: jest.fn(),
		removeListener: jest.fn(),
		dispatchEvent: jest.fn(),
	}));
}
