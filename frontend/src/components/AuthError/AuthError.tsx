import { CircleAlert } from 'lucide-react';
import APIError from 'types/api/error';

interface AuthErrorProps {
	error: APIError;
}

function AuthError({ error }: AuthErrorProps): JSX.Element {
	const { message, errors, url } = error.error.error;
	const details = (errors ?? []).filter((detail) => detail.message);

	return (
		<div
			role="alert"
			className="tw:flex tw:items-start tw:gap-2.5 tw:rounded-md tw:bg-error-soft tw:px-3 tw:py-2.5 tw:text-[13px] tw:text-error-ink"
		>
			<CircleAlert
				aria-hidden="true"
				strokeWidth={1.75}
				className="tw:mt-px tw:size-[18px] tw:flex-none"
			/>
			<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1 tw:break-words">
				<span>{message || 'Something went wrong'}</span>
				{details.length > 0 && (
					<ul className="tw:flex tw:list-disc tw:flex-col tw:gap-0.5 tw:pl-4">
						{details.map((detail) => (
							<li key={detail.message}>{detail.message}</li>
						))}
					</ul>
				)}
				{url && (
					<a
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						className="tw:font-medium tw:text-error-ink! tw:underline"
					>
						Learn more
					</a>
				)}
			</div>
		</div>
	);
}

export default AuthError;
