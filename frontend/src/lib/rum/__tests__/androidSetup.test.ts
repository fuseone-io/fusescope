import {
	ANDROID_PLUGIN_ID,
	ANDROID_SDK_ARTIFACT,
	buildAndroidInitSnippet,
	gradleDependencySnippet,
	gradleSettingsSnippet,
	mappingCurlSnippet,
	mappingGradleSnippet,
	mappingUploadCommand,
} from '../androidSetup';

const INPUT = {
	applicationId: 'app-1',
	environment: 'production',
	publicKey: 'rum_pub_abc',
	endpoint: 'https://fusescope.example.com',
	sampleRate: 1,
	tracePropagationUrls: [],
	piiPolicy: {
		dropQuery: true,
		queryAllowlist: [],
		urlAllowlist: [],
		geoLookup: false,
		requireConsent: false,
		hashUserId: true,
	},
};

const TARGET = {
	url: 'https://fusescope.example.com',
	applicationId: 'app-1',
	release: '2.1.0',
};

describe('gradleDependencySnippet', () => {
	it('adds the SDK, the optional Compose module and the mapping plugin from Maven Central', () => {
		const snippet = gradleDependencySnippet();
		expect(ANDROID_SDK_ARTIFACT).toBe('io.fuseone.fusescope:android');
		expect(ANDROID_PLUGIN_ID).toBe('io.fuseone.fusescope.android.mappings');
		expect(snippet).toContain(
			'id("io.fuseone.fusescope.android.mappings") version "0.1.0-beta.2"',
		);
		expect(snippet).toContain(
			'implementation("io.fuseone.fusescope:android:0.1.0-beta.2")',
		);
		expect(snippet).toContain(
			'implementation("io.fuseone.fusescope:android-compose:0.1.0-beta.2") // optional',
		);
	});
});

describe('gradleSettingsSnippet', () => {
	it('resolves the plugin from Maven Central', () => {
		const snippet = gradleSettingsSnippet();
		expect(snippet).toMatch(/^pluginManagement \{\n {4}repositories \{/);
		expect(snippet).toContain('        mavenCentral()');
		expect(snippet).toContain('        gradlePluginPortal()');
	});
});

describe('buildAndroidInitSnippet', () => {
	it('initializes from Application.onCreate, leaving service and release to their defaults', () => {
		const snippet = buildAndroidInitSnippet(INPUT);
		expect(snippet).toContain('import io.fuseone.fusescope.android.FuseScope\n');
		expect(snippet).toContain(
			'import io.fuseone.fusescope.android.FuseScopeConfig\n',
		);
		expect(snippet).not.toContain('PrivacyConfig');
		expect(snippet).toContain('FuseScope.init(');
		expect(snippet).toContain('applicationId = "app-1"');
		expect(snippet).toContain('key = "rum_pub_abc"');
		expect(snippet).toContain('endpoint = "https://fusescope.example.com"');
		expect(snippet).not.toContain('service =');
		expect(snippet).not.toContain('release =');
		expect(snippet).not.toContain('BuildConfig');
		expect(snippet).not.toContain('traceparentHosts');
		expect(snippet).toContain('environment = "production"');
		expect(snippet).not.toContain('sessionSampleRate');
		expect(snippet).not.toContain('requireConsent');
	});

	it('writes only the settings that differ from the defaults', () => {
		const snippet = buildAndroidInitSnippet({
			...INPUT,
			sampleRate: 0.25,
			piiPolicy: { ...INPUT.piiPolicy, requireConsent: true, hashUserId: false },
		});
		expect(snippet).toContain('sessionSampleRate = 0.25');
		expect(snippet).toContain('requireConsent = true');
		expect(snippet).toContain('privacy = PrivacyConfig(hashUserId = false)');
		expect(snippet).toContain(
			'import io.fuseone.fusescope.android.PrivacyConfig\n',
		);
	});

	it('sends traceparent to the hosts of the trace propagation URLs', () => {
		expect(
			buildAndroidInitSnippet({
				...INPUT,
				tracePropagationUrls: [
					'https://api.example.com/v1',
					'https://API.example.com/v2',
					'http://pay.example.com:8443/',
				],
			}),
		).toContain(
			'traceparentHosts = listOf("api.example.com", "pay.example.com")',
		);
	});

	it('escapes Kotlin string literals', () => {
		expect(
			buildAndroidInitSnippet({ ...INPUT, environment: 'prod "beta" $x' }),
		).toContain('environment = "prod \\"beta\\" \\$x"');
	});
});

describe('mapping upload snippets', () => {
	it('configures the Gradle plugin, the key staying in the environment', () => {
		const snippet = mappingGradleSnippet(TARGET);
		expect(snippet).toContain('fusescope {');
		expect(snippet).toContain('endpoint.set("https://fusescope.example.com")');
		expect(snippet).toContain('applicationId.set("app-1")');
		expect(snippet).toContain('FUSESCOPE_API_KEY');
	});

	it('posts the mapping as the raw body', () => {
		const snippet = mappingCurlSnippet(TARGET);
		expect(snippet).toContain(
			'/api/v1/rum/applications/app-1/mappings?release=2.1.0&map_id=$R8_MAP_ID',
		);
		expect(snippet).toContain('SigNoz-Api-Key: $FUSESCOPE_API_KEY');
		expect(snippet).toContain(
			'--data-binary @app/build/outputs/mapping/release/mapping.txt',
		);
	});

	it('uploads one release from the command line', () => {
		expect(mappingUploadCommand(TARGET)).toContain(
			'curl -X POST "https://fusescope.example.com/api/v1/rum/applications/app-1/mappings?release=2.1.0"',
		);
	});
});
