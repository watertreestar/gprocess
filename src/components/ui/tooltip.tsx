import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export function TooltipProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={400}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  ...props
}: TooltipPrimitive.TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={cn(
          "z-50 max-w-72 rounded-md bg-foreground px-3 py-1.5 text-xs break-words text-background shadow-md data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0",
          className,
        )}
        sideOffset={6}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
