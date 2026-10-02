import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@rsvp-site/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-none border font-heading font-semibold text-sm leading-tight outline-none transition-colors focus-visible:outline-2 focus-visible:outline-steel focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"border-steel bg-steel text-ground hover:bg-steel-600 active:bg-steel-700",
				outline:
					"border-divider bg-transparent text-ink hover:bg-ink/7 active:bg-ink/14 aria-expanded:bg-ink/7",
				secondary:
					"border-divider bg-surface text-ink hover:bg-neutral-300 active:bg-neutral-400",
				ghost:
					"border-transparent bg-transparent text-steel hover:bg-steel/10 active:bg-steel/18 aria-expanded:bg-steel/10",
				destructive:
					"border-destructive/30 bg-transparent text-destructive hover:bg-destructive/10 active:bg-destructive/20",
				link: "h-auto border-transparent bg-transparent px-0 text-steel-700 underline-offset-[3px] hover:text-steel-900 hover:underline",
			},
			size: {
				default: "min-h-9 px-3.5 py-2",
				xs: "min-h-6 px-2 py-1 text-xs [&_svg:not([class*='size-'])]:size-3",
				sm: "min-h-8 px-3 py-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: "min-h-10 px-5 py-2.5 text-base",
				icon: "size-9 p-0",
				"icon-xs": "size-6 p-0 [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-8 p-0",
				"icon-lg": "size-10 p-0",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
