import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: TabsPrimitive.TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn("flex h-8 items-center gap-1", className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative flex h-8 cursor-pointer items-center px-2.5 text-xs text-muted-foreground transition-colors duration-150 outline-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-transparent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:after:bg-primary",
        className,
      )}
      {...props}
    />
  );
}
