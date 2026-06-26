import * as React from "react"
import { cn } from "@/lib/utils"
import { Tooltip as RechartsTooltip } from "recharts"

// ─── CHART CONFIG ─────────────────────────────────────────────────────────────

export type ChartConfig = Record<
  string,
  {
    label: string
    color: string
    icon?: React.ComponentType
  }
>

interface ChartContextValue {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextValue | null>(null)

export function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }
  return context
}

// ─── CHART CONTAINER ──────────────────────────────────────────────────────────

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig
  children: React.ReactElement
}

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ className, config, children, ...props }, ref) => {
    const cssVars = Object.entries(config).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        acc[`--color-${key}`] = value.color
        return acc
      },
      {}
    )

    return (
      <ChartContext.Provider value={{ config }}>
        <div
          ref={ref}
          className={cn(
            "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-zinc-400 [&_.recharts-cartesian-grid_line]:stroke-zinc-800 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-zinc-700 [&_.recharts-polar-grid_[stroke]]:stroke-zinc-800 [&_.recharts-radial-bar-background-sector]:fill-zinc-800 [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-zinc-800/50 [&_.recharts-reference-line_[stroke]]:stroke-zinc-700 [&_.recharts-sector[stroke]]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
            className
          )}
          style={cssVars}
          {...props}
        >
          <div className="w-full">{children}</div>
        </div>
      </ChartContext.Provider>
    )
  }
)
ChartContainer.displayName = "ChartContainer"

// ─── CHART TOOLTIP ────────────────────────────────────────────────────────────

interface ChartTooltipContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean
  payload?: Array<{
    value?: number
    dataKey?: string
    color?: string
    name?: string
    payload?: Record<string, unknown>
  }>
  label?: string
  nameKey?: string
  indicator?: "line" | "dot" | "dashed"
  hideLabel?: boolean
  hideIndicator?: boolean
  formatter?: (value: number, name: string) => React.ReactNode
}

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  ChartTooltipContentProps
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      nameKey,
      formatter,
    },
    ref
  ) => {
    const { config } = useChart()

    if (!active || !payload?.length) return null

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs shadow-xl",
          className
        )}
      >
        {!hideLabel && label && (
          <div className="font-medium text-zinc-50">{label}</div>
        )}
        <div className="grid gap-1.5">
          {payload.map((item) => {
            const key = nameKey
              ? (item.payload?.[nameKey] as string)
              : (item.dataKey as string)
            const configEntry = config[key]
            const indicatorColor =
              item.color || configEntry?.color || "var(--color-default)"

            return (
              <div
                key={item.dataKey}
                className="flex w-full flex-wrap items-center gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-zinc-400"
              >
                {!hideIndicator && (
                  <div
                    className={cn("shrink-0 rounded-[2px]", {
                      "h-2.5 w-2.5": indicator === "dot",
                      "w-1 h-full": indicator === "line",
                      "w-0 border-[1.5px] border-dashed h-full":
                        indicator === "dashed",
                    })}
                    style={{ backgroundColor: indicatorColor }}
                  />
                )}
                <div className="flex flex-1 justify-between items-center leading-none gap-2">
                  <span className="text-zinc-400">
                    {configEntry?.label || key}
                  </span>
                  <span className="font-mono font-medium tabular-nums text-zinc-50">
                    {formatter
                      ? formatter(item.value as number, key)
                      : item.value}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
ChartTooltipContent.displayName = "ChartTooltipContent"

// ─── CHART LEGEND ─────────────────────────────────────────────────────────────

interface ChartLegendContentProps extends React.HTMLAttributes<HTMLDivElement> {
  payload?: Array<{
    value: string
    color?: string
    dataKey?: string
  }>
  nameKey?: string
  verticalAlign?: "top" | "bottom"
}

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  ChartLegendContentProps
>(({ className, payload }, ref) => {
  const { config } = useChart()

  if (!payload?.length) return null

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-center gap-4 pt-3",
        className
      )}
    >
      {payload.map((entry) => {
        const key = entry.value || (entry.dataKey as string)
        const configEntry = config[key]

        return (
          <div key={key} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{
                backgroundColor: entry.color || configEntry?.color,
              }}
            />
            <span className="text-xs text-zinc-400">
              {configEntry?.label || key}
            </span>
          </div>
        )
      })}
    </div>
  )
})
ChartLegendContent.displayName = "ChartLegendContent"

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

const ChartTooltip = RechartsTooltip

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegendContent,
}
