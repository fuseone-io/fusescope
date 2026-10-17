import { Avatar, AvatarFallback } from 'components/ui/avatar';
import { Badge } from 'components/ui/badge';
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from 'components/ui/breadcrumb';
import { Button } from 'components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from 'components/ui/card';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { Input } from 'components/ui/input';
import { Kbd } from 'components/ui/kbd';
import { Label } from 'components/ui/label';
import { Separator } from 'components/ui/separator';
import { Skeleton } from 'components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/ui/tabs';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from 'components/ui/tooltip';
import { ChevronDown, Plus } from 'lucide-react';

const BADGE_VARIANTS = [
	'default',
	'secondary',
	'outline',
	'destructive',
] as const;
const BUTTON_VARIANTS = [
	'default',
	'secondary',
	'outline',
	'ghost',
	'link',
	'destructive',
] as const;

export default function ComponentsFixture(): JSX.Element {
	return (
		<TooltipProvider>
			<div className="fs-ui tw:flex tw:min-h-svh tw:flex-col tw:gap-6 tw:bg-background tw:p-6 tw:font-sans tw:text-foreground">
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink href="#">Services</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>checkout</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>

				<div className="tw:flex tw:flex-wrap tw:gap-2">
					{BUTTON_VARIANTS.map((variant) => (
						<Button key={variant} variant={variant}>
							{variant}
						</Button>
					))}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button size="icon" variant="outline" aria-label="Add">
								<Plus />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Add panel</TooltipContent>
					</Tooltip>
				</div>

				<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
					{BADGE_VARIANTS.map((variant) => (
						<Badge key={variant} variant={variant}>
							{variant}
						</Badge>
					))}
					<Badge className="tw:bg-success-soft tw:text-success-ink">healthy</Badge>
					<Badge className="tw:bg-warning-soft tw:text-warning-ink">degraded</Badge>
					<Badge className="tw:bg-error-soft tw:text-error-ink">failing</Badge>
					<Kbd>⌘ B</Kbd>
				</div>

				<Card className="tw:max-w-md">
					<CardHeader>
						<CardTitle>Retention</CardTitle>
						<CardDescription>How long FuseScope keeps raw logs.</CardDescription>
						<CardAction>
							<Avatar>
								<AvatarFallback>FS</AvatarFallback>
							</Avatar>
						</CardAction>
					</CardHeader>
					<CardContent className="tw:flex tw:flex-col tw:gap-2">
						<Label htmlFor="retention-days">Days</Label>
						<Input id="retention-days" placeholder="15" />
						<Skeleton className="tw:h-4 tw:w-2/3" />
					</CardContent>
					<Separator />
					<CardFooter className="tw:justify-end tw:gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline">
									Apply to <ChevronDown />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent>
								<DropdownMenuLabel>Signals</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuItem>Logs</DropdownMenuItem>
								<DropdownMenuItem>Traces</DropdownMenuItem>
								<DropdownMenuItem>Metrics</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						<Button>Save</Button>
					</CardFooter>
				</Card>

				<Tabs defaultValue="overview" className="tw:max-w-md">
					<TabsList>
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="traces">Traces</TabsTrigger>
					</TabsList>
					<TabsContent value="overview">
						Latency, error rate and throughput.
					</TabsContent>
					<TabsContent value="traces">Slowest spans.</TabsContent>
				</Tabs>
			</div>
		</TooltipProvider>
	);
}
