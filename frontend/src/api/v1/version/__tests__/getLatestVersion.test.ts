import axios from 'axios';

import getLatestVersion from '../getLatestVersion';

jest.mock('axios');

it('checks FuseScope releases rather than upstream SigNoz releases', async () => {
	const release = {
		tag_name: 'v0.151.0',
		html_url: 'https://github.com/fuseone-io/fusescope/releases/tag/v0.151.0',
	};
	const get = jest.spyOn(axios, 'get').mockResolvedValue({ data: release });

	const result = await getLatestVersion();

	expect(get).toHaveBeenCalledWith(
		'https://api.github.com/repos/fuseone-io/fusescope/releases/latest',
	);
	expect(result.payload).toStrictEqual(release);
});
