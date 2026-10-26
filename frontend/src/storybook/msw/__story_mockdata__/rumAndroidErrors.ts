import type {
	RumtypesErrorCauseDTO,
	RumtypesErrorEventDTO,
	RumtypesErrorGroupDTO,
	RumtypesGettableErrorGroupDTO,
	RumtypesGettableErrorGroupsDTO,
	RumtypesStackFrameDTO,
} from 'api/generated/services/fuseScope.schemas';
import {
	RumtypesArtifactKindDTO,
	RumtypesErrorCauseRelationDTO,
} from 'api/generated/services/fuseScope.schemas';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

export const ANDROID_CRASH = 'c0ffee0012345678';
export const ANDROID_ANR = 'a11a0000deadbeef';
export const ANDROID_RELEASE = '2.1.0';

type Original = [fn: string, file: string, line: number, inlined?: boolean];

const frame = (
	fn: string,
	file: string,
	line: number,
	original?: Original,
): RumtypesStackFrameDTO => ({
	function: fn,
	file,
	line,
	column: 0,
	original: original
		? {
				function: original[0],
				file: original[1],
				line: original[2],
				column: 0,
				inApp: !original[0].startsWith('android.'),
				inlined: original[3] ?? false,
				sourceMap: '/mapping.txt',
				context: null,
			}
		: null,
});

function crashFrames(mapped: boolean): RumtypesStackFrameDTO[] {
	const retraced = (original: Original): Original | undefined =>
		mapped ? original : undefined;
	const top = [
		frame(
			'a.b.a',
			'SourceFile',
			6,
			retraced(['com.example.shop.Item.price', 'Item.kt', 15, true]),
		),
		frame(
			'a.b.a',
			'SourceFile',
			6,
			retraced(['com.example.shop.Cart.subtotal', 'Cart.kt', 44]),
		),
	];
	return [
		...(mapped ? top : top.slice(0, 1)),
		frame(
			'a.b.b',
			'SourceFile',
			2,
			retraced(['com.example.shop.Cart.checkout', 'Cart.kt', 51]),
		),
		frame('android.app.Activity.performCreate', 'Activity.java', 8595),
		frame('android.app.ActivityThread.main', 'ActivityThread.java', 8177),
	];
}

const CRASH_STACK = [
	'a.a: Cart is empty',
	'\tat a.b.a(SourceFile:6)',
	'\tat a.b.b(SourceFile:2)',
	'\tat android.app.Activity.performCreate(Activity.java:8595)',
	'\tat android.app.ActivityThread.main(ActivityThread.java:8177)',
	"Caused by: java.lang.NullPointerException: Attempt to invoke virtual method 'long a.d.a()' on a null object reference",
	'\tat a.b.a(SourceFile:6)',
	'\t... 3 more',
].join('\n');

function causes(mapped: boolean): RumtypesErrorCauseDTO[] {
	return [
		{
			type: 'java.lang.NullPointerException',
			message:
				"Attempt to invoke virtual method 'long a.d.a()' on a null object reference",
			relation: RumtypesErrorCauseRelationDTO.caused_by,
			frames: [
				frame(
					'a.b.a',
					'SourceFile',
					6,
					mapped ? ['com.example.shop.Cart.subtotal', 'Cart.kt', 44] : undefined,
				),
			],
			omittedFrames: 3,
		},
	];
}

const sparkline = (counts: number[]): RumtypesErrorGroupDTO['sparkline'] => ({
	start: ago(24 * HOUR),
	stepSeconds: 3600,
	counts,
});

export const RUM_ANDROID_ERROR_GROUPS: RumtypesErrorGroupDTO[] = [
	{
		fingerprint: ANDROID_CRASH,
		type: 'com.example.shop.CartException',
		message: 'Cart is empty',
		normalizedMessage: 'Cart is empty',
		topFrame: crashFrames(true)[0],
		source: 'crash',
		route: 'CheckoutScreen',
		events: 41,
		sessions: 37,
		firstSeenAt: ago(20 * HOUR),
		firstSeenRelease: ANDROID_RELEASE,
		lastSeenAt: ago(12 * MINUTE),
		lastSeenRelease: ANDROID_RELEASE,
		releases: [ANDROID_RELEASE],
		newInRelease: false,
		sparkline: sparkline([0, 1, 2, 4, 3, 2, 5, 3, 4, 6, 5, 6]),
	},
	{
		fingerprint: ANDROID_ANR,
		type: 'ANR',
		message: 'Application Not Responding',
		normalizedMessage: 'Application Not Responding',
		topFrame: frame('com.example.shop.CheckoutActivity.a', 'SourceFile', 9, [
			'com.example.shop.CheckoutActivity.onPay',
			'CheckoutActivity.kt',
			40,
		]),
		source: 'anr',
		route: 'CheckoutScreen',
		events: 6,
		sessions: 6,
		firstSeenAt: ago(9 * HOUR),
		firstSeenRelease: ANDROID_RELEASE,
		lastSeenAt: ago(48 * MINUTE),
		lastSeenRelease: ANDROID_RELEASE,
		releases: [ANDROID_RELEASE],
		newInRelease: false,
		sparkline: sparkline([0, 0, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1]),
	},
];

/** A crash and an ANR of shop-android; without `mapped`, frames stay obfuscated. */
export function rumAndroidErrorGroups({
	mapped = true,
}: { mapped?: boolean } = {}): RumtypesGettableErrorGroupsDTO {
	const groups = RUM_ANDROID_ERROR_GROUPS.map((group) =>
		mapped || !group.topFrame
			? group
			: { ...group, topFrame: { ...group.topFrame, original: null } },
	);
	return {
		groups,
		total: groups.length,
		events: groups.reduce((sum, group) => sum + group.events, 0),
		sessions: 1_900,
	};
}

/** The crash group; without `mapped`, its release has no R8 mapping. */
export function rumAndroidErrorGroup({
	mapped = true,
}: { mapped?: boolean } = {}): RumtypesGettableErrorGroupDTO {
	const event: RumtypesErrorEventDTO = {
		id: 'ev-android-1',
		timestamp: ago(12 * MINUTE),
		sessionId: 'session-android-1',
		route: 'CheckoutScreen',
		release: ANDROID_RELEASE,
		client: {
			browser: '',
			browserVersion: '',
			device: 'Google Pixel 9',
			os: 'Android',
			osVersion: '15',
		},
		type: mapped ? 'com.example.shop.CartException' : 'a.a',
		message: 'Cart is empty',
		source: 'crash',
		stacktrace: CRASH_STACK,
		frames: crashFrames(mapped),
		causes: causes(mapped),
		symbolicated: mapped,
		missingSourceMap: mapped
			? null
			: { release: ANDROID_RELEASE, kind: RumtypesArtifactKindDTO['r8-mapping'] },
	};
	return {
		...RUM_ANDROID_ERROR_GROUPS[0],
		latestEvents: [event],
		selectedEventId: event.id,
		breadcrumbs: [],
		linkedRequest: null,
		affectedSessions: [
			{
				sessionId: event.sessionId,
				startedAt: ago(20 * MINUTE),
				lastErrorAt: event.timestamp,
				release: ANDROID_RELEASE,
				client: event.client,
				views: 4,
				errors: 1,
			},
		],
	};
}
