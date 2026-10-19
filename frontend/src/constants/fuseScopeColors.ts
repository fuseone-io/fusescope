/*
 * FuseScope chart colours. The seven design series tokens (`series-1..7`,
 * `--fs-series-*` in styles/tailwind.css) are spread through the palette and
 * joined by teal, lime, gold, cyan, violet, ochre, olive and neutral
 * families; slots are ordered so consecutive series jump across hue families.
 * Red is left out on purpose: it marks errors and thresholds.
 *
 * Both palettes have the same keys in the same order, so `generateColor`
 * gives a series the same hue family in either theme.
 */
export const FS_SERIES_DARK: Record<string, string> = {
	amber: '#d97706',
	teal: '#22b8cf',
	magenta: '#c04fe0',
	blue: '#3d8be0',
	lime: '#65c466',
	gold: '#f4b740',
	pink: '#e47fd0',
	sky: '#9dbbe0',
	mint: '#34d399',
	orchid: '#cf9de0',
	slate: '#8e98a8',
	green: '#059669',
	ochre: '#e0a458',
	cornflower: '#6aa6ec',
	seafoam: '#2dd4bf',
	steel: '#7c93b5',
	blueDeep: '#1e6fd0',
	cyan: '#67d4e6',
	amberDeep: '#b45f05',
	violet: '#8b7cf6',
	greenDeep: '#0f9f6e',
	slateLight: '#b6bdc7',
	sand: '#d6b98c',
	olive: '#a3b545',
};

export const FS_SERIES_LIGHT: Record<string, string> = {
	amber: '#d97706',
	teal: '#0e8fa3',
	magenta: '#950fb8',
	blue: '#0f5fb8',
	lime: '#3f9a3d',
	gold: '#b7860b',
	pink: '#c2368f',
	sky: '#6d9ad8',
	mint: '#047857',
	orchid: '#b86dd8',
	slate: '#64707f',
	green: '#059669',
	ochre: '#a16207',
	cornflower: '#2f80ed',
	seafoam: '#0f766e',
	steel: '#3e5a80',
	blueDeep: '#0a427f',
	cyan: '#0b6e80',
	amberDeep: '#9d5604',
	violet: '#6d4fd8',
	greenDeep: '#065f46',
	slateLight: '#49525d',
	sand: '#8a6d3b',
	olive: '#6b7a1f',
};

/*
 * Stand-ins for the `@signozhq/design-tokens` `Color.BG_*` constants that chart
 * code draws with: the robin scale becomes the FuseScope blue scale, the
 * ink/slate scales the navy and neutral scales, vanilla the light neutrals.
 */
export const FsChartColor = {
	BG_ROBIN_50: '#e8f0fb',
	BG_ROBIN_100: '#c5d8f5',
	BG_ROBIN_200: '#9dbbe0',
	BG_ROBIN_300: '#6d9ad8',
	BG_ROBIN_400: '#3d8be0',
	BG_ROBIN_500: '#3d7dd0',
	BG_ROBIN_600: '#0f5fb8',
	BG_ROBIN_700: '#0c4f9a',
	BG_ROBIN_800: '#093f7c',
	BG_ROBIN_900: '#062f5e',
	BG_ROBIN_950: '#031f40',
	BG_INK_100: '#374151',
	BG_INK_200: '#1f2937',
	BG_INK_300: '#111827',
	BG_INK_400: '#111827',
	BG_INK_500: '#0a1628',
	BG_SLATE_50: '#64707f',
	BG_SLATE_100: '#4b5563',
	BG_SLATE_200: '#374151',
	BG_SLATE_300: '#1f2937',
	BG_SLATE_400: '#1f2937',
	BG_SLATE_500: '#111827',
	BG_VANILLA_100: '#ffffff',
	BG_VANILLA_200: '#f7f8fa',
	BG_VANILLA_300: '#eceef2',
	BG_VANILLA_400: '#b8bfcc',
} as const;
