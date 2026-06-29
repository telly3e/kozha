import { cn } from "@/lib/utils"
import { createRef, useEffect, useRef } from "react"

export default function GroupSwitch({
  tabs,
  currentTab,
  setCurrentTab,
  storageKey = "selectedGroup",
}: {
  tabs: string[]
  currentTab: string
  setCurrentTab: (tab: string) => void
  storageKey?: string
}) {
  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  const scrollRef = useRef<HTMLDivElement>(null)
  const tagRefs = useRef(tabs.map(() => createRef<HTMLDivElement>()))
  tagRefs.current = tabs.map((_, index) => tagRefs.current[index] || createRef<HTMLDivElement>())

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const isOverflowing = container.scrollWidth > container.clientWidth
    if (!isOverflowing) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      container.scrollLeft += e.deltaY
    }

    container.addEventListener("wheel", onWheel, { passive: false })

    return () => {
      container.removeEventListener("wheel", onWheel)
    }
  }, [])

  useEffect(() => {
    const savedTab = sessionStorage.getItem(storageKey)
    if (savedTab && tabs.includes(savedTab)) {
      setCurrentTab(savedTab)
    }
  }, [storageKey, tabs, setCurrentTab])

  useEffect(() => {
    const currentTagRef = tagRefs.current[tabs.indexOf(currentTab)]
    const container = scrollRef.current

    if (container && currentTagRef?.current) {
      const currentTag = currentTagRef.current
      const centeredLeft = currentTag.offsetLeft - container.clientWidth / 2 + currentTag.clientWidth / 2

      container.scrollTo({
        left: Math.max(0, centeredLeft),
        behavior: "smooth",
      })
    }
  }, [currentTab, tabs])

  return (
    <div ref={scrollRef} className="z-50 flex flex-col items-start rounded-[50px]">
      <div
        className={cn("flex flex-wrap items-center gap-1 rounded-[50px] bg-stone-100 p-[3px] dark:bg-stone-800", {
          "bg-stone-100/70 dark:bg-stone-800/70": customBackgroundImage,
        })}
      >
        {tabs.map((tab: string, index: number) => (
          <div
            key={tab}
            ref={tagRefs.current[index]}
            onClick={() => setCurrentTab(tab)}
            className={cn(
              "relative cursor-pointer rounded-3xl px-2.5 py-[8px] text-[13px] font-[600] transition-all duration-500",
              currentTab === tab ? "text-black dark:text-white" : "text-stone-400 dark:text-stone-500",
            )}
          >
            {currentTab === tab && <div className="absolute inset-0 z-10 h-full w-full content-center rounded-[46px] bg-white shadow-lg shadow-black/5 dark:bg-stone-700 dark:shadow-white/5" />}
            <div className="relative z-20 flex items-center gap-1">
              <p className="whitespace-nowrap">{tab}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
