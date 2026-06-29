import AssetSummaryWidget from "@/components/AssetSummaryWidget"
import GlobalMap from "@/components/GlobalMap"
import GroupSwitch from "@/components/GroupSwitch"
import ServerFlag from "@/components/ServerFlag"
import ServerCard from "@/components/ServerCard"
import ServerCardInline from "@/components/ServerCardInline"
import ServerOverview from "@/components/ServerOverview"
import { ServiceTracker } from "@/components/ServiceTracker"
import VisitorCapsuleBar from "@/components/VisitorCapsuleBar"
import { Loader } from "@/components/loading/Loader"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SORT_ORDERS, SORT_TYPES } from "@/context/sort-context"
import { useSort } from "@/hooks/use-sort"
import { useStatus } from "@/hooks/use-status"
import { useWebSocketContext } from "@/hooks/use-websocket-context"
import { fetchServerGroup } from "@/lib/nezha-api"
import { ALL_REGIONS, canShowRegionFlag, getRegionOptions, getServerRegionCode } from "@/lib/region"
import { cn, formatNezhaInfo } from "@/lib/utils"
import { NezhaWebsocketResponse } from "@/types/nezha-api"
import { ServerGroup } from "@/types/nezha-api"
import { ArrowDownIcon, ArrowUpIcon, ArrowsUpDownIcon, ChartBarSquareIcon, MapIcon, MapPinIcon, ViewColumnsIcon } from "@heroicons/react/20/solid"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

export default function Servers() {
  const { t, i18n } = useTranslation()
  const { sortType, sortOrder, setSortOrder, setSortType } = useSort()
  const { data: groupData } = useQuery({
    queryKey: ["server-group"],
    queryFn: () => fetchServerGroup(),
  })
  const { lastMessage, connected } = useWebSocketContext()
  const { status } = useStatus()
  const [showServices, setShowServices] = useState<string>("0")
  const [showMap, setShowMap] = useState<string>("0")
  const [inline, setInline] = useState<string>("0")
  const containerRef = useRef<HTMLDivElement>(null)
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false)
  const [regionOpen, setRegionOpen] = useState<boolean>(false)
  const [currentGroup, setCurrentGroup] = useState<string>("All")
  const [currentRegion, setCurrentRegion] = useState<string>(ALL_REGIONS)

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined
  const themeSettings = window as unknown as Record<string, unknown>
  const canShowServicesControl = themeSettings.ForceShowServices === true
  const showVisitorCapsule = themeSettings.ShowVisitorCapsule === true
  const showAssetCard = themeSettings.ShowAssetCard === true

  const restoreScrollPosition = () => {
    const savedPosition = sessionStorage.getItem("scrollPosition")
    if (savedPosition && containerRef.current) {
      containerRef.current.scrollTop = Number(savedPosition)
    }
  }

  const handleTagChange = (newGroup: string) => {
    setCurrentGroup(newGroup)
    sessionStorage.setItem("selectedGroup", newGroup)
    sessionStorage.setItem("scrollPosition", String(containerRef.current?.scrollTop || 0))
  }

  const handleRegionChange = (newRegion: string) => {
    setCurrentRegion(newRegion)
    sessionStorage.setItem("selectedRegion", newRegion)
    sessionStorage.setItem("scrollPosition", String(containerRef.current?.scrollTop || 0))
  }

  useEffect(() => {
    const showServicesState = localStorage.getItem("showServices")
    if (canShowServicesControl) {
      setShowServices("1")
    } else if (showServicesState !== null) {
      setShowServices("0")
    }
  }, [canShowServicesControl])

  useEffect(() => {
    const checkInlineSettings = () => {
      const isMobile = window.innerWidth < 768

      if (!isMobile) {
        const inlineState = localStorage.getItem("inline")
        if (window.ForceCardInline) {
          setInline("1")
        } else if (inlineState !== null) {
          setInline(inlineState)
        }
      }
    }

    checkInlineSettings()

    window.addEventListener("resize", checkInlineSettings)

    return () => {
      window.removeEventListener("resize", checkInlineSettings)
    }
  }, [])

  useEffect(() => {
    const showMapState = localStorage.getItem("showMap")
    if (window.ForceShowMap) {
      setShowMap("1")
    } else if (showMapState !== null) {
      setShowMap(showMapState)
    }
  }, [])

  useEffect(() => {
    const savedGroup = sessionStorage.getItem("selectedGroup") || "All"
    const savedRegion = sessionStorage.getItem("selectedRegion") || ALL_REGIONS
    setCurrentGroup(savedGroup)
    setCurrentRegion(savedRegion)

    restoreScrollPosition()
  }, [])

  useEffect(() => {
    const originalOverflow = document.body.style.overflow

    if (regionOpen) {
      document.body.style.overflow = "hidden"
    }

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [regionOpen])

  const nezhaWsData = lastMessage ? (JSON.parse(lastMessage.data) as NezhaWebsocketResponse) : null

  const groupTabs = [
    "All",
    ...(groupData?.data
      ?.filter((item: ServerGroup) => {
        return Array.isArray(item.servers) && item.servers.some((serverId) => nezhaWsData?.servers?.some((server) => server.id === serverId))
      })
      ?.map((item: ServerGroup) => item.group.name) || []),
  ]
  if (!connected && !lastMessage) {
    return (
      <div className="flex flex-col items-center min-h-96 justify-center ">
        <div className="font-semibold flex items-center gap-2 text-sm">
          <Loader visible={true} />
          {/* {t("info.websocketConnecting")} */}
        </div>
      </div>
    )
  }

  if (!nezhaWsData) {
    return (
      <div className="flex flex-col items-center justify-center ">
        <p className="font-semibold text-sm">{t("info.processing")}</p>
      </div>
    )
  }

  const groupFilteredServers =
    nezhaWsData?.servers?.filter((server) => {
      if (currentGroup === "All") return true
      const group = groupData?.data?.find(
        (g: ServerGroup) => g.group.name === currentGroup && Array.isArray(g.servers) && g.servers.includes(server.id),
      )
      return !!group
    }) || []
  const regionLocale = i18n.language?.toLowerCase().startsWith("zh") ? "zh" : "en"
  const regionOptions = getRegionOptions(groupFilteredServers, regionLocale)
  const activeRegion = regionOptions.some((region) => region.code === currentRegion) ? currentRegion : ALL_REGIONS
  const selectedRegion = regionOptions.find((region) => region.code === activeRegion) || regionOptions[0]
  const getRegionCodeLabel = (region?: { code: string; name: string }) => {
    if (!region || region.code === ALL_REGIONS) return regionLocale === "zh" ? "地区" : "Region"

    return region.code.toUpperCase()
  }
  const getRegionMenuLabel = (region?: { code: string; name: string }) => {
    if (!region || region.code === ALL_REGIONS) return regionLocale === "zh" ? "所有地区" : "All Regions"

    return region.code.toUpperCase()
  }
  const regionFilteredServers =
    activeRegion === ALL_REGIONS ? groupFilteredServers : groupFilteredServers.filter((server) => getServerRegionCode(server) === activeRegion)
  let filteredServers = regionFilteredServers

  const totalServers = filteredServers.length || 0
  const onlineServers = filteredServers.filter((server) => formatNezhaInfo(nezhaWsData.now, server).online)?.length || 0
  const offlineServers = filteredServers.filter((server) => !formatNezhaInfo(nezhaWsData.now, server).online)?.length || 0
  const up =
    filteredServers.reduce(
      (total, server) => (formatNezhaInfo(nezhaWsData.now, server).online ? total + (server.state?.net_out_transfer ?? 0) : total),
      0,
    ) || 0
  const down =
    filteredServers.reduce(
      (total, server) => (formatNezhaInfo(nezhaWsData.now, server).online ? total + (server.state?.net_in_transfer ?? 0) : total),
      0,
    ) || 0

  const upSpeed =
    filteredServers.reduce(
      (total, server) => (formatNezhaInfo(nezhaWsData.now, server).online ? total + (server.state?.net_out_speed ?? 0) : total),
      0,
    ) || 0
  const downSpeed =
    filteredServers.reduce(
      (total, server) => (formatNezhaInfo(nezhaWsData.now, server).online ? total + (server.state?.net_in_speed ?? 0) : total),
      0,
    ) || 0

  filteredServers =
    status === "all"
      ? filteredServers
      : filteredServers.filter((server) => [status].includes(formatNezhaInfo(nezhaWsData.now, server).online ? "online" : "offline"))

  filteredServers = filteredServers.sort((a, b) => {
    const serverAInfo = formatNezhaInfo(nezhaWsData.now, a)
    const serverBInfo = formatNezhaInfo(nezhaWsData.now, b)

    if (sortType !== "name") {
      // 仅在非 "name" 排序时，先按在线状态排序
      if (!serverAInfo.online && serverBInfo.online) return 1
      if (serverAInfo.online && !serverBInfo.online) return -1
      if (!serverAInfo.online && !serverBInfo.online) {
        // 如果两者都离线，可以继续按照其他条件排序，或者保持原序
        // 这里选择保持原序
        return 0
      }
    }

    let comparison = 0

    switch (sortType) {
      case "name":
        comparison = a.name.localeCompare(b.name)
        break
      case "uptime":
        comparison = (a.state?.uptime ?? 0) - (b.state?.uptime ?? 0)
        break
      case "system":
        comparison = a.host.platform.localeCompare(b.host.platform)
        break
      case "cpu":
        comparison = (a.state?.cpu ?? 0) - (b.state?.cpu ?? 0)
        break
      case "mem":
        comparison = (formatNezhaInfo(nezhaWsData.now, a).mem ?? 0) - (formatNezhaInfo(nezhaWsData.now, b).mem ?? 0)
        break
      case "disk":
        comparison = (formatNezhaInfo(nezhaWsData.now, a).disk ?? 0) - (formatNezhaInfo(nezhaWsData.now, b).disk ?? 0)
        break
      case "up":
        comparison = (a.state?.net_out_speed ?? 0) - (b.state?.net_out_speed ?? 0)
        break
      case "down":
        comparison = (a.state?.net_in_speed ?? 0) - (b.state?.net_in_speed ?? 0)
        break
      case "up total":
        comparison = (a.state?.net_out_transfer ?? 0) - (b.state?.net_out_transfer ?? 0)
        break
      case "down total":
        comparison = (a.state?.net_in_transfer ?? 0) - (b.state?.net_in_transfer ?? 0)
        break
      default:
        comparison = (a.display_index ?? 0) - (b.display_index ?? 0)
    }

    return sortOrder === "asc" ? comparison : -comparison
  })

  return (
    <div className="mx-auto w-full max-w-5xl px-0">
      <ServerOverview
        total={totalServers}
        online={onlineServers}
        offline={offlineServers}
        up={up}
        down={down}
        upSpeed={upSpeed}
        downSpeed={downSpeed}
      />
      {showVisitorCapsule && <VisitorCapsuleBar />}
      {showAssetCard && <AssetSummaryWidget now={nezhaWsData.now} servers={regionFilteredServers} />}
      <div className="flex mt-6 flex-wrap items-center gap-2 server-overview-controls">
        <section className="contents">
          <button
            onClick={() => {
              setShowMap(showMap === "0" ? "1" : "0")
              localStorage.setItem("showMap", showMap === "0" ? "1" : "0")
            }}
            className={cn(
              "rounded-[50px] bg-white dark:bg-stone-800 cursor-pointer p-[10px] transition-all border dark:border-none border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
              {
                "shadow-[inset_0_1px_0_rgba(0,0,0,0.2)] !bg-blue-600 hover:!bg-blue-600 border-blue-600 dark:border-blue-600": showMap === "1",
                "text-white": showMap === "1",
              },
              {
                "bg-opacity-70 dark:bg-opacity-70": customBackgroundImage,
              },
            )}
          >
            <MapIcon
              className={cn("size-[13px]", {
                "text-white": showMap === "1",
              })}
            />
          </button>
          {canShowServicesControl && (
            <button
              onClick={() => {
                setShowServices(showServices === "0" ? "1" : "0")
                localStorage.setItem("showServices", showServices === "0" ? "1" : "0")
              }}
              className={cn(
                "rounded-[50px] bg-white dark:bg-stone-800 cursor-pointer p-[10px] transition-all border dark:border-none border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
                {
                  "shadow-[inset_0_1px_0_rgba(0,0,0,0.2)] !bg-blue-600 hover:!bg-blue-600 border-blue-600 dark:border-blue-600": showServices === "1",
                  "text-white": showServices === "1",
                },
                {
                  "bg-opacity-70 dark:bg-opacity-70": customBackgroundImage,
                },
              )}
            >
              <ChartBarSquareIcon
                className={cn("size-[13px]", {
                  "text-white": showServices === "1",
                })}
              />
            </button>
          )}
          <button
            onClick={() => {
              setInline(inline === "0" ? "1" : "0")
              localStorage.setItem("inline", inline === "0" ? "1" : "0")
            }}
            className={cn(
              "rounded-[50px] bg-white dark:bg-stone-800 cursor-pointer p-[10px] transition-all border dark:border-none border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
              {
                "shadow-[inset_0_1px_0_rgba(0,0,0,0.2)] !bg-blue-600 hover:!bg-blue-600 border-blue-600 dark:border-blue-600": inline === "1",
                "text-white": inline === "1",
              },
              {
                "bg-opacity-70 dark:bg-opacity-70": customBackgroundImage,
              },
            )}
          >
            <ViewColumnsIcon
              className={cn("size-[13px]", {
                "text-white": inline === "1",
              })}
            />
          </button>
          {groupTabs.length > 1 && (
            <div className="z-50 flex flex-col items-start rounded-[50px] sm:hidden">
              <div
                className={cn("flex items-center gap-1 rounded-[50px] bg-stone-100 p-[3px] dark:bg-stone-800", {
                  "bg-stone-100/70 dark:bg-stone-800/70": customBackgroundImage,
                })}
              >
                <Select value={currentGroup} onValueChange={handleTagChange}>
                  <SelectTrigger className="relative h-[35px] w-auto min-w-[62px] max-w-[min(22rem,calc(100vw-2rem))] shrink-0 justify-center gap-1.5 rounded-3xl border-0 bg-white px-2.5 py-0 pr-7 text-[13px] font-[600] leading-[1.25] text-black ring-0 ring-offset-0 transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-stone-700 dark:text-white [&>span]:!flex [&>span]:min-w-0 [&>span]:items-center [&>span]:justify-center [&>span]:overflow-hidden [&>span]:whitespace-nowrap [&>svg]:absolute [&>svg]:right-2.5 [&>svg]:ml-0 [&>svg]:size-3 [&>svg]:shrink-0">
                    <span>
                      <span className="min-w-0 truncate whitespace-nowrap text-center tracking-wide leading-[1.25]">{currentGroup}</span>
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px] w-max min-w-[62px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg">
                    {groupTabs.map((group) => (
                      <SelectItem key={group} value={group} className="text-xs [&>span:last-child]:block [&>span:last-child]:w-full">
                        <span className="grid w-full grid-cols-[minmax(0,1fr)] items-center">
                          <span className="min-w-0 truncate tracking-wide">{group}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="hidden sm:block">
            <GroupSwitch tabs={groupTabs} currentTab={currentGroup} setCurrentTab={handleTagChange} />
          </div>
          {regionOptions.length > 1 && (
            <div className="z-50 flex flex-col items-start rounded-[50px]">
              <div
                className={cn("flex items-center gap-1 rounded-[50px] bg-stone-100 p-[3px] dark:bg-stone-800", {
                  "bg-stone-100/70 dark:bg-stone-800/70": customBackgroundImage,
                })}
              >
                <Select value={activeRegion} open={regionOpen} onOpenChange={setRegionOpen} onValueChange={handleRegionChange}>
                  <SelectTrigger className="relative h-[35px] w-auto min-w-[100px] max-w-[min(22rem,calc(100vw-2rem))] shrink-0 justify-center gap-1.5 rounded-3xl border-0 bg-white px-2.5 py-0 pr-7 text-[13px] font-[600] leading-[1.25] text-black shadow-none ring-0 ring-offset-0 transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-stone-700 dark:text-white [&>span]:!flex [&>span]:min-w-0 [&>span]:items-center [&>span]:justify-center [&>span]:gap-1.5 [&>span]:overflow-hidden [&>span]:whitespace-nowrap [&>svg]:absolute [&>svg]:right-2.5 [&>svg]:ml-0 [&>svg]:size-3 [&>svg]:shrink-0">
                    <span>
                      <MapPinIcon className="size-[13px] shrink-0 text-stone-300 dark:text-stone-300" />
                      {canShowRegionFlag(activeRegion) && (
                        <span className="flex h-4 w-5 shrink-0 items-center justify-center">
                          <ServerFlag country_code={activeRegion} className="text-[14px] leading-none" />
                        </span>
                      )}
                      <span className="min-w-0 truncate whitespace-nowrap text-center tracking-wide leading-[1.25]">{getRegionCodeLabel(selectedRegion)}</span>
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px] w-max min-w-[100px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg">
                    {regionOptions.map((region) => (
                      <SelectItem key={region.code} value={region.code} className="text-xs [&>span:last-child]:block [&>span:last-child]:w-full">
                        {region.code === ALL_REGIONS ? (
                          <span className="grid w-full grid-cols-[minmax(0,1fr)_36px] items-center gap-x-3">
                            <span className="min-w-0 truncate tracking-wide">{getRegionMenuLabel(region)}</span>
                            <span className="w-9 justify-self-end text-right text-[10px] tabular-nums text-muted-foreground">{region.count}</span>
                          </span>
                        ) : (
                          <span className="grid w-full grid-cols-[20px_minmax(0,1fr)_36px] items-center gap-x-3">
                            <span className="flex h-4 w-5 shrink-0 items-center justify-center">
                              {canShowRegionFlag(region.code) && <ServerFlag country_code={region.code} className="text-[14px] leading-none" />}
                            </span>
                            <span className="min-w-0 truncate tracking-wide">{getRegionMenuLabel(region)}</span>
                            <span className="w-9 justify-self-end text-right text-[10px] tabular-nums text-muted-foreground">{region.count}</span>
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </section>
        <Popover onOpenChange={setSettingsOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "rounded-[50px] flex items-center gap-1 dark:text-white border dark:border-none text-black cursor-pointer dark:[text-shadow:_0_1px_0_rgb(0_0_0_/_20%)] dark:bg-stone-800 bg-white  p-[10px] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]  ",
                {
                  "shadow-[inset_0_1px_0_rgba(0,0,0,0.2)] dark:bg-stone-700 bg-stone-200": settingsOpen,
                },
                {
                  "dark:bg-stone-800/70 bg-stone-100/70 ": customBackgroundImage,
                },
              )}
            >
              <p className="text-[10px] font-bold whitespace-nowrap">{sortType === "default" ? "Sort" : sortType.toUpperCase()}</p>
              {sortOrder === "asc" && sortType !== "default" ? (
                <ArrowUpIcon className="size-[13px]" />
              ) : sortOrder === "desc" && sortType !== "default" ? (
                <ArrowDownIcon className="size-[13px]" />
              ) : (
                <ArrowsUpDownIcon className="size-[13px]" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-4 w-[240px] rounded-lg">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Sort by</Label>
                <Select value={sortType} onValueChange={setSortType}>
                  <SelectTrigger className="w-full text-xs h-8">
                    <SelectValue placeholder="Choose type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_TYPES.map((type) => (
                      <SelectItem key={type} value={type} className="text-xs">
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Sort order</Label>
                <Select value={sortOrder} onValueChange={setSortOrder} disabled={sortType === "default"}>
                  <SelectTrigger className="w-full text-xs h-8">
                    <SelectValue placeholder="Choose order" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_ORDERS.map((order) => (
                      <SelectItem key={order} value={order} className="text-xs">
                        {order.charAt(0).toUpperCase() + order.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {showMap === "1" && <GlobalMap now={nezhaWsData.now} serverList={nezhaWsData?.servers || []} />}
      {canShowServicesControl && showServices === "1" && <ServiceTracker serverList={filteredServers} />}
      {inline === "1" && (
        <section ref={containerRef} className="flex flex-col gap-2 overflow-x-scroll scrollbar-hidden mt-6 server-inline-list">
          {filteredServers.map((serverInfo) => (
            <ServerCardInline now={nezhaWsData.now} key={serverInfo.id} serverInfo={serverInfo} />
          ))}
        </section>
      )}
      {inline === "0" && (
        <section ref={containerRef} className="grid grid-cols-1 gap-2 md:grid-cols-2 mt-6 server-card-list">
          {filteredServers.map((serverInfo) => (
            <ServerCard now={nezhaWsData.now} key={serverInfo.id} serverInfo={serverInfo} />
          ))}
        </section>
      )}
    </div>
  )
}
