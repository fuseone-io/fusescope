const RINGS = [
	{ r: 120, className: 'tw:stroke-primary tw:opacity-35' },
	{ r: 168, className: 'tw:stroke-primary tw:opacity-25' },
	{ r: 216, className: 'tw:stroke-brand-secondary tw:opacity-20' },
	{ r: 264, className: 'tw:stroke-brand-secondary tw:opacity-12' },
];

function RingMotif(): JSX.Element {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 600 600"
			className="tw:pointer-events-none tw:absolute tw:-right-[180px] tw:-bottom-[200px] tw:size-[600px]"
		>
			{RINGS.map(({ r, className }) => (
				<circle
					key={r}
					cx="300"
					cy="300"
					r={r}
					fill="none"
					strokeWidth="8"
					className={className}
				/>
			))}
		</svg>
	);
}

export default RingMotif;
