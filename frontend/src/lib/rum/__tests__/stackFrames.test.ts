import type { RumtypesErrorEventDTO } from 'api/generated/services/fuseScope.schemas';

import {
	contextRows,
	defaultStackMode,
	displayFrames,
	frameLabel,
	frameLocation,
	groupFrames,
	isLibraryFile,
	StackFrame,
} from '../stackFrames';

const BUNDLE = 'https://shop.example.com/assets/app.4f9c2a.js';

type Frame = NonNullable<StackFrame>;

const minified = (fn: string, column: number, file = BUNDLE): Frame => ({
	function: fn,
	file,
	line: 1,
	column,
	original: null,
});

const symbolicated = (
	fn: string,
	file: string,
	line: number,
	inApp = true,
): Frame => ({
	...minified('e', line * 10),
	original: {
		function: fn,
		file,
		line,
		column: 7,
		inApp,
		sourceMap: '/assets/app.4f9c2a.js.map',
		context: { startLine: line - 1, lines: ['a', 'b', 'c'] },
	},
});

describe('isLibraryFile', () => {
	it.each([
		['node_modules/react-dom/cjs/react-dom.js', true],
		['webpack:///node_modules/@tanstack/query-core/build/index.js', true],
		['<anonymous>', true],
		['native', true],
		['', true],
		['src/cart/pricing.ts', false],
		[BUNDLE, false],
	])('%s', (file, library) => {
		expect(isLibraryFile(file)).toBe(library);
	});
});

describe('displayFrames', () => {
	const frames = [
		symbolicated('lineTotal', 'src/cart/pricing.js', 2),
		minified('Array.reduce', 0, '<anonymous>'),
		symbolicated('commitRoot', 'node_modules/react-dom/index.js', 90, false),
	];

	it('shows the original position when there is one', () => {
		const [first, second, third] = displayFrames(frames, 'original');
		expect(first).toMatchObject({
			function: 'lineTotal',
			file: 'src/cart/pricing.js',
			line: 2,
			column: 7,
			inApp: true,
			symbolicated: true,
		});
		expect(first.context?.lines).toStrictEqual(['a', 'b', 'c']);
		expect(second).toMatchObject({
			function: 'Array.reduce',
			inApp: false,
			symbolicated: false,
		});
		expect(third).toMatchObject({
			file: 'node_modules/react-dom/index.js',
			inApp: false,
		});
	});

	it('keeps the minified position on request', () => {
		const [first] = displayFrames(frames, 'minified');
		expect(first).toMatchObject({
			function: 'e',
			file: BUNDLE,
			line: 1,
			column: 20,
		});
		expect(first.context).toBeUndefined();
	});

	it('skips empty frames', () => {
		expect(displayFrames([null, ...frames], 'original')).toHaveLength(3);
	});
});

describe('groupFrames', () => {
	it('collapses consecutive library frames, naming their package', () => {
		const frames = displayFrames(
			[
				symbolicated('PriceTag', 'src/PriceTag.tsx', 42),
				symbolicated('renderWithHooks', 'node_modules/react-dom/a.js', 1, false),
				symbolicated('beginWork', 'node_modules/react-dom/b.js', 2, false),
				symbolicated('ProductPage', 'src/ProductPage.tsx', 63),
				minified('Array.reduce', 0, '<anonymous>'),
				symbolicated('run', 'node_modules/@tanstack/query-core/c.js', 3, false),
			],
			'original',
		);
		const groups = groupFrames(frames);
		expect(groups.map((group) => group.kind)).toStrictEqual([
			'app',
			'library',
			'app',
			'library',
		]);
		expect(groups[1]).toMatchObject({
			label: '2 frames from node_modules/react-dom',
		});
		expect(groups[3]).toMatchObject({ label: '2 library frames' });
	});

	it('names one library frame', () => {
		const groups = groupFrames(
			displayFrames([minified('Array.reduce', 0, '<anonymous>')], 'original'),
		);
		expect(groups[0]).toMatchObject({
			kind: 'library',
			label: '1 library frame',
		});
	});
});

describe('frameLocation', () => {
	it.each([
		[{ file: 'src/a.ts', line: 4, column: 2 }, 'src/a.ts:4:2'],
		[{ file: 'src/a.ts', line: 4, column: 0 }, 'src/a.ts:4'],
		[{ file: '<anonymous>', line: 0, column: 0 }, '<anonymous>'],
	])('%o', (frame, text) => {
		expect(frameLocation(frame)).toBe(text);
	});
});

describe('frameLabel', () => {
	it('prefers the original function and file', () => {
		expect(frameLabel(symbolicated('lineTotal', 'src/cart/pricing.js', 2))).toBe(
			'lineTotal · src/cart/pricing.js:2:7',
		);
	});

	it('reads a minified frame without a function', () => {
		expect(frameLabel(minified('', 311))).toBe(`${BUNDLE}:1:311`);
	});

	it('is a dash without a frame', () => {
		expect(frameLabel(null)).toBe('—');
	});
});

describe('contextRows', () => {
	it('numbers the lines and marks the frame line', () => {
		expect(
			contextRows({ startLine: 41, lines: ['const a = 1;', 'a.price;'] }, 42),
		).toStrictEqual([
			{ number: 41, text: 'const a = 1;', current: false },
			{ number: 42, text: 'a.price;', current: true },
		]);
	});
});

describe('defaultStackMode', () => {
	const event = (
		frames: StackFrame[],
	): Pick<RumtypesErrorEventDTO, 'frames' | 'symbolicated'> => ({
		frames,
		symbolicated: frames.some((frame) => frame?.original),
	});

	it.each([
		[
			'original when a frame resolved',
			event([symbolicated('a', 'src/a.ts', 1)]),
			'original',
		],
		['minified otherwise', event([minified('a', 1)]), 'minified'],
		['minified without frames', event([]), 'minified'],
	])('%s', (_name, input, mode) => {
		expect(defaultStackMode(input)).toBe(mode);
	});
});
