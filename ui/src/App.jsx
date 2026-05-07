import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis
} from "recharts"
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js"
import { Doughnut } from "react-chartjs-2"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Card,
  CardContent
} from "@/components/ui/card"

ChartJS.register(ArcElement, Tooltip, Legend)

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  const h = String(Math.floor(s / 3600)).padStart(2, "0")
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0")
  const sec = String(s % 60).padStart(2, "0")
  return `${h}:${m}:${sec}`
}

function toDayLabel(dayString) {
  return new Date(`${dayString}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  })
}

function toShortDay(dayString) {
  return new Date(`${dayString}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short"
  })
}

function shiftDay(dayString, delta) {
  const d = new Date(`${dayString}T00:00:00`)
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function toChartLabel(dayString) {
  return toShortDay(dayString)
}

function toWeekRangeLabel(bars) {
  if (!bars?.length) return ""
  const first = bars[0]?.key
  const last = bars[bars.length - 1]?.key
  if (!first || !last) return ""
  const fmt = (day) =>
    new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    })
  return `${fmt(first)} - ${fmt(last)}`
}

function todayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

const ACTIVE_COLOR = "#c70066"
const IDLE_COLOR = "#d9dde6"
const ACTIVE_GLOW = "rgba(255, 15, 134, 0.48)"

function MetricRow({ label, value, pct, tone = "primary", compact = false }) {
  const color = tone === "primary" ? ACTIVE_COLOR : IDLE_COLOR

  return (
    <div className={`rounded-2xl bg-[#141a22] shadow-[inset_0_1px_0_rgba(255,255,255,.03),inset_0_-14px_24px_rgba(0,0,0,.28),0_14px_24px_rgba(0,0,0,.34),0_0_0_1px_rgba(255,255,255,.03)] ${compact ? "p-3" : "p-5"}`}>
      <div className={`flex items-center justify-between ${compact ? "mb-1.5" : "mb-2"}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <span className="text-xs font-semibold" style={{ color }}>{pct}%</span>
      </div>
      <div className={`overflow-hidden rounded-full bg-black/55 ${compact ? "mb-2 h-1.5" : "mb-3 h-2"}`}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}CC, ${color})`,
            boxShadow: tone === "primary" ? `0 0 7px ${ACTIVE_GLOW}` : "none"
          }}
        />
      </div>
      <p className={`mono leading-none font-semibold tracking-tight text-white ${compact ? "text-[1.15rem]" : "text-[1.7rem]"}`}>{value}</p>
    </div>
  )
}

const DONUT_ACTIVE = ACTIVE_COLOR
const DONUT_IDLE = IDLE_COLOR

export default function App() {
  const [screen, setScreen] = useState("home")
  const [selectedScreen, setSelectedScreen] = useState("home")
  const [focusDate, setFocusDate] = useState(todayKey())
  const [home, setHome] = useState(null)
  const [details, setDetails] = useState(null)
  const [isRefreshingHome, setIsRefreshingHome] = useState(false)
  const [toggleHighlight, setToggleHighlight] = useState({ left: 0, width: 0, ready: false })
  const toggleTrackRef = useRef(null)

  async function fetchHome(date = todayKey()) {
    if (!window.trackerApi?.getHomeView) return
    const next = await window.trackerApi.getHomeView(date)
    setHome(next)
    if (!focusDate && next?.day) setFocusDate(next.day)
  }

  async function resetOverviewToToday() {
    setIsRefreshingHome(true)
    const today = todayKey()
    setFocusDate(today)
    await fetchHome(today)
    setTimeout(() => setIsRefreshingHome(false), 450)
  }

  async function refreshCurrentView() {
    setIsRefreshingHome(true)
    if (selectedScreen === "home") {
      await fetchHome(todayKey())
    } else {
      await fetchDetails(focusDate)
    }
    setTimeout(() => setIsRefreshingHome(false), 450)
  }

  async function fetchDetails(date = focusDate) {
    if (!window.trackerApi?.getDetailsView || !date) return
    const next = await window.trackerApi.getDetailsView({
      focusDate: date,
      granularity: "day"
    })
    setDetails(next)
    if (next?.focusDate) setFocusDate(next.focusDate)
  }

  useEffect(() => {
    fetchHome()
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      if (screen === "home") fetchHome()
      else fetchDetails()
    }, 15000)

    return () => clearInterval(timer)
  }, [screen, focusDate])

  useEffect(() => {
    if (screen !== "home") return
    if (!home?.day || home.day !== todayKey()) return
    if (!window.trackerApi?.getSnapshot) return

    const timer = setInterval(async () => {
      const snap = await window.trackerApi.getSnapshot()
      setHome((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          upSeconds: snap.upSecondsToday,
          activeSeconds: snap.activeSecondsToday,
          idleSeconds: snap.idleSecondsToday,
          activeRatio: snap.activeRatio
        }
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [screen, home?.day])

  const activePct = useMemo(() => {
    if (!home?.upSeconds) return 0
    return Math.round((home.activeSeconds / home.upSeconds) * 100)
  }, [home])
  const detailsActivePct = useMemo(() => {
    const up = details?.summary?.upSeconds ?? 0
    const active = details?.summary?.activeSeconds ?? 0
    if (!up) return 0
    return Math.round((active / up) * 100)
  }, [details])

  const idlePct = Math.max(0, 100 - activePct)
  const detailsIdlePct = Math.max(0, 100 - detailsActivePct)
  const donutData = useMemo(() => ({
    labels: ["Direct Activity", "Residual Activity"],
    datasets: [
      {
        data: [Math.max(0, activePct), Math.max(0, idlePct)],
        backgroundColor: [DONUT_ACTIVE, DONUT_IDLE],
        borderColor: "#0f1620",
        borderWidth: 2,
        hoverOffset: 0,
        spacing: 3,
        borderRadius: 0
      }
    ]
  }), [activePct, idlePct])
  const detailsDonutData = useMemo(() => ({
    labels: ["Direct Activity", "Residual Activity"],
    datasets: [
      {
        data: [Math.max(0, detailsActivePct), Math.max(0, detailsIdlePct)],
        backgroundColor: [DONUT_ACTIVE, DONUT_IDLE],
        borderColor: "#0f1620",
        borderWidth: 2,
        hoverOffset: 0,
        spacing: 3,
        borderRadius: 0
      }
    ]
  }), [detailsActivePct, detailsIdlePct])

  const donutOptions = useMemo(() => ({
    responsive: false,
    maintainAspectRatio: false,
    animation: { duration: 650 },
    cutout: "76%",
    rotation: -90,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false }
    }
  }), [])

  const detailsChartData = useMemo(() => {
    if (!details?.bars?.length) return []
    return details.bars.map((row) => ({
      dayKey: row.key,
      label: toChartLabel(row.key),
      activeHours: Number(((row.activeSeconds || 0) / 3600).toFixed(2)),
      idleHours: Number(((row.idleSeconds || 0) / 3600).toFixed(2)),
      selected: Boolean(row.selected)
    }))
  }, [details])
  const weeklyAverages = useMemo(() => {
    const rows = details?.bars || []
    const activeDays = rows.filter((row) => (row.activeSeconds || 0) > 0)
    if (!activeDays.length) {
      return { dayCount: 0, avgTotalSeconds: 0, avgDirectSeconds: 0 }
    }

    const totalUp = activeDays.reduce((sum, row) => sum + (row.upSeconds || 0), 0)
    const totalDirect = activeDays.reduce((sum, row) => sum + (row.activeSeconds || 0), 0)
    return {
      dayCount: activeDays.length,
      avgTotalSeconds: Math.round(totalUp / activeDays.length),
      avgDirectSeconds: Math.round(totalDirect / activeDays.length)
    }
  }, [details])

  const cardShellClass = "relative mx-auto w-full max-w-[735px] overflow-hidden rounded-[30px] border-0 bg-gradient-to-br from-[#141a23] via-[#121821] to-[#171d27] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.03),inset_0_-24px_38px_rgba(0,0,0,.3),0_42px_96px_rgba(0,0,0,.62),0_0_0_1px_rgba(255,255,255,.025)]"
  const spring = { type: "spring", stiffness: 380, damping: 36, mass: 0.62 }
  const quickFade = { duration: 0.16, ease: [0.22, 1, 0.36, 1] }
  const panelTransition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
  const pageEnter = {
    hidden: { opacity: 0, y: 14 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
        staggerChildren: 0.08
      }
    }
  }
  const sectionEnter = {
    hidden: { opacity: 0, y: 12, scale: 0.99 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.44, ease: [0.22, 1, 0.36, 1] }
    }
  }

  function transitionTo(nextScreen) {
    if (nextScreen === selectedScreen) return
    setSelectedScreen(nextScreen)
    setScreen(nextScreen)
    if (nextScreen === "details") {
      const seedDate = home?.day || focusDate || todayKey()
      fetchDetails(seedDate)
    }
    if (nextScreen === "home") {
      resetOverviewToToday()
    }
  }

  useLayoutEffect(() => {
    const track = toggleTrackRef.current
    const target = track?.querySelector("[role='tab'][data-state='active']")
    if (!track || !target) return

    const nextLeft = target.offsetLeft
    const nextWidth = target.offsetWidth
    setToggleHighlight((prev) => {
      if (prev.left === nextLeft && prev.width === nextWidth && prev.ready) {
        return prev
      }
      return { left: nextLeft, width: nextWidth, ready: true }
    })
  }, [selectedScreen])

  useEffect(() => {
    function syncHighlightOnResize() {
      const track = toggleTrackRef.current
      const target = track?.querySelector("[role='tab'][data-state='active']")
      if (!target) return
      setToggleHighlight({ left: target.offsetLeft, width: target.offsetWidth, ready: true })
    }

    window.addEventListener("resize", syncHighlightOnResize)
    return () => window.removeEventListener("resize", syncHighlightOnResize)
  }, [selectedScreen])

  return (
    <div className="min-h-screen">
      <motion.main
        className="mx-auto w-full max-w-6xl px-4 pb-10 pt-10"
        variants={pageEnter}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={sectionEnter} className="mx-auto mb-4 flex w-full max-w-[735px] justify-center px-2">
          <div className="flex items-center gap-2">
          <Tabs
            value={selectedScreen}
            onValueChange={transitionTo}
            className="gap-0 rounded-full border border-white/10 bg-[#111722]/75 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,.03),0_10px_20px_rgba(0,0,0,.35)]"
          >
            <TabsList
              ref={toggleTrackRef}
              className="relative grid h-auto grid-cols-2 overflow-hidden rounded-full bg-transparent p-0 text-white/70"
            >
              <div
                className={`pointer-events-none absolute inset-y-0 rounded-full bg-gradient-to-b from-[#232c3a] to-[#151d29] shadow-[0_0_0_1px_rgba(255,255,255,.06)] transition-all duration-220 ease-out ${toggleHighlight.ready ? "opacity-100" : "opacity-0"}`}
                style={{ left: toggleHighlight.left, width: toggleHighlight.width }}
              />
              <TabsTrigger
                value="home"
                className="relative z-10 flex h-11 min-w-[112px] items-center justify-center rounded-full px-8 text-sm font-semibold tracking-wide text-white/70 transition-colors duration-220 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="details"
                className="relative z-10 flex h-11 min-w-[112px] items-center justify-center rounded-full px-8 text-sm font-semibold tracking-wide text-white/70 transition-colors duration-220 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none"
              >
                Details
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="ghost"
            size="sm"
            className="group h-8 w-8 rounded-full p-0 cursor-pointer bg-transparent hover:bg-transparent focus-visible:bg-transparent"
            onClick={refreshCurrentView}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 text-white/80 transition-transform duration-300 ease-out group-hover:rotate-180 ${isRefreshingHome ? "animate-spin" : ""}`} />
          </Button>
          </div>
        </motion.div>

        <motion.div variants={sectionEnter}>
        <Card className={`${cardShellClass} min-h-[540px]`}>
            <div className="pointer-events-none absolute -left-16 top-4 h-44 w-44 rounded-full bg-[#ff1f7a]/5 blur-3xl" />
            <div className="pointer-events-none absolute right-6 bottom-4 h-40 w-40 rounded-full bg-[#6e7f9a]/3 blur-3xl" />
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={quickFade}
            >
            <CardContent className="pt-2">
              <motion.div
                layout
                initial={false}
                transition={spring}
                className={`grid gap-6 ${selectedScreen === "details" ? "lg:grid-cols-[280px_minmax(0,1fr)] lg:items-center" : "lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start"}`}
              >
                <div className="relative min-h-[262px]">
                  <motion.div
                    className="absolute inset-0 grid place-items-center"
                    initial={false}
                    animate={selectedScreen === "home"
                      ? { opacity: 1, x: 0, scale: 1 }
                      : { opacity: 0, x: -26, scale: 0.94 }}
                    transition={spring}
                    style={{ pointerEvents: selectedScreen === "home" ? "auto" : "none" }}
                  >
                    <div className="relative grid h-[236px] w-[236px] place-items-center pointer-events-none select-none">
                      <div
                        style={{
                          width: 236,
                          height: 236,
                          flexShrink: 0,
                          alignSelf: "center",
                          justifySelf: "center"
                        }}
                      >
                        <Doughnut data={donutData} options={donutOptions} width={236} height={236} />
                      </div>
                      <div className="absolute grid h-[180px] w-[180px] place-items-center rounded-full bg-[#0f1620]">
                        <div className="text-center">
                          <p className="mono text-[1.78rem] leading-none font-semibold text-white">{formatDuration(home?.upSeconds)}</p>
                          <div className="mt-1.5 w-[170px]">
                            <p className="text-center text-xl text-muted-foreground">{home?.day ? toDayLabel(home.day) : toDayLabel(todayKey())}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                  <motion.div
                    className="absolute inset-0"
                    initial={false}
                    animate={selectedScreen === "details"
                      ? { opacity: 1, x: 0, scale: 1 }
                      : { opacity: 0, x: 24, scale: 0.96 }}
                    transition={spring}
                    style={{ pointerEvents: selectedScreen === "details" ? "auto" : "none" }}
                  >
                    <div className="grid h-full content-center gap-2">
                      <MetricRow
                        label="Direct Activity"
                        value={formatDuration(details?.summary?.activeSeconds ?? home?.activeSeconds)}
                        pct={detailsActivePct}
                        tone="primary"
                        compact
                      />
                      <MetricRow
                        label="Residual Activity"
                        value={formatDuration(details?.summary?.idleSeconds ?? home?.idleSeconds)}
                        pct={detailsIdlePct}
                        tone="secondary"
                        compact
                      />
                    </div>
                  </motion.div>
                </div>

                <div className="relative min-h-[262px]">
                  <motion.div
                    className="absolute inset-0 grid gap-3"
                    initial={false}
                    animate={selectedScreen === "home"
                      ? { opacity: 1, x: 0, scale: 1 }
                      : { opacity: 0, x: 24, scale: 0.97 }}
                    transition={spring}
                    style={{ pointerEvents: selectedScreen === "home" ? "auto" : "none" }}
                  >
                    <MetricRow
                      label="Direct Activity"
                      value={formatDuration(home?.activeSeconds)}
                      pct={activePct}
                      tone="primary"
                    />
                    <MetricRow
                      label="Residual Activity"
                      value={formatDuration(home?.idleSeconds)}
                      pct={idlePct}
                      tone="secondary"
                    />
                  </motion.div>
                  <motion.div
                    className="absolute inset-0 flex items-center justify-end"
                    initial={false}
                    animate={selectedScreen === "details"
                      ? { opacity: 1, x: 0, scale: 1 }
                      : { opacity: 0, x: -24, scale: 0.97 }}
                    transition={spring}
                    style={{ pointerEvents: selectedScreen === "details" ? "auto" : "none" }}
                  >
                    <div className="grid h-full place-items-center">
                      <div className="relative grid h-[236px] w-[236px] place-items-center pointer-events-none select-none">
                        <div
                          style={{
                            width: 236,
                            height: 236,
                            flexShrink: 0,
                            alignSelf: "center",
                            justifySelf: "center"
                          }}
                        >
                          <Doughnut data={detailsDonutData} options={donutOptions} width={236} height={236} />
                        </div>
                        <div className="absolute grid h-[180px] w-[180px] place-items-center rounded-full bg-[#0f1620]">
                          <div className="text-center">
                            <p className="mono text-[1.78rem] leading-none font-semibold text-white">
                              {formatDuration(details?.summary?.upSeconds ?? home?.upSeconds)}
                            </p>
                            <div className="mt-1.5 flex items-center justify-center gap-2 pointer-events-auto">
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-8 w-8 rounded-full p-0"
                                onClick={async () => {
                                  const next = shiftDay(focusDate, -1)
                                  setFocusDate(next)
                                  await fetchDetails(next)
                                }}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              <p className="text-sm text-muted-foreground">
                                {details?.focusDate ? toDayLabel(details.focusDate) : toDayLabel(focusDate)}
                              </p>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-8 w-8 rounded-full p-0"
                                onClick={async () => {
                                  const next = shiftDay(focusDate, 1)
                                  setFocusDate(next)
                                  await fetchDetails(next)
                                }}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
              <motion.div
                initial={false}
                animate={selectedScreen === "details"
                  ? { opacity: 1, height: "auto", marginTop: 12 }
                  : { opacity: 0, height: 0, marginTop: 0 }}
                transition={panelTransition}
                style={{
                  overflow: selectedScreen === "details" ? "visible" : "hidden",
                  pointerEvents: selectedScreen === "details" ? "auto" : "none"
                }}
                className="grid gap-3"
              >
                <div className="relative z-10">
                  <div className="mt-0">
                  <div className="h-[190px] pb-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={detailsChartData}
                        margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                        barGap={0}
                        accessibilityLayer={false}
                        onMouseDown={(event) => event.preventDefault()}
                      >
                        <CartesianGrid stroke="rgba(255,255,255,0.035)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "rgba(210, 214, 222, 0.58)", fontSize: 11, pointerEvents: "none" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: "rgba(210, 214, 222, 0.52)", fontSize: 11, pointerEvents: "none" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `${v}h`}
                          width={30}
                        />
                        <Bar
                          dataKey="idleHours"
                          stackId="usage"
                          fill={IDLE_COLOR}
                          radius={[0, 0, 0, 0]}
                          barSize={12}
                          activeBar={false}
                          isAnimationActive={true}
                          animationDuration={650}
                        >
                          {detailsChartData.map((entry) => (
                            <Cell
                              key={`idle-${entry.label}`}
                              fill={entry.selected ? IDLE_COLOR : "rgba(217, 221, 230, 0.42)"}
                              className="cursor-pointer"
                              tabIndex={-1}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={async () => {
                                setFocusDate(entry.dayKey)
                                await fetchDetails(entry.dayKey)
                              }}
                            />
                          ))}
                        </Bar>
                        <Bar
                          dataKey="activeHours"
                          stackId="usage"
                          fill={ACTIVE_COLOR}
                          radius={[0, 0, 0, 0]}
                          barSize={12}
                          activeBar={false}
                          isAnimationActive={true}
                          animationDuration={850}
                        >
                          {detailsChartData.map((entry) => (
                            <Cell
                              key={`active-${entry.label}`}
                              fill={entry.selected ? ACTIVE_COLOR : "rgba(199, 0, 102, 0.45)"}
                              className="cursor-pointer"
                              tabIndex={-1}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={async () => {
                                setFocusDate(entry.dayKey)
                                await fetchDetails(entry.dayKey)
                              }}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const next = shiftDay(focusDate, -7)
                        setFocusDate(next)
                        await fetchDetails(next)
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <p className="text-sm text-white/90">{toWeekRangeLabel(details?.bars)}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const next = shiftDay(focusDate, 7)
                        setFocusDate(next)
                        await fetchDetails(next)
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl bg-[#141a22] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.03),inset_0_-14px_24px_rgba(0,0,0,.28),0_14px_24px_rgba(0,0,0,.34),0_0_0_1px_rgba(255,255,255,.03)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Weekly Avg Total Time</p>
                      <p className="mono mt-3 text-[1.5rem] leading-none font-semibold text-white">{formatDuration(weeklyAverages.avgTotalSeconds)}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {weeklyAverages.dayCount
                          ? `Based on ${weeklyAverages.dayCount} day${weeklyAverages.dayCount > 1 ? "s" : ""} with activity`
                          : "No active days in selected week"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#141a22] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.03),inset_0_-14px_24px_rgba(0,0,0,.28),0_14px_24px_rgba(0,0,0,.34),0_0_0_1px_rgba(255,255,255,.03)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Weekly Avg Direct Activity</p>
                      <p className="mono mt-3 text-[1.5rem] leading-none font-semibold text-white">{formatDuration(weeklyAverages.avgDirectSeconds)}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {weeklyAverages.dayCount
                          ? `Based on ${weeklyAverages.dayCount} day${weeklyAverages.dayCount > 1 ? "s" : ""} with activity`
                          : "No active days in selected week"}
                      </p>
                    </div>
                  </div>
                </div>

              </motion.div>
            </CardContent>
            </motion.div>
          </Card>
        </motion.div>
      </motion.main>
    </div>
  )
}
