interface TruncatedFramesProps {
	testId: string;
}

/** The server keeps a bounded part of a stack the client sent. */
function TruncatedFrames({ testId }: TruncatedFramesProps): JSX.Element {
	return (
		<p
			data-testid={testId}
			className="tw:m-0 tw:px-1 tw:text-xs tw:text-muted-foreground"
		>
			… More frames not shown: the stack exceeded the size kept per event.
		</p>
	);
}

export default TruncatedFrames;
