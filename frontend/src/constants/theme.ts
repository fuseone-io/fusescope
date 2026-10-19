import { FS_SERIES_DARK, FS_SERIES_LIGHT } from './fuseScopeColors';

const themeColors = {
	traceDetailColors: {
		robin: '#3F5ECC',
		dodgerBlue: '#2F80ED',
		mediumOrchid: '#BB6BD9',
		seaBuckthorn: '#F2994A',
		turquoiseBlue: '#56CCF2',
		festivalOrange: '#F2C94C',
		silver: '#BDBDBD',
		outrageousOrange: '#FF6633',
		roseBud: '#FFB399',
		canary: '#FFFF99',
		deepSkyBlue: '#00B3E6',
		goldTips: '#E6B333',
		royalBlue: '#3366E6',
		avocado: '#999966',
		mintGreen: '#99FF99',
		lima: '#80B300',
		olive: '#809900',
		beautyBush: '#E6B3B3',
		danube: '#6680B3',
		oliveDrab: '#66991A',
		lavenderRose: '#FF99E6',
		electricLime: '#CCFF1A',
		turquoise: '#33FFCC',
		gladeGreen: '#66994D',
		hemlock: '#66664D',
		vidaLoca: '#4D8000',
		mediumAquamarine: '#66CDAA',
		lavender: '#E6E6FA',
		thistle: '#D8BFD8',
		yellow: '#FFFF00',
		purple: '#800080',
		cyan: '#00FFFF',
	},
	traceDetailColorsV3: {
		// Blues
		blue1: '#2F80ED',
		blue2: '#3366E6',
		blue3: '#4682B4',
		blue4: '#1F63E0',
		blue5: '#3A7AED',
		blue6: '#5A9DF5',
		blue7: '#2874A6',
		blue8: '#2E86C1',
		blue9: '#3498DB',
		blue10: '#1E90FF',
		blue11: '#4169E1',

		// Cyans / Teals
		cyan1: '#00CEC9',
		cyan2: '#22A6F2',
		cyan3: '#00B0AA',
		cyan4: '#33D6C2',
		cyan5: '#66E9DA',
		cyan6: '#48DBFB',
		cyan7: '#00BFFF',
		cyan8: '#63B8FF',
		teal1: '#009688',
		teal2: '#1ABC9C',
		teal3: '#48C9B0',
		teal4: '#76D7C4',
		teal5: '#20B2AA',

		// Greens
		green1: '#27AE60',
		green2: '#3CB371',
		green3: '#1E8449',
		green4: '#2ECC71',
		green5: '#58D68D',
		green6: '#229954',
		green7: '#52BE80',
		green8: '#82E0AA',
		green9: '#73C6B6',

		// Limes
		lime1: '#A3E635',
		lime2: '#B9F18D',
		lime3: '#84CC16',
		lime4: '#65A30D',

		// Yellows
		yellow1: '#F1C40F',
		yellow2: '#F7DC6F',
		yellow3: '#F9E79F',
		yellow4: '#F4D03F',
		yellow5: '#D4AC0D',

		// Golds / Ambers
		gold1: '#F2C94C',
		gold2: '#FFD93D',
		gold3: '#FFCA28',
		gold4: '#B7950B',
		gold5: '#D4A017',

		// Oranges (non-red)
		orange1: '#F39C12',
		orange2: '#E67E22',
		orange3: '#F5B041',
		orange4: '#D35400',
		orange5: '#EB984E',
		orange6: '#FAD7A0',

		// Purples / Violets
		purple1: '#BB6BD9',
		purple2: '#9B51E0',
		purple3: '#DA77F2',
		purple4: '#C77DFF',
		purple5: '#6C5CE7',
		purple6: '#8E44AD',
		purple7: '#9B59B6',
		purple8: '#BB8FCE',
		purple9: '#7D3C98',
		purple10: '#A569BD',

		// Lavenders
		lavender1: '#AF7AC5',
		lavender2: '#C39BD3',
		lavender3: '#D2B4DE',

		// Pinks / Magentas
		pink1: '#E91E8C',
		pink2: '#FF6FD8',
		pink3: '#F06292',
		pink4: '#CE93D8',

		// Salmons / Corals (distinct from error red)
		salmon1: '#FF8A65',
		salmon2: '#FFAB91',
		salmon3: '#E0876A',
	},
	/* Series palettes (dark / light): see constants/fuseScopeColors.
	   generateColor indexes by `hash % Object.keys(...).length`, so adding or
	   removing an entry recolors every existing chart. */
	chartcolors: FS_SERIES_DARK,
	lightModeColor: FS_SERIES_LIGHT,
	errorColor: '#d32f2f',
	royalGrey: '#888888',
	matterhornGrey: '#555555',
	whiteCream: '#ffffffd5',
	white: '#ffffff',
	black: '#000000',
	darkGrey: '#262626',
	lightBlack: '#141414',
	lightgrey: '#ddd',
	lightWhite: '#ffffffd9',
	borderLightGrey: '#d9d9d9',
	borderDarkGrey: '#424242',
	gainsboro: '#DBDBDB',
	navyBlue: '#1668DC',
	lightSkyBlue: '#8DCFF8',
	neroBlack: '#1d1d1d',
	snowWhite: '#fafafa',
	gamboge: '#D89614',
	bckgGrey: '#1d1d1d',
	lightBlue: '#177ddc',
	buttonSuccessRgb: '73, 170, 25',
	red: '#E84749',
};

export { themeColors };
