export type StackLineKind = 'title' | 'app' | 'library' | 'note';

export interface StackLine {
	id: number;
	text: string;
	kind: StackLineKind;
	/** The line that starts a frame, as opposed to its file or source line. */
	frame: boolean;
}

export type StackBlock =
	| { kind: 'lines'; id: number; lines: StackLine[] }
	| { kind: 'library'; id: number; lines: StackLine[]; frames: number };

const LIBRARY_PATH =
	/node_modules|node:|\(internal\/|site-packages|dist-packages|\/lib\/python\d|\/pkg\/mod\/|\/vendor\/|\/go\/src\/|\/usr\/local\/go\//;

const LIBRARY_SYMBOL =
	/^(java|javax|jdk|sun|com\.sun|kotlin|kotlinx|scala|okhttp3|okio|org\.springframework|org\.apache|org\.hibernate|org\.eclipse|io\.netty|io\.grpc|io\.opentelemetry|reactor|com\.fasterxml|com\.google|System|Microsoft|Grpc)\./;

const AT_FRAME = /^\s+at\s+(?:async\s+)?(\S+)/;
const PYTHON_FRAME = /^\s+File "([^"]+)", line \d+/;
const GO_FILE = /^\s+(\S+\.go):\d+/;
const TITLE = /^(Caused by: |[^\s(]+: )/;
const NOTE =
	/^(goroutine \d+|Traceback |During handling |The above exception|\s*\.\.\. \d+ (more|common))/;

/** A Go function from the standard library: its import path has no domain. */
const isGoStdlib = (symbol: string): boolean => {
	const path = symbol.trim().split('(')[0];
	if (path.includes('/')) {
		return !path.split('/')[0].includes('.');
	}
	return path.split('.')[0] !== 'main';
};

function atFrameKind(line: string, symbol: string): StackLineKind {
	const name = symbol.replace(/^[\w.-]+(@[\w.-]+)?\//, '');
	return LIBRARY_PATH.test(line) || LIBRARY_SYMBOL.test(name)
		? 'library'
		: 'app';
}

type Classified = Pick<StackLine, 'kind' | 'frame'>;

const pathKind = (path: string): StackLineKind =>
	LIBRARY_PATH.test(path) ? 'library' : 'app';

/** A line that is a frame or a frame's file line on its own. */
function classifyFrame(line: string): Classified | null {
	const at = AT_FRAME.exec(line);
	if (at) {
		return { kind: atFrameKind(line, at[1]), frame: true };
	}
	const python = PYTHON_FRAME.exec(line);
	if (python) {
		return { kind: pathKind(python[1]), frame: true };
	}
	const goFile = GO_FILE.exec(line);
	if (goFile) {
		return { kind: pathKind(goFile[1]), frame: false };
	}
	return null;
}

function classify(
	line: string,
	next: string | undefined,
	previous: StackLine | undefined,
	seenFrame: boolean,
): Classified {
	const frame = classifyFrame(line);
	if (frame) {
		return frame;
	}
	if (NOTE.test(line)) {
		return { kind: 'note', frame: false };
	}
	if (next !== undefined && GO_FILE.test(next)) {
		return {
			kind: isGoStdlib(line) ? 'library' : pathKind(next),
			frame: true,
		};
	}
	if (/^\s/.test(line) && previous?.frame && PYTHON_FRAME.test(previous.text)) {
		return { kind: previous.kind, frame: false };
	}
	if (!seenFrame || TITLE.test(line)) {
		return { kind: 'title', frame: false };
	}
	return { kind: 'app', frame: false };
}

/**
 * A stack trace split into lines marked as the exception title, application
 * frames, library frames (dependencies, runtime) and notes, for Go, Java and
 * other JVM languages, Python, Node.js and .NET traces.
 */
export function parseStackTrace(text: string): StackLine[] {
	if (!text.trim()) {
		return [];
	}
	const raw = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
	const lines: StackLine[] = [];
	let seenFrame = false;
	raw.forEach((line, index) => {
		const { kind, frame } = classify(
			line,
			raw[index + 1],
			lines[lines.length - 1],
			seenFrame,
		);
		seenFrame = seenFrame || frame;
		lines.push({ id: index, text: line, kind, frame });
	});
	return lines;
}

/** Consecutive library lines folded into one block, so they can collapse together. */
export function groupStackLines(lines: StackLine[]): StackBlock[] {
	const blocks: StackBlock[] = [];
	lines.forEach((line) => {
		const kind = line.kind === 'library' ? 'library' : 'lines';
		const last = blocks[blocks.length - 1];
		if (last?.kind === kind) {
			last.lines.push(line);
			if (last.kind === 'library' && line.frame) {
				last.frames += 1;
			}
			return;
		}
		blocks.push(
			kind === 'library'
				? { kind, id: line.id, lines: [line], frames: line.frame ? 1 : 0 }
				: { kind, id: line.id, lines: [line] },
		);
	});
	return blocks;
}
