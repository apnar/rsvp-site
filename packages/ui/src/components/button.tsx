import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@rsvp-site/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

/**
 * After Dark buttons are pills. `default` is the lime main action; `send`
 * is the pink one reserved for the moment mail goes out; `light` is the
 * white pill the design uses for a secondary action on a panel.
 */
const buttonVariants = cva(
	"group/button inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-full border font-bold text-sm leading-tight no-underline outline-none transition-[background-color,border-color,color,box-shadow] focus-visible:outline-2 focus-visible:outline-lime focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"border-lime bg-lime text-on-lime hover:border-lime-soft hover:bg-lime-soft hover:text-on-lime active:bg-lime/85",
				send: "border-pink bg-pink font-heading text-on-pink hover:border-pink-soft hover:bg-pink-soft hover:text-on-pink active:bg-pink/85",
				light:
					"border-ink bg-ink text-night hover:border-soft hover:bg-soft hover:text-night active:bg-haze",
				outline:
					"border-line-strong bg-transparent text-ink hover:border-haze hover:bg-ink/6 hover:text-ink active:bg-ink/12 aria-expanded:bg-ink/6",
				secondary:
					"border-ink bg-transparent text-ink hover:bg-ink/8 hover:text-ink active:bg-ink/14",
				pink: "border-pink bg-transparent text-pink-soft hover:bg-pink/12 hover:text-pink-soft active:bg-pink/20",
				ghost:
					"border-transparent bg-transparent text-soft hover:bg-ink/8 hover:text-ink active:bg-ink/14 aria-expanded:bg-ink/8",
				destructive:
					"border-destructive/50 bg-transparent text-destructive hover:bg-destructive/12 hover:text-destructive active:bg-destructive/20",
				link: "h-auto rounded-none border-transparent bg-transparent px-0 text-lime-ink underline-offset-[3px] hover:text-lime-soft hover:underline",
			},
			size: {
				default: "min-h-11 px-5 py-2.5",
				xs: "min-h-7 px-3 py-1 text-xs [&_svg:not([class*='size-'])]:size-3",
				sm: "min-h-9 px-4 py-2 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
				lg: "min-h-14 px-7 py-4 text-base",
				icon: "size-10 p-0",
				"icon-xs": "size-7 p-0 [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-9 p-0",
				"icon-lg": "size-11 p-0",
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
