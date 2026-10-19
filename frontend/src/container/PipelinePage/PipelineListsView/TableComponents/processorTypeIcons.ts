import {
	Braces,
	Clock,
	Copy,
	Gauge,
	type LucideIcon,
	MoveRight,
	Plus,
	Regex,
	ScanText,
	Trash2,
	Waypoints,
} from 'lucide-react';

/** An icon per processor type, shown beside its label in the processor list. */
export const PROCESSOR_TYPE_ICONS: Record<string, LucideIcon> = {
	grok_parser: ScanText,
	regex_parser: Regex,
	json_parser: Braces,
	trace_parser: Waypoints,
	time_parser: Clock,
	severity_parser: Gauge,
	add: Plus,
	remove: Trash2,
	move: MoveRight,
	copy: Copy,
};
