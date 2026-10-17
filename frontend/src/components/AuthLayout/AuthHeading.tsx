import { ReactNode } from 'react';

interface AuthHeadingProps {
	id: string;
	title: string;
	description?: ReactNode;
}

function AuthHeading({
	id,
	title,
	description,
}: AuthHeadingProps): JSX.Element {
	return (
		<div className="tw:flex tw:flex-col tw:gap-1.5">
			<h1
				id={id}
				className="tw:text-2xl tw:leading-tight tw:font-semibold tw:tracking-[-0.025em]"
			>
				{title}
			</h1>
			{description && <p className="tw:text-muted-foreground">{description}</p>}
		</div>
	);
}

AuthHeading.defaultProps = {
	description: undefined,
};

export default AuthHeading;
