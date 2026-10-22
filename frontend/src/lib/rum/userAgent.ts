const BROWSERS: [RegExp, string][] = [
	[/Edg\/(\d+)/, 'Edge'],
	[/(?:Headless)?Chrome\/(\d+)/, 'Chrome'],
	[/Firefox\/(\d+)/, 'Firefox'],
	[/Version\/(\d+)[.\d]* (?:Mobile\/\S+ )?Safari/, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
	[/Android/, 'Android'],
	[/iPhone|iPad|iPod/, 'iOS'],
	[/Windows/, 'Windows'],
	[/Mac OS X|Macintosh/, 'macOS'],
	[/CrOS/, 'ChromeOS'],
	[/Linux/, 'Linux'],
];

/** "Chrome 130 · Windows" from `user_agent.original`. */
export function describeUserAgent(userAgent: string): string {
	if (!userAgent) {
		return '—';
	}
	const browser = BROWSERS.map(
		([pattern, name]) => [pattern.exec(userAgent), name] as const,
	).find(([match]) => match !== null);
	if (!browser) {
		return 'Other';
	}
	const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent));
	const label = `${browser[1]} ${browser[0]?.[1] ?? ''}`.trim();
	return system ? `${label} · ${system[1]}` : label;
}
