import { buildSetRetentionProps } from '../buildSetRetentionProps';

describe('buildSetRetentionProps', () => {
	it.each([
		['metrics', null],
		['metrics', -1],
		['traces', null],
		['traces', 0],
	] as const)(
		'omits cold storage for %s when the S3 duration is %s',
		(type, s3RetentionHours) => {
			expect(
				buildSetRetentionProps({
					type,
					totalRetentionHours: 720,
					s3RetentionHours,
					s3Enabled: true,
				}),
			).toStrictEqual({ type, totalDuration: '720h' });
		},
	);

	it('omits cold storage when no S3 disk is configured', () => {
		expect(
			buildSetRetentionProps({
				type: 'metrics',
				totalRetentionHours: 720,
				s3RetentionHours: 168,
				s3Enabled: false,
			}),
		).toStrictEqual({ type: 'metrics', totalDuration: '720h' });
	});

	it('sends cold storage when S3 is configured and a duration is set', () => {
		expect(
			buildSetRetentionProps({
				type: 'traces',
				totalRetentionHours: 720,
				s3RetentionHours: 168,
				s3Enabled: true,
			}),
		).toStrictEqual({
			type: 'traces',
			totalDuration: '720h',
			coldStorage: 's3',
			toColdDuration: '168h',
		});
	});
});
