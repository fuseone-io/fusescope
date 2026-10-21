import { groupStackLines, parseStackTrace, StackLineKind } from '../stackTrace';

type Expected = [string, StackLineKind, boolean][];

const kinds = (text: string): Expected =>
	parseStackTrace(text).map((line) => [line.text, line.kind, line.frame]);

describe('parseStackTrace', () => {
	it.each<[string, string, Expected]>([
		[
			'go',
			[
				'*errors.errorString: redis timeout',
				'goroutine 51 [running]:',
				'github.com/acme/app/pkg/cache.(*Client).Get(0xc000112a80)',
				'\t/app/pkg/cache/client.go:118 +0x2c5',
				'google.golang.org/grpc.(*Server).processUnaryRPC(0xc000196000, ...)',
				'\t/go/pkg/mod/google.golang.org/grpc@v1.66.0/server.go:1394 +0xe2b',
				'net/http.serverHandler.ServeHTTP({0xc00018e000})',
				'\t/usr/local/go/src/net/http/server.go:2938 +0x8e',
			].join('\n'),
			[
				['*errors.errorString: redis timeout', 'title', false],
				['goroutine 51 [running]:', 'note', false],
				['github.com/acme/app/pkg/cache.(*Client).Get(0xc000112a80)', 'app', true],
				['\t/app/pkg/cache/client.go:118 +0x2c5', 'app', false],
				[
					'google.golang.org/grpc.(*Server).processUnaryRPC(0xc000196000, ...)',
					'library',
					true,
				],
				[
					'\t/go/pkg/mod/google.golang.org/grpc@v1.66.0/server.go:1394 +0xe2b',
					'library',
					false,
				],
				['net/http.serverHandler.ServeHTTP({0xc00018e000})', 'library', true],
				['\t/usr/local/go/src/net/http/server.go:2938 +0x8e', 'library', false],
			],
		],
		[
			'java',
			[
				'java.net.SocketTimeoutException: Read timed out',
				'\tat java.base/java.net.SocketInputStream.read(SocketInputStream.java:168)',
				'\tat okhttp3.internal.connection.Exchange.readResponseHeaders(Exchange.kt:106)',
				'\tat io.acme.payment.GatewayClient.authorize(GatewayClient.java:74)',
				'Caused by: java.io.IOException: closed',
				'\t... 12 more',
			].join('\n'),
			[
				['java.net.SocketTimeoutException: Read timed out', 'title', false],
				[
					'\tat java.base/java.net.SocketInputStream.read(SocketInputStream.java:168)',
					'library',
					true,
				],
				[
					'\tat okhttp3.internal.connection.Exchange.readResponseHeaders(Exchange.kt:106)',
					'library',
					true,
				],
				[
					'\tat io.acme.payment.GatewayClient.authorize(GatewayClient.java:74)',
					'app',
					true,
				],
				['Caused by: java.io.IOException: closed', 'title', false],
				['\t... 12 more', 'note', false],
			],
		],
		[
			'python',
			[
				'Traceback (most recent call last):',
				'  File "/usr/local/lib/python3.11/site-packages/requests/sessions.py", line 637, in post',
				'    return self.request("POST", url)',
				'  File "/app/checkout/views.py", line 82, in place_order',
				'    response = session.post(url)',
				'requests.exceptions.ConnectionError: Read timed out. (read timeout=2)',
			].join('\n'),
			[
				['Traceback (most recent call last):', 'note', false],
				[
					'  File "/usr/local/lib/python3.11/site-packages/requests/sessions.py", line 637, in post',
					'library',
					true,
				],
				['    return self.request("POST", url)', 'library', false],
				['  File "/app/checkout/views.py", line 82, in place_order', 'app', true],
				['    response = session.post(url)', 'app', false],
				[
					'requests.exceptions.ConnectionError: Read timed out. (read timeout=2)',
					'title',
					false,
				],
			],
		],
		[
			'node',
			[
				"TypeError: Cannot read properties of undefined (reading 'id')",
				'    at handler (/app/src/routes/cart.js:12:5)',
				'    at Layer.handle (/app/node_modules/express/lib/router/layer.js:95:5)',
				'    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
			].join('\n'),
			[
				[
					"TypeError: Cannot read properties of undefined (reading 'id')",
					'title',
					false,
				],
				['    at handler (/app/src/routes/cart.js:12:5)', 'app', true],
				[
					'    at Layer.handle (/app/node_modules/express/lib/router/layer.js:95:5)',
					'library',
					true,
				],
				[
					'    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
					'library',
					true,
				],
			],
		],
		[
			'.NET',
			[
				'Grpc.Core.RpcException: Status(StatusCode="Unavailable")',
				'   at System.Net.Http.HttpConnection.SendAsync(HttpRequestMessage request)',
				'   at cart.services.CartService.GetCart(GetCartRequest request) in /app/services/CartService.cs:line 40',
			].join('\n'),
			[
				[
					'Grpc.Core.RpcException: Status(StatusCode="Unavailable")',
					'title',
					false,
				],
				[
					'   at System.Net.Http.HttpConnection.SendAsync(HttpRequestMessage request)',
					'library',
					true,
				],
				[
					'   at cart.services.CartService.GetCart(GetCartRequest request) in /app/services/CartService.cs:line 40',
					'app',
					true,
				],
			],
		],
	])('classifies a %s stack trace', (_language, text, expected) => {
		expect(kinds(text)).toStrictEqual(expected);
	});

	it('returns nothing for an empty or blank stack trace', () => {
		expect(parseStackTrace('')).toStrictEqual([]);
		expect(parseStackTrace('  \n\t')).toStrictEqual([]);
	});

	it('normalises Windows line endings', () => {
		expect(kinds('Error: boom\r\n    at run (/app/x.js:1:1)')).toStrictEqual([
			['Error: boom', 'title', false],
			['    at run (/app/x.js:1:1)', 'app', true],
		]);
	});
});

describe('groupStackLines', () => {
	it('folds each run of library lines into one block with its frame count', () => {
		const lines = parseStackTrace(
			[
				'Error: boom',
				'    at a (/app/a.js:1:1)',
				'    at b (/app/node_modules/x/b.js:1:1)',
				'    at c (/app/node_modules/x/c.js:1:1)',
				'    at d (/app/d.js:1:1)',
				'    at e (node:internal/e:1:1)',
			].join('\n'),
		);

		expect(
			groupStackLines(lines).map((block) =>
				block.kind === 'library'
					? ['library', block.frames, block.lines.length]
					: ['lines', block.lines.length],
			),
		).toStrictEqual([
			['lines', 2],
			['library', 2, 2],
			['lines', 1],
			['library', 1, 1],
		]);
	});
});
