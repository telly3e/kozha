import { SharedClient } from "@/hooks/use-rpc2"
import { LoginUserResponse, MonitorResponse, ServerGroupResponse, ServiceData, ServiceResponse, SettingResponse, NezhaMonitor } from "@/types/nezha-api"
import { DateTime } from "luxon"

import { getKomariNodes, uuidToNumber } from "./utils"

//let lastestRefreshTokenAt = 0

const MONITOR_TARGET_POINTS = 500

type MonitorPoint = {
  time: number
  delay: number
  packetLoss: number
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

const alignAndDownsampleMonitorSeries = (series: NezhaMonitor[], targetPoints = MONITOR_TARGET_POINTS): NezhaMonitor[] => {
  const pointSeries = series.map((item) => ({
    item,
    points: item.created_at
      .map((time, index) => ({
        time,
        delay: item.avg_delay[index] ?? 0,
        packetLoss: item.packet_loss?.[index] ?? 0,
      }))
      .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.delay) && Number.isFinite(point.packetLoss))
      .sort((a, b) => a.time - b.time),
  }))

  const nonEmptySeries = pointSeries.filter(({ points }) => points.length > 0)
  if (nonEmptySeries.length === 0) return series

  const start = Math.min(...nonEmptySeries.map(({ points }) => points[0].time))
  const end = Math.max(...nonEmptySeries.map(({ points }) => points[points.length - 1].time))
  const maxSeriesLength = Math.max(...nonEmptySeries.map(({ points }) => points.length))
  const pointCount = Math.min(targetPoints, Math.max(2, maxSeriesLength))

  if (start === end || pointCount <= 1) {
    return series.map((item) => ({
      ...item,
      created_at: [start],
      avg_delay: [item.avg_delay[item.avg_delay.length - 1] ?? 0],
      packet_loss: [item.packet_loss?.[item.packet_loss.length - 1] ?? 0],
    }))
  }

  const step = (end - start) / (pointCount - 1)
  const commonTimes = Array.from({ length: pointCount }, (_, index) => Math.round(start + step * index))
  commonTimes[0] = start
  commonTimes[commonTimes.length - 1] = end

  return pointSeries.map(({ item, points }) => {
    if (points.length === 0) {
      return {
        ...item,
        created_at: commonTimes,
        avg_delay: commonTimes.map(() => 0),
        packet_loss: commonTimes.map(() => 0),
      }
    }

    let bucketCursor = 0
    let nearestCursor = 0

    const sampled = commonTimes.map((time, index) => {
      const lowerBound = index === 0 ? time - step / 2 : (commonTimes[index - 1] + time) / 2
      const upperBound = index === commonTimes.length - 1 ? time + step / 2 : (time + commonTimes[index + 1]) / 2

      while (bucketCursor < points.length && points[bucketCursor].time < lowerBound) {
        bucketCursor++
      }

      const bucket: MonitorPoint[] = []
      let scanCursor = bucketCursor
      while (scanCursor < points.length && points[scanCursor].time <= upperBound) {
        bucket.push(points[scanCursor])
        scanCursor++
      }

      if (bucket.length > 0) {
        return {
          delay: Number(average(bucket.map((point) => point.delay)).toFixed(2)),
          packetLoss: Math.max(...bucket.map((point) => point.packetLoss)),
        }
      }

      while (
        nearestCursor + 1 < points.length &&
        Math.abs(points[nearestCursor + 1].time - time) <= Math.abs(points[nearestCursor].time - time)
      ) {
        nearestCursor++
      }

      return {
        delay: points[nearestCursor].delay,
        packetLoss: points[nearestCursor].packetLoss,
      }
    })

    return {
      ...item,
      created_at: commonTimes,
      avg_delay: sampled.map((point) => point.delay),
      packet_loss: sampled.map((point) => point.packetLoss),
    }
  })
}

type PingTask = {
  id?: number | string
  name?: string
}

type PingRecord = {
  task_id?: number | string
  time?: string
  value?: number | string | null
}

type PingResult = {
  tasks?: PingTask[]
  records?: PingRecord[]
}

const toTaskId = (value: unknown): number | null => {
  const id = Number(value)
  return Number.isFinite(id) ? id : null
}

const getPingRecords = async (uuid: string, hours: number, httpOnly = false): Promise<PingResult> => {
  const client = SharedClient()
  const call = <TResult>(method: string, params: unknown) =>
    httpOnly ? client.callViaHTTP<any, TResult>(method, params) : client.call<any, TResult>(method, params)

  // 1.2.x 的公开接口会同时返回 tasks，适合主题在未登录/私有站点模式下使用。
  try {
    const result = await call<PingResult>("public:getPingRecords", {
      uuid,
      hours: String(hours),
    })
    if (result && Array.isArray(result.records)) {
      return result
    }
  } catch {
    // 旧版本没有 public:getPingRecords 时回退到兼容 RPC。
  }

  return call<PingResult>("common:getRecords", {
    type: "ping",
    uuid,
    maxCount: -1,
    hours,
  })
}

const getPublicPingTasks = async (): Promise<PingTask[]> => {
  try {
    const result: any = await SharedClient().call("public:getPublicPingTasks")
    const tasks: PingTask[] = []
    for (const task of Array.isArray(result) ? result : []) {
      const id = toTaskId(task?.id)
      if (id !== null) tasks.push({ id, name: task?.name ? String(task.name) : undefined })
    }
    return tasks
  } catch {
    return []
  }
}

const getPingTaskName = (taskId: number, tasks: PingTask[], fallback?: unknown): string => {
  const task = tasks.find((item) => toTaskId(item.id) === taskId)
  return task?.name || (typeof fallback === "string" && fallback.trim() ? fallback : `task_${taskId}`)
}

type MetricPointValue = {
  time: number
  value: number | null
}

const getMetricTaskId = (series: any): number | null =>
  toTaskId(series?.tags?.task_id ?? series?.tag?.task_id ?? series?.labels?.task_id)

const parseMetricPoints = (series: any, resultEnd: unknown): MetricPointValue[] => {
  const endTime = Date.parse(String(resultEnd || ""))
  const points = Array.isArray(series?.points) ? series.points : []

  return points
    .flatMap((point: any) => {
      const time = Date.parse(String(point?.time || ""))
      if (!Number.isFinite(time)) return []

      const value = point?.value === null || point?.value === undefined ? null : Number(point.value)
      if (value !== null && !Number.isFinite(value)) return []

      // fill_empty adds a null point exactly at the query end while the next
      // sampling bucket has not produced a value yet. It is not a failed ping.
      if (value === null && Number.isFinite(endTime) && time === endTime) return []

      return [{ time, value }]
    })
    .sort((a: MetricPointValue, b: MetricPointValue) => a.time - b.time)
}

const buildMonitorSeries = (result: PingResult | PingRecord[], serverId: number, serverName: string): NezhaMonitor[] => {
  const tasks = Array.isArray(result) ? [] : Array.isArray(result?.tasks) ? result.tasks : []
  const records = Array.isArray(result) ? result : Array.isArray(result?.records) ? result.records : []
  const seriesByTask = new Map<number, NezhaMonitor>()

  for (const task of tasks) {
    const taskId = toTaskId(task.id)
    if (taskId === null) continue
    seriesByTask.set(taskId, {
      monitor_id: taskId,
      monitor_name: task.name || `task_${taskId}`,
      server_id: serverId,
      server_name: serverName,
      created_at: [],
      avg_delay: [],
    })
  }

  for (const record of records) {
    const taskId = toTaskId(record.task_id) ?? 0
    if (!seriesByTask.has(taskId)) {
      seriesByTask.set(taskId, {
        monitor_id: taskId,
        monitor_name: getPingTaskName(taskId, tasks, (record as PingRecord & { name?: string }).name),
        server_id: serverId,
        server_name: serverName,
        created_at: [],
        avg_delay: [],
      })
    }

    const time = Date.parse(String(record.time || ""))
    const value = Number(record.value)
    if (!Number.isFinite(time) || !Number.isFinite(value)) continue

    const series = seriesByTask.get(taskId)!
    series.created_at.push(time)
    series.avg_delay.push(value)
  }

  const fullData = Array.from(seriesByTask.values()).map((series) => {
    const points = series.created_at
      .map((time, index) => ({ time, value: series.avg_delay[index] ?? 0 }))
      .sort((a, b) => a.time - b.time)
    const rawValues = points.map((point) => point.value)

    // 负值代表 Ping 失败，保留为丢包信号并用上一个正常值绘制延迟曲线。
    const packetLoss: number[] = []
    const delays: number[] = []
    let lastGood = 0
    let ema = 0
    for (const value of rawValues) {
      const lost = value < 0
      ema = 0.3 * (lost ? 100 : 0) + 0.7 * ema
      packetLoss.push(Number(ema.toFixed(2)))
      if (!lost) {
        lastGood = value
      }
      delays.push(lost ? lastGood : value)
    }

    return {
      ...series,
      created_at: points.map((point) => point.time),
      avg_delay: delays,
      packet_loss: packetLoss,
    }
  })

  return alignAndDownsampleMonitorSeries(fullData)
}

const fetchMetricPingSeries = async (uuid: string, hours: number, serverId: number, serverName: string): Promise<NezhaMonitor[] | null> => {
  try {
    const client = SharedClient()
    const result: any = await client.call("public:queryMetrics", {
      metric_key: "ping.latency_ms",
      entity_id: uuid,
      hours,
      downsample: true,
      fill_empty: true,
      max_points: MONITOR_TARGET_POINTS,
      aggregation: "avg",
    })

    const series = Array.isArray(result?.series) ? result.series : []
    let lossResult: any = null
    try {
      lossResult = await client.call("public:queryMetrics", {
        metric_key: "ping.loss",
        entity_id: uuid,
        hours,
        downsample: true,
        fill_empty: true,
        max_points: MONITOR_TARGET_POINTS,
        aggregation: "avg",
      })
    } catch {
      // Older Komari versions may expose latency without ping.loss.
    }

    const lossSeries = Array.isArray(lossResult?.series) ? lossResult.series : []
    const lossPointsByTask = new Map<number, Map<number, number | null>>()
    const lossPointsByIndex = new Map<number, Map<number, number | null>>()
    lossSeries.forEach((item: any, index: number) => {
      const points = new Map(parseMetricPoints(item, lossResult?.end).map((point) => [point.time, point.value]))
      const taskId = getMetricTaskId(item)
      if (taskId !== null) lossPointsByTask.set(taskId, points)
      lossPointsByIndex.set(index, points)
    })

    const taskDefinitions = await getPublicPingTasks()
    const taskNames = new Map(taskDefinitions.map((task) => [toTaskId(task.id), task.name]))
    const taskOrder = new Map(taskDefinitions.map((task, index) => [toTaskId(task.id), index]))
    const monitors = series.flatMap((item: any, index: number) => {
      const points = parseMetricPoints(item, result?.end)
      const taskId = getMetricTaskId(item)
      const monitorId = taskId ?? -(index + 1)
      const monitorName = String(item?.tags?.name ?? item?.tag?.name ?? item?.labels?.name ?? taskNames.get(monitorId) ?? `task_${monitorId}`)
      const lossPoints = taskId === null ? lossPointsByIndex.get(index) : lossPointsByTask.get(taskId) ?? lossPointsByIndex.get(index)
      const createdAt = points.map((point) => point.time)
      const delays = points.map((point) => (point.value === null || point.value < 0 ? null : point.value))
      const packetLoss = points.map((point) => {
        const lossRatio = lossPoints?.get(point.time)
        if (typeof lossRatio !== "number") return null

        // Komari stores ping.loss as a ratio (0..1), while the theme displays %.
        return Number((Math.max(0, Math.min(1, lossRatio)) * 100).toFixed(2))
      })

      if (createdAt.length === 0) return []
      return [{
        monitor_id: monitorId,
        monitor_name: monitorName,
        server_id: serverId,
        server_name: serverName,
        created_at: createdAt,
        avg_delay: delays,
        packet_loss: packetLoss,
      } satisfies NezhaMonitor]
    })

    monitors.sort((a: NezhaMonitor, b: NezhaMonitor) => {
      const aOrder = taskOrder.get(a.monitor_id) ?? Number.MAX_SAFE_INTEGER
      const bOrder = taskOrder.get(b.monitor_id) ?? Number.MAX_SAFE_INTEGER
      return aOrder - bOrder || a.monitor_id - b.monitor_id
    })

    // Metric API 已经按 max_points 下采样；保留内部空点用于画断线，过滤查询结束占位点。
    // 丢包率使用 ping.loss，不再从延迟空点推导。
    return monitors.length > 0 ? monitors : null
  } catch {
    // 1.2.6 之前没有 Metric API，调用方会回退到 Ping records。
    return null
  }
}

export const fetchServerGroup = async (): Promise<ServerGroupResponse> => {
  const kmNodes: Record<string, any> = await getKomariNodes()

  if (kmNodes?.error) {
    throw new Error(kmNodes.error)
  }
  // extract groups
  const groups: string[] = []
  Object.entries(kmNodes).forEach(([, value]) => {
    if (value.group && !groups.includes(value.group)) {
      groups.push(value.group)
    }
  })

  const data: ServerGroupResponse = {
    success: true,
    data: [
      ...groups.map((group, index) => ({
        group: {
          id: index,
          created_at: DateTime.now().toISO() || "",
          updated_at: DateTime.now().toISO() || "",
          name: group,
        },
        servers: Object.entries(kmNodes)
          .filter(([, value]) => value.group === group)
          .map(([key]) => uuidToNumber(key)),
      })),
    ],
  }
  return data
}

export const fetchLoginUser = async (): Promise<LoginUserResponse> => {
  const km_me = await SharedClient().call("common:getMe")
  if (km_me.error) {
    throw new Error(km_me.error)
  }
  const data: LoginUserResponse = {
    success: true,
    data: {
      id: uuidToNumber(km_me.uuid),
      username: km_me.username,
      password: "********",
      created_at: DateTime.now().toISO() || "",
      updated_at: DateTime.now().toISO() || "",
    },
  }
  return data
}
// TODO
export const fetchMonitor = async (server_id: number, hours: number = 24): Promise<MonitorResponse> => {
  // 获取 uuid 和服务器名称
  const km_nodes: Record<string, any> = await getKomariNodes()
  if (km_nodes?.error) {
    throw new Error(km_nodes.error)
  }
  const uuid = Object.keys(km_nodes).find((id) => uuidToNumber(id) === server_id)
  if (!uuid) {
    return { success: true, data: [] }
  }
  const serverName = km_nodes[uuid]?.name || String(server_id)

  // 新版 Metric API 才会真正按 hours 查询；public:getPingRecords 只返回最新缓存记录。
  const metricData = await fetchMetricPingSeries(uuid, hours, server_id, serverName)
  const data = metricData || buildMonitorSeries(await getPingRecords(uuid, hours), server_id, serverName)

  // 避免空的 avg_delay
  for (const s of data) {
    if (s.created_at.length === 0) {
      s.avg_delay = [0]
      s.packet_loss = [0]
      s.created_at = [Date.now()]
    }
  }

  return { success: true, data }
}
export const fetchServerUptime = async (): Promise<ServiceResponse> => {
  const kmNodes: Record<string, any> = await getKomariNodes()

  // 一次查询所有服务器的 load 记录（按 UUID 分组），用于判断服务器在线状态
  const result: any = await SharedClient().call("common:getRecords", {
    type: "load",
    load_type: "cpu",
    hours: 720,
    maxCount: -1,
  })

  const records: Record<string, any[]> = result?.records || {}
  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000
  const HOUR_MS = 60 * 60 * 1000
  const todayElapsedHours = new Date().getHours() + 1

  const services: Record<string, ServiceData> = {}

  for (const [uuid, clientRecords] of Object.entries(records)) {
    const serverName = kmNodes[uuid]?.name || uuid
    const serverId = uuidToNumber(uuid)

    const up = new Array(30).fill(0)
    const down = new Array(30).fill(0)
    const delay = new Array(30).fill(0)

    for (let dayIdx = 0; dayIdx < 30; dayIdx++) {
      const dayStart = now - (30 - dayIdx) * DAY_MS
      const dayEnd = dayStart + DAY_MS

      // 统计当天每个小时是否有记录
      const hoursWithRecords = new Set<number>()
      for (const rec of clientRecords) {
        const ts = Date.parse(rec.time)
        if (ts >= dayStart && ts < dayEnd) {
          hoursWithRecords.add(Math.floor((ts - dayStart) / HOUR_MS))
        }
      }

      // 今天只算已过去的小时数
      const expectedHours = dayIdx === 29 ? todayElapsedHours : 24
      up[dayIdx] = hoursWithRecords.size
      down[dayIdx] = Math.max(0, expectedHours - hoursWithRecords.size)
    }

    services[String(serverId)] = {
      service_name: serverName,
      current_up: up[29] > 0 ? 1 : 0,
      current_down: up[29] === 0 ? 1 : 0,
      total_up: up.reduce((a, b) => a + b, 0),
      total_down: down.reduce((a, b) => a + b, 0),
      delay,
      up,
      down,
    }
  }

  // 补充没有 load 记录但存在于节点列表中的服务器（全部离线）
  for (const [uuid] of Object.entries(kmNodes)) {
    const serverId = uuidToNumber(uuid)
    if (!services[String(serverId)]) {
      services[String(serverId)] = {
        service_name: kmNodes[uuid]?.name || uuid,
        current_up: 0,
        current_down: 1,
        total_up: 0,
        total_down: 720,
        delay: new Array(30).fill(0),
        up: new Array(30).fill(0),
        down: new Array(30).fill(24),
      }
    }
  }

  return {
    success: true,
    data: { services, cycle_transfer_stats: {} },
  }
}

export const fetchService = async (): Promise<ServiceResponse> => {
  // 按 UUID 逐个查询，公开接口优先，自动兼容旧版 RPC 返回结构。
  // 每次查询单个 UUID 数据量小，不会拖慢后端
  const kmNodes: Record<string, any> = await getKomariNodes()
  const uuids = Object.keys(kmNodes || {})

  const allTasks: Array<{ id: number; name?: string }> = []
  const allRecords: Array<PingRecord & { task_id: number }> = []
  const seenTaskIds = new Set<number>()

  // 逐个查询，避免并发请求压垮后端
  for (const uuid of uuids) {
    try {
      const result = await getPingRecords(uuid, 720, true)
      const tasks = Array.isArray(result?.tasks) ? result.tasks : []
      const records = Array.isArray(result?.records) ? result.records : []
      for (const t of tasks) {
        const taskId = toTaskId(t.id)
        if (taskId !== null && !seenTaskIds.has(taskId)) {
          seenTaskIds.add(taskId)
          allTasks.push({ id: taskId, name: t.name })
        }
      }

      for (const record of records) {
        const taskId = toTaskId(record.task_id)
        if (taskId === null) continue
        // common:getRecords 没有 tasks 时，从 records 反推一个可展示的任务。
        if (!seenTaskIds.has(taskId)) {
          seenTaskIds.add(taskId)
          allTasks.push({ id: taskId, name: `Task ${taskId}` })
        }
        allRecords.push({ ...record, task_id: taskId })
      }
    } catch {
      // 单个节点失败不影响整体
    }
  }

  const services: Record<string, ServiceData> = {}
  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000

  for (const task of allTasks) {
    const taskId = task.id

    const up = new Array(30).fill(0)
    const down = new Array(30).fill(0)
    const delaySum = new Array(30).fill(0)
    const delayCnt = new Array(30).fill(0)

    for (const rec of allRecords) {
      if (rec.task_id !== taskId) continue
      const ts = Date.parse(String(rec.time || ""))
      if (!Number.isFinite(ts)) continue
      const dayIndex = 29 - Math.floor((now - ts) / DAY_MS)
      if (dayIndex < 0 || dayIndex > 29) continue
      const val = Number(rec.value)
      if (!Number.isFinite(val)) continue
      if (val >= 0) {
        up[dayIndex]++
        delaySum[dayIndex] += val
        delayCnt[dayIndex]++
      } else {
        down[dayIndex]++
      }
    }

    const delay = delaySum.map((s, i) => (delayCnt[i] > 0 ? s / delayCnt[i] : 0))

    const totalUp = up.reduce((a, b) => a + b, 0)
    const totalDown = down.reduce((a, b) => a + b, 0)

    services[String(task.id)] = {
      service_name: task.name || `Task ${task.id}`,
      current_up: up[29] > 0 ? 1 : 0,
      current_down: down[29] > 0 ? 1 : 0,
      total_up: totalUp,
      total_down: totalDown,
      delay,
      up,
      down,
    }
  }

  return {
    success: true,
    data: { services, cycle_transfer_stats: {} },
  }
}

const getPublicInfo = async (): Promise<any> => {
  // 官方新版前端使用 /api/public，私有站点访客也能读取主题配置。
  try {
    const response = await fetch("/api/public", { credentials: "same-origin" })
    if (response.ok) {
      const payload: any = await response.json()
      const info = payload?.data?.data ?? payload?.data ?? payload
      if (info && typeof info === "object" && !Array.isArray(info) && !info.error) {
        return info
      }
    }
  } catch {
    // 回退到 RPC，兼容旧版 Komari 或自定义反向代理。
  }

  const info = await SharedClient().call("common:getPublicInfo")
  if (info?.error) throw new Error(info.error)
  return info
}

const getVersionInfo = async (): Promise<any> => {
  try {
    const version = await SharedClient().call("public:getVersion")
    if (version?.version) return version
  } catch {
    // 旧版没有 public:getVersion 时回退。
  }
  return SharedClient().call("common:getVersion")
}

export const fetchPingRetentionHours = async (): Promise<number | null> => {
  try {
    const definitions: any = await SharedClient().call("public:listMetricDefinitions")
    if (Array.isArray(definitions)) {
      const pingDefinitions = definitions.filter((item: any) => item?.name === "ping.latency_ms" || item?.name === "ping.loss")
      const pingRetentions = pingDefinitions
        .map((item: any) => Number(item.retention_days) * 24)
        .filter((hours: number) => Number.isFinite(hours) && hours >= 0)

      if (pingRetentions.length > 0) {
        return Math.min(...pingRetentions)
      }

      // 新版接口明确返回了指标定义但没有可用的 Ping 保留数据，不能再回退到旧版的宽泛设置。
      if (pingDefinitions.length > 0) return 0
    }
  } catch {
    // 旧版没有 Metric API 时使用站点 Ping 记录保留时长。
  }

  try {
    const publicInfo = await getPublicInfo()
    const hours = Number(publicInfo?.ping_record_preserve_time)
    return Number.isFinite(hours) && hours > 0 ? hours : null
  } catch {
    return null
  }
}

export const updateThemeSetting = async (key: string, value: unknown): Promise<void> => {
  const win = window as unknown as Record<string, unknown>
  const current = (win.__themeSettings as Record<string, unknown>) || {}
  const updated = { ...current, [key]: value }
  const res = await fetch(`/api/admin/theme/settings?theme=kozha`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(updated),
  })
  if (!res.ok) throw new Error("Failed to update theme settings")
  // 同步本地状态
  win.__themeSettings = updated
  win[key] = value
}

export const fetchSetting = async (): Promise<SettingResponse> => {
  const km_public = await getPublicInfo()
  // Apply managed theme configuration to window.* variables
  const themeSettings = km_public.theme_settings
  if (themeSettings && typeof themeSettings === "object") {
    ;(window as unknown as Record<string, unknown>).__themeSettings = { ...themeSettings }
    for (const [key, value] of Object.entries(themeSettings)) {
      ;(window as unknown as Record<string, unknown>)[key] = value
    }
  }
  const km_version = await getVersionInfo()
  const km_data: SettingResponse = {
    success: true,
    data: {
      config: {
        debug: false,
        language: "zh-CN",
        site_name: km_public.sitename,
        site_desc: km_public.description || "",
        user_template: "",
        admin_template: "",
        custom_code: "", // km_public.custom_head 当作为主题时，Komari会自动在Head中插入该代码，留空即可
      },
      version: km_version.version || "unknown",
    },
  }
  return km_data
}
