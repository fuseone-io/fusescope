import { ReactNode } from 'react';

interface DrawerFieldProps {
	label: string;
	htmlFor: string;
	children: ReactNode;
}

/** A labelled field in a settings side sheet. */
function DrawerField({
	label,
	htmlFor,
	children,
}: DrawerFieldProps): JSX.Element {
	return (
		<div className="settings-drawer-field tw:flex tw:flex-col tw:gap-2">
			<label
				className="tw:text-[13px] tw:font-medium tw:text-foreground"
				htmlFor={htmlFor}
			>
				{label}
			</label>
			{children}
		</div>
	);
}

export default DrawerField;
