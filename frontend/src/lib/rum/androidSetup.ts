import type { RumtypesPIIPolicyDTO } from 'api/generated/services/fuseScope.schemas';

import { UploadTarget } from './sourceMapCommands';

export const ANDROID_SDK_ARTIFACT = 'io.fuseone.fusescope:android';
export const ANDROID_COMPOSE_ARTIFACT = 'io.fuseone.fusescope:android-compose';
export const ANDROID_PLUGIN_ID = 'io.fuseone.fusescope.android.mappings';
export const ANDROID_SDK_VERSION = '0.1.0-beta.1';
const ANDROID_SDK_PACKAGE = 'io.fuseone.fusescope.android';
export const MAPPING_FILE = 'app/build/outputs/mapping/release/mapping.txt';

export interface AndroidSnippetInput {
	applicationId: string;
	name: string;
	environment: string;
	publicKey: string;
	endpoint: string;
	sampleRate: number;
	piiPolicy: RumtypesPIIPolicyDTO;
}

const kotlinString = (value: string): string =>
	`"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;

/** settings.gradle.kts: the mapping plugin is published to Maven Central. */
export function gradleSettingsSnippet(): string {
	return [
		'pluginManagement {',
		'    repositories {',
		'        google()',
		'        mavenCentral()',
		'        gradlePluginPortal()',
		'    }',
		'}',
	].join('\n');
}

/** app/build.gradle.kts: the SDK, and the plugin that uploads R8 mappings. */
export function gradleDependencySnippet(): string {
	return [
		'plugins {',
		`    id("${ANDROID_PLUGIN_ID}") version "${ANDROID_SDK_VERSION}"`,
		'}',
		'',
		'dependencies {',
		`    implementation("${ANDROID_SDK_ARTIFACT}:${ANDROID_SDK_VERSION}")`,
		`    implementation("${ANDROID_COMPOSE_ARTIFACT}:${ANDROID_SDK_VERSION}") // optional, Compose and Navigation screens`,
		'}',
	].join('\n');
}

/** Only the privacy options that differ from the SDK defaults. */
function privacyArguments(policy: RumtypesPIIPolicyDTO): string[] {
	const entries: string[] = [];
	if (!policy.dropQuery) {
		entries.push('dropQuery = false');
	} else if (policy.queryAllowlist?.length) {
		entries.push(
			`queryAllowlist = listOf(${policy.queryAllowlist.map(kotlinString).join(', ')})`,
		);
	}
	if (!policy.hashUserId) {
		entries.push('hashUserId = false');
	}
	return entries;
}

/** The `FuseScope.init()` call for `Application.onCreate`, defaults left out. */
export function buildAndroidInitSnippet(input: AndroidSnippetInput): string {
	const config = [
		`applicationId = ${kotlinString(input.applicationId)}`,
		`key = ${kotlinString(input.publicKey)}`,
		`endpoint = ${kotlinString(input.endpoint)}`,
		`service = ${kotlinString(input.name)}`,
		'release = BuildConfig.VERSION_NAME',
	];
	if (input.environment) {
		config.push(`environment = ${kotlinString(input.environment)}`);
	}
	if (input.sampleRate < 1) {
		config.push(`sessionSampleRate = ${input.sampleRate}`);
	}
	if (input.piiPolicy.requireConsent) {
		config.push('requireConsent = true');
	}
	const imports = ['FuseScope', 'FuseScopeConfig'];
	const privacy = privacyArguments(input.piiPolicy);
	if (privacy.length > 0) {
		config.push(`privacy = PrivacyConfig(${privacy.join(', ')})`);
		imports.push('PrivacyConfig');
	}
	return [
		...imports.map((name) => `import ${ANDROID_SDK_PACKAGE}.${name}`),
		'',
		'class ShopApplication : Application() {',
		'    override fun onCreate() {',
		'        super.onCreate()',
		'        FuseScope.init(',
		'            this,',
		'            FuseScopeConfig(',
		...config.map((line) => `                ${line},`),
		'            ),',
		'        )',
		'    }',
		'}',
	].join('\n');
}

/** The plugin's settings; it uploads after each minified build. */
export function mappingGradleSnippet(target: UploadTarget): string {
	return [
		'fusescope {',
		`    endpoint.set(${kotlinString(target.url)})`,
		`    applicationId.set(${kotlinString(target.applicationId)})`,
		'    // the API key comes from FUSESCOPE_API_KEY',
		'}',
	].join('\n');
}

const mappingsUrl = (target: UploadTarget, base = '$FUSESCOPE_URL'): string =>
	`${base}/api/v1/rum/applications/${target.applicationId}/mappings?release=${encodeURIComponent(target.release)}`;

export function mappingCurlSnippet(target: UploadTarget): string {
	return [
		`curl -X POST "${mappingsUrl(target)}" \\`,
		'  -H "SigNoz-Api-Key: $FUSESCOPE_API_KEY" \\',
		'  -H "Content-Type: text/plain" \\',
		`  --data-binary @${MAPPING_FILE}`,
	].join('\n');
}

/** One release's upload, for the missing-mapping notice. */
export function mappingUploadCommand(target: UploadTarget): string {
	return [
		`curl -X POST "${mappingsUrl(target, target.url)}" \\`,
		'  -H "SigNoz-Api-Key: $FUSESCOPE_API_KEY" \\',
		`  --data-binary @${MAPPING_FILE}`,
	].join('\n');
}
