import { readdirSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC = join(__dirname, '..', '..');
const DOCS_MODULE = join('constants', 'docs.ts');
const HARDCODED_DOCS_URL = /(https?:\/\/)?(www\.)?signoz\.io\/docs/;
const SOURCE_FILE = /\.(ts|tsx|js|jsx)$/;
const TEST_FILE = /\.(test|spec)\.|\.snap$|\.mocks?\./;
const EXCLUDED_DIRS = new Set([
	'__tests__',
	'__test__',
	'tests',
	'__mocks__',
	'mocks',
	'__story_mockdata__',
]);

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			return EXCLUDED_DIRS.has(entry.name) ? [] : sourceFiles(path);
		}
		return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)
			? [path]
			: [];
	});
}

describe('documentation links', () => {
	it('go through constants/docs instead of hardcoded signoz.io/docs urls', () => {
		const offenders = sourceFiles(SRC)
			.filter((file) => relative(SRC, file) !== DOCS_MODULE)
			.filter((file) => HARDCODED_DOCS_URL.test(readFileSync(file, 'utf8')))
			.map((file) => relative(SRC, file).split(sep).join('/'));

		expect(offenders).toEqual([]);
	});
});
