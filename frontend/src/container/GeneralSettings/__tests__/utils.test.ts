import { IDiskType } from 'types/api/disks/getDisks';

import { hasObjectStorageDisk } from '../utils';

describe('hasObjectStorageDisk', () => {
	it.each<[string, IDiskType[], boolean]>([
		['no disks', [], false],
		['only local disks', [{ name: 'default', type: 'Local' }], false],
		['a legacy s3 disk', [{ name: 's3', type: 's3' }], true],
		[
			'an object storage disk',
			[
				{ name: 'default', type: 'Local' },
				{ name: 's3_cache', type: 'ObjectStorage' },
			],
			true,
		],
	])('%s → %s', (_, disks, expected) => {
		expect(hasObjectStorageDisk(disks)).toBe(expected);
	});
});
