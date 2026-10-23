import type {
	RumtypesErrorEventDTO,
	RumtypesSourceContextDTO,
	RumtypesStackFrameDTO,
} from 'api/generated/services/fuseScope.schemas';

import { plural } from './format';

export type StackFrame = RumtypesStackFrameDTO;
export type StackMode = 'original' | 'minified';
export type SourceContext = NonNullable<RumtypesSourceContextDTO>;

export interface DisplayFrame {
	function: string;
	file: string;
	/** 0 when unknown. */
	line: number;
	column: number;
	inApp: boolean;
	/** Resolved through an uploaded source map. */
	symbolicated: boolean;
	context?: SourceContext;
}

export type FrameGroup =
	| { kind: 'app'; key: string; frame: DisplayFrame }
	| { kind: 'library'; key: string; frames: DisplayFrame[]; label: string };

export interface ContextRow {
	number: number;
	text: string;
	current: boolean;
}

const DASH = '—';
const NATIVE_FILES = new Set(['', '<anonymous>', 'native', '[native code]']);
const PACKAGE = /node_modules\/((?:@[^/]+\/)?[^/]+)/;

/** Dependencies and the browser's own frames, as opposed to the app's code. */
export function isLibraryFile(file: string): boolean {
	return NATIVE_FILES.has(file) || PACKAGE.test(file);
}

const SCRIPT = /\.[mc]?js$/i;

/** A script a source map can describe; inline `<script>` code reports the page's URL instead. */
export function isScriptFile(file: string): boolean {
	return SCRIPT.test(file.split(/[?#]/)[0]);
}

export function displayFrames(
	frames: RumtypesErrorEventDTO['frames'],
	mode: StackMode,
): DisplayFrame[] {
	return (frames ?? []).flatMap((frame): DisplayFrame[] => {
		if (!frame) {
			return [];
		}
		const { original } = frame;
		if (mode === 'original' && original) {
			return [
				{
					function: original.function,
					file: original.file,
					line: original.line,
					column: original.column,
					inApp: original.inApp,
					symbolicated: true,
					context: original.context ?? undefined,
				},
			];
		}
		return [
			{
				function: frame.function,
				file: frame.file,
				line: frame.line,
				column: frame.column,
				inApp: !isLibraryFile(frame.file),
				symbolicated: false,
			},
		];
	});
}

function libraryLabel(frames: DisplayFrame[]): string {
	const packages = new Set(
		frames.map((frame) => PACKAGE.exec(frame.file)?.[1] ?? ''),
	);
	const [only] = [...packages];
	if (packages.size === 1 && only) {
		return `${frames.length} ${plural(frames.length, 'frame')} from node_modules/${only}`;
	}
	return `${frames.length} library ${plural(frames.length, 'frame')}`;
}

/** The app's frames one by one, each run of library frames as one collapsible group. */
export function groupFrames(frames: DisplayFrame[]): FrameGroup[] {
	const groups: FrameGroup[] = [];
	let run: DisplayFrame[] = [];
	const flush = (): void => {
		if (run.length > 0) {
			groups.push({
				kind: 'library',
				key: `library-${groups.length}`,
				frames: run,
				label: libraryLabel(run),
			});
			run = [];
		}
	};
	frames.forEach((frame) => {
		if (frame.inApp) {
			flush();
			groups.push({ kind: 'app', key: `app-${groups.length}`, frame });
		} else {
			run.push(frame);
		}
	});
	flush();
	return groups;
}

/** "src/cart/pricing.ts:42:31", without the parts that are unknown. */
export function frameLocation(
	frame: Pick<DisplayFrame, 'file' | 'line' | 'column'>,
): string {
	if (frame.line <= 0) {
		return frame.file;
	}
	return frame.column > 0
		? `${frame.file}:${frame.line}:${frame.column}`
		: `${frame.file}:${frame.line}`;
}

/** "PriceTag · src/components/PriceTag.tsx:42:31", the original when known. */
export function frameLabel(frame: StackFrame | null | undefined): string {
	if (!frame) {
		return DASH;
	}
	const [shown] = displayFrames([frame], 'original');
	const location = frameLocation(shown);
	return shown.function ? `${shown.function} · ${location}` : location;
}

export function contextRows(
	context: SourceContext,
	line: number,
): ContextRow[] {
	return (context.lines ?? []).map((text, index) => {
		const number = context.startLine + index;
		return { number, text, current: number === line };
	});
}

/** Original when a source map resolved the event, else what the browser sent. */
export function defaultStackMode(
	event: Pick<RumtypesErrorEventDTO, 'frames' | 'symbolicated'>,
): StackMode {
	return event.symbolicated &&
		(event.frames ?? []).some((frame) => frame?.original)
		? 'original'
		: 'minified';
}
