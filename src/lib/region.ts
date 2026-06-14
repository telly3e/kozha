import countries from "i18n-iso-countries"
import enLocale from "i18n-iso-countries/langs/en.json"
import zhLocale from "i18n-iso-countries/langs/zh.json"

import { NezhaServer } from "@/types/nezha-api"

countries.registerLocale(enLocale)
countries.registerLocale(zhLocale)

export const ALL_REGIONS = "ALL_REGIONS"
export const UNKNOWN_REGION = "UNKNOWN_REGION"

export type RegionLocale = "en" | "zh"

export type RegionOption = {
  code: string
  name: string
  count: number
}

export function getServerRegionCode(server: NezhaServer) {
  const regionCode = server.country_code?.trim().toUpperCase()

  if (!regionCode || !/^[A-Z]{2}$/.test(regionCode)) return UNKNOWN_REGION

  return regionCode
}

export function getRegionName(regionCode: string, locale: RegionLocale) {
  if (regionCode === ALL_REGIONS) return locale === "zh" ? "所有地区" : "All Regions"
  if (regionCode === UNKNOWN_REGION) return locale === "zh" ? "未知区域" : "Unknown"

  return countries.getName(regionCode, locale) || countries.getName(regionCode, "en") || regionCode
}

export function canShowRegionFlag(regionCode: string) {
  return /^[A-Z]{2}$/.test(regionCode)
}

export function getRegionOptions(servers: NezhaServer[], locale: RegionLocale): RegionOption[] {
  const regionCounts = new Map<string, number>()

  for (const server of servers) {
    const regionCode = getServerRegionCode(server)
    regionCounts.set(regionCode, (regionCounts.get(regionCode) || 0) + 1)
  }

  const options = Array.from(regionCounts.entries())
    .map(([code, count]) => ({
      code,
      count,
      name: getRegionName(code, locale),
    }))
    .sort((a, b) => {
      if (a.code === UNKNOWN_REGION) return 1
      if (b.code === UNKNOWN_REGION) return -1

      return a.name.localeCompare(b.name, locale === "zh" ? "zh-CN" : "en")
    })

  return [
    {
      code: ALL_REGIONS,
      count: servers.length,
      name: getRegionName(ALL_REGIONS, locale),
    },
    ...options,
  ]
}
