const TITLES = {
	Server: 'Enforced by the FuseScope gateway; takes effect on save',
	SDK: 'Read by the SDK from the snippet; redeploy your app after changing it',
};

interface WhereTagProps {
	where: keyof typeof TITLES;
}

/** Whether a setting is enforced by the server or written into the SDK snippet. */
function WhereTag({ where }: WhereTagProps): JSX.Element {
	return (
		<span
			title={TITLES[where]}
			data-where={where}
			className="tw:inline-flex tw:h-[18px] tw:items-center tw:rounded-sm tw:border tw:border-border tw:px-1.5 tw:text-[10px] tw:font-medium tw:tracking-[0.04em] tw:text-muted-foreground tw:uppercase"
		>
			{where}
		</span>
	);
}

export default WhereTag;
