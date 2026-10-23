import { DragEvent, useId, useRef, useState } from 'react';
import { Input } from 'components/ui/input';
import { cn } from 'lib/utils';
import { Upload } from 'lucide-react';

import { UploadResult } from '../../hooks/useSourceMapActions';
import { isSourceMapFile, mapPath } from '../../utils/sourceMaps';
import { DropUploadStatus } from './types';
import UploadOutcome from './UploadOutcome';

interface DropUploadProps {
	defaultRelease: string;
	onUpload: (
		files: File[],
		release: string,
		prefix: string,
	) => Promise<UploadResult>;
}

const LABEL =
	'tw:flex tw:flex-col tw:gap-1 tw:text-xs tw:font-medium tw:text-muted-foreground';

/** Uploads dropped or picked `.map` files to one release, for a one-off fix. */
function DropUpload({
	defaultRelease,
	onUpload,
}: DropUploadProps): JSX.Element {
	const [release, setRelease] = useState(defaultRelease);
	const [prefix, setPrefix] = useState('/assets/');
	const [over, setOver] = useState(false);
	const [status, setStatus] = useState<DropUploadStatus>({ state: 'idle' });
	const input = useRef<HTMLInputElement>(null);
	const id = useId();

	const send = async (picked: File[]): Promise<void> => {
		const maps = picked.filter((file) => isSourceMapFile(file.name));
		if (!release.trim()) {
			setStatus({
				state: 'invalid',
				message: 'Enter the release these maps belong to.',
			});
			return;
		}
		if (maps.length === 0) {
			setStatus({
				state: 'invalid',
				message: 'Drop .js.map, .mjs.map or .cjs.map files.',
			});
			return;
		}
		setStatus({ state: 'uploading', count: maps.length });
		const result = await onUpload(maps, release.trim(), prefix);
		setStatus({ state: 'done', result, release: release.trim() });
	};

	const onDrop = (event: DragEvent<HTMLElement>): void => {
		event.preventDefault();
		setOver(false);
		void send([...event.dataTransfer.files]);
	};

	return (
		<div
			className="tw:flex tw:flex-col tw:gap-2"
			data-testid="rum-sourcemaps-drop"
		>
			<div className="tw:grid tw:grid-cols-2 tw:gap-3">
				<label className={LABEL} htmlFor={`${id}-release`}>
					Release
					<Input
						id={`${id}-release`}
						data-testid="rum-sourcemaps-release-input"
						value={release}
						placeholder="1.8.0"
						onChange={(event): void => setRelease(event.target.value)}
						className="tw:font-mono tw:text-xs"
					/>
				</label>
				<label className={LABEL} htmlFor={`${id}-prefix`}>
					Bundles served from
					<Input
						id={`${id}-prefix`}
						data-testid="rum-sourcemaps-prefix-input"
						value={prefix}
						onChange={(event): void => setPrefix(event.target.value)}
						className="tw:font-mono tw:text-xs"
					/>
				</label>
			</div>
			<button
				type="button"
				data-testid="rum-sourcemaps-dropzone"
				onClick={(): void => input.current?.click()}
				onDragOver={(event): void => {
					event.preventDefault();
					setOver(true);
				}}
				onDragLeave={(): void => setOver(false)}
				onDrop={onDrop}
				className={cn(
					'tw:flex tw:cursor-pointer tw:flex-col tw:items-center tw:gap-1 tw:rounded-lg tw:border tw:border-dashed tw:bg-transparent tw:px-4 tw:py-5 tw:text-[13px] tw:text-muted-foreground',
					over
						? 'tw:border-primary tw:bg-primary-soft'
						: 'tw:border-border tw:hover:bg-muted/50',
				)}
			>
				<Upload aria-hidden="true" className="tw:size-5" />
				<span>
					Drop <span className="tw:font-mono">.map</span> files here, or{' '}
					<span className="tw:text-primary">choose files</span>
				</span>
				<span className="tw:text-xs tw:text-subtle-foreground">
					{`Each is stored as ${mapPath(prefix, 'name.js.map')}; the CLI keeps folders for you.`}
				</span>
			</button>
			<input
				ref={input}
				type="file"
				multiple
				accept=".map,application/json"
				aria-label="Source map files"
				data-testid="rum-sourcemaps-file-input"
				className="tw:hidden"
				onChange={(event): void => {
					void send([...(event.target.files ?? [])]);
					event.target.value = '';
				}}
			/>
			<UploadOutcome status={status} />
		</div>
	);
}

export default DropUpload;
