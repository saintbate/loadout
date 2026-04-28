import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-neutral-100 text-neutral-700 ring-1 ring-inset ring-neutral-200",
        verified: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
        untested: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
        proposed: "bg-neutral-100 text-neutral-600 ring-1 ring-inset ring-neutral-200",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
