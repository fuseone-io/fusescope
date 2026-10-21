/** 36px text field on the sheet's raised surface, ring on focus. */
export const FIELD_INPUT =
	'tw:h-9 tw:w-full tw:min-w-0 tw:rounded-lg tw:border tw:border-input tw:bg-surface-raised tw:px-2.5 tw:text-[13px] tw:text-foreground tw:outline-none tw:transition-[box-shadow,border-color] tw:placeholder:text-subtle-foreground tw:focus-visible:border-ring tw:focus-visible:ring-[3px] tw:focus-visible:ring-ring/30 tw:disabled:cursor-not-allowed tw:disabled:opacity-60';

export const FIELD_TEXTAREA = `${FIELD_INPUT} tw:h-auto tw:min-h-9 tw:resize-y tw:py-2 tw:leading-snug`;

/** A previewed value: outlined monospace chip. */
export const VALUE_CHIP =
	'tw:inline-flex tw:h-5 tw:max-w-60 tw:items-center tw:rounded-sm tw:border tw:border-border tw:px-1.5 tw:font-mono tw:text-[11px] tw:whitespace-nowrap tw:text-muted-foreground';

const BADGE =
	'tw:inline-flex tw:h-5 tw:flex-none tw:items-center tw:gap-1.5 tw:rounded-sm tw:px-2 tw:text-xs tw:font-medium tw:whitespace-nowrap';

export const BADGE_NEUTRAL = `${BADGE} tw:bg-surface-sunken tw:text-muted-foreground`;
export const BADGE_INFO = `${BADGE} tw:bg-primary-soft tw:text-primary-ink`;
export const BADGE_WARNING = `${BADGE} tw:bg-warning-soft tw:text-warning-ink`;
export const BADGE_SUCCESS = `${BADGE} tw:bg-success-soft tw:text-success-ink`;
export const BADGE_ERROR = `${BADGE} tw:bg-error-soft tw:text-error-ink`;

export const BUTTON_SM = 'tw:h-8 tw:rounded-lg tw:px-2.5 tw:text-[13px]';
export const BUTTON_OUTLINE = `${BUTTON_SM} tw:border-input tw:bg-surface-raised tw:dark:border-input tw:dark:bg-surface-raised tw:dark:hover:bg-surface-sunken tw:hover:bg-surface-sunken`;
export const BUTTON_GHOST = `${BUTTON_SM} tw:text-muted-foreground tw:hover:bg-surface-sunken tw:hover:text-foreground tw:dark:hover:bg-surface-sunken`;
export const ICON_BUTTON =
	'tw:size-8 tw:rounded-lg tw:text-muted-foreground tw:hover:bg-surface-sunken tw:hover:text-foreground tw:dark:hover:bg-surface-sunken';
