import {
	Database,
	Globe,
	MessagesSquare,
	Network,
	Server,
	Zap,
	ExternalLink,
} from 'lucide-react';

import { getServiceKind, ServiceKindInfo } from '../serviceKind';

const info = (overrides: Partial<ServiceKindInfo>): ServiceKindInfo => ({
	name: 'svc',
	...overrides,
});

describe('getServiceKind', () => {
	it.each([
		[
			'frontend: HTTP server spans',
			info({ name: 'frontend', httpServerSpans: 1330 }),
			'web',
		],
		[
			'customer: HTTP server spans',
			info({ name: 'customer', httpServerSpans: 1330, serverSpans: 1330 }),
			'web',
		],
		[
			'driver: rpc.method server spans',
			info({ name: 'driver', rpcServerSpans: 1330, serverSpans: 1330 }),
			'rpc',
		],
		[
			'mostly RPC wins over a little HTTP',
			info({ rpcServerSpans: 90, httpServerSpans: 10 }),
			'rpc',
		],
		['mysql by name', info({ name: 'mysql' }), 'database'],
		['postgres-primary by name', info({ name: 'postgres-primary' }), 'database'],
		[
			'db.system on its spans',
			info({ name: 'orders-store', dbSpans: 4 }),
			'database',
		],
		['a database peer', info({ name: 'ledger', databasePeer: true }), 'database'],
		['redis-manual by name', info({ name: 'redis-manual', dbSpans: 9 }), 'cache'],
		[
			'memcached by db.system',
			info({ name: 'sessions', dbSystem: 'memcached' }),
			'cache',
		],
		['kafka by name', info({ name: 'kafka-broker' }), 'queue'],
		[
			'messaging.system on its spans',
			info({ name: 'orders-consumer', messagingSpans: 3 }),
			'queue',
		],
		['grpc in the name', info({ name: 'auth-grpc' }), 'rpc'],
		['gateway by name', info({ name: 'api-gateway' }), 'web'],
		[
			'only an external call target',
			info({ name: '1.2.3.4', externalOnly: true }),
			'external',
		],
		[
			'payment: nothing to go on',
			info({ name: 'payment', serverSpans: 1196 }),
			'service',
		],
	])('%s', (_, input, expected) => {
		expect(getServiceKind(input).kind).toBe(expected);
	});

	it('gives each kind its icon and label', () => {
		expect(getServiceKind(info({ name: 'mysql' }))).toStrictEqual({
			kind: 'database',
			icon: Database,
			label: 'Database',
		});
		expect(getServiceKind(info({ name: 'redis' })).icon).toBe(Zap);
		expect(getServiceKind(info({ name: 'kafka' })).icon).toBe(MessagesSquare);
		expect(getServiceKind(info({ rpcServerSpans: 1 })).icon).toBe(Network);
		expect(getServiceKind(info({ name: 'web' })).icon).toBe(Globe);
		expect(getServiceKind(info({ externalOnly: true })).icon).toBe(ExternalLink);
		expect(getServiceKind(info({})).icon).toBe(Server);
	});
});
