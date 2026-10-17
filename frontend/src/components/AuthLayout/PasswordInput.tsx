import { ComponentPropsWithoutRef, useState } from 'react';
import { Input } from 'components/ui/input';
import { cn } from 'lib/utils';
import { Eye, EyeOff } from 'lucide-react';

import { AUTH_INPUT_CLASS } from './classNames';

type PasswordInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type'>;

function PasswordInput({
	className,
	...props
}: PasswordInputProps): JSX.Element {
	const [visible, setVisible] = useState(false);
	const Icon = visible ? EyeOff : Eye;

	return (
		<div className="tw:relative">
			<Input
				{...props}
				type={visible ? 'text' : 'password'}
				className={cn(AUTH_INPUT_CLASS, 'tw:pr-12', className)}
			/>
			<button
				type="button"
				aria-label={visible ? 'Hide password' : 'Show password'}
				aria-pressed={visible}
				onClick={(): void => setVisible((current) => !current)}
				className="tw:absolute tw:top-1 tw:right-1 tw:flex tw:size-9 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-md tw:text-muted-foreground tw:outline-none tw:hover:bg-muted tw:hover:text-foreground tw:focus-visible:ring-[3px] tw:focus-visible:ring-ring/50"
			>
				<Icon aria-hidden="true" strokeWidth={1.5} className="tw:size-[18px]" />
			</button>
		</div>
	);
}

export default PasswordInput;
