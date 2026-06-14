import { cn } from "@/lib/utils"
import "country-flag-icons/3x2/flags.css"
import getUnicodeFlagIcon from "country-flag-icons/unicode"
import { useEffect, useState } from "react"

export default function ServerFlag({ country_code, className }: { country_code: string; className?: string }) {
  const [supportsEmojiFlags, setSupportsEmojiFlags] = useState(false)

  // @ts-expect-error ForceUseSvgFlag is a global variable
  const forceUseSvgFlag = window.ForceUseSvgFlag as boolean
  const countryCode = country_code?.toUpperCase()

  useEffect(() => {
    if (forceUseSvgFlag) {
      // 如果环境变量要求直接使用 SVG，则无需检查 Emoji 支持
      setSupportsEmojiFlags(false)
      return
    }

    const checkEmojiSupport = () => {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      const emojiFlag = "🇺🇸" // 使用美国国旗作为测试
      if (!ctx) return
      ctx.fillStyle = "#000"
      ctx.textBaseline = "top"
      ctx.font = "32px Arial"
      ctx.fillText(emojiFlag, 0, 0)

      const support = ctx.getImageData(16, 16, 1, 1).data[3] !== 0
      setSupportsEmojiFlags(support)
    }

    checkEmojiSupport()
  }, [])

  if (!country_code) return null

  return (
    <span className={cn("inline-flex items-center text-[12px] text-muted-foreground", className)}>
      {forceUseSvgFlag || !supportsEmojiFlags ? (
        <span className={cn(`flag:${countryCode}`, "rounded-[2px]")} />
      ) : (
        getUnicodeFlagIcon(countryCode)
      )}
    </span>
  )
}
