import { UploadResult } from '../../hooks/useSourceMapActions';

export type DropUploadStatus =
	| { state: 'idle' }
	| { state: 'uploading'; count: number }
	| { state: 'done'; result: UploadResult; release: string }
	| { state: 'invalid'; message: string };
