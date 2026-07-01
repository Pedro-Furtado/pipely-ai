import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        button_previous:
          "absolute left-1 top-0 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-transparent p-0 text-zinc-400 opacity-50 hover:opacity-100 transition-opacity",
        button_next:
          "absolute right-1 top-0 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-transparent p-0 text-zinc-400 opacity-50 hover:opacity-100 transition-opacity",
        month_grid: "w-full border-collapse space-x-1",
        weekdays: "flex",
        weekday:
          "text-zinc-500 rounded-md w-8 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-zinc-800 [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-zinc-800/50 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
        day_button: cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md p-0 font-normal transition-colors",
          "hover:bg-zinc-800 hover:text-zinc-50",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400",
          "aria-selected:opacity-100"
        ),
        range_end: "day-range-end rounded-r-md",
        selected:
          "bg-zinc-50 text-zinc-900 hover:bg-zinc-50 hover:text-zinc-900 focus:bg-zinc-50 focus:text-zinc-900",
        today: "bg-zinc-800 text-zinc-50",
        outside:
          "day-outside text-zinc-600 aria-selected:text-zinc-400",
        disabled: "text-zinc-600 opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === "left" ? ChevronLeftIcon : ChevronRightIcon;
          return <Icon className="h-4 w-4" />;
        },
      }}
      {...props}
    />
  );
}

export { Calendar };
