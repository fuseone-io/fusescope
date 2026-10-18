import { ReactNode } from 'react';

interface QuestionFieldProps {
	question: ReactNode;
	children: ReactNode;
}

function QuestionField({
	question,
	children,
}: QuestionFieldProps): JSX.Element {
	return (
		<fieldset className="fs-ui tw:flex tw:min-w-0 tw:flex-col tw:gap-3 tw:font-sans">
			<legend className="tw:mb-3 tw:text-sm tw:font-semibold tw:text-foreground">
				{question}
			</legend>
			{children}
		</fieldset>
	);
}

export default QuestionField;
