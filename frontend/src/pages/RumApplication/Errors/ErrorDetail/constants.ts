export const STACK_WORDS = {
	web: {
		resolved: 'Symbolicated',
		raw: 'Minified',
		noMatch: 'no uploaded map matches these files',
		missing: 'no source map for',
		upload: 'Upload this release’s source maps to see the original code',
	},
	native: {
		resolved: 'Symbolicated',
		raw: 'Native',
		noMatch: 'library-relative addresses',
		missing: 'no native symbols for',
		upload: 'Native debug-symbol uploads are not available yet',
	},
	jvm: {
		resolved: 'Retraced',
		raw: 'Obfuscated',
		noMatch: 'the mapping resolves none of these frames',
		missing: 'no R8 mapping for',
		upload: 'Upload this release’s R8 mapping to see the original code',
	},
};

export type StackWords = (typeof STACK_WORDS)['web'];
