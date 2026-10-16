import { NezhaWebsocketResponse } from "@/types/nezha-api"
import { createContext } from "react"

export interface WebSocketContextType {
  lastMessage: NezhaWebsocketResponse | null
  connected: boolean
  messageHistory: NezhaWebsocketResponse[]
  reconnect: () => void
  needReconnect: boolean
  setNeedReconnect: (needReconnect: boolean) => void
}

export const WebSocketContext = createContext<WebSocketContextType>({
  lastMessage: null,
  connected: false,
  messageHistory: [],
  reconnect: () => {},
  needReconnect: false,
  setNeedReconnect: () => {},
})
