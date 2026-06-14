export function isAnimatedAuroraBackgroundEnabled() {
  const value = (window as unknown as Record<string, unknown>).EnableAnimatedAuroraBackground

  return value !== false && value !== "false" && value !== "0"
}

export default function AuroraBackground() {
  return (
    <div className="komari-aurora-background" aria-hidden="true">
      <div className="komari-aurora-blobs">
        <span className="komari-aurora-blob komari-aurora-blob-1" />
        <span className="komari-aurora-blob komari-aurora-blob-2" />
        <span className="komari-aurora-blob komari-aurora-blob-3" />
        <span className="komari-aurora-blob komari-aurora-blob-4" />
        <span className="komari-aurora-blob komari-aurora-blob-5" />
      </div>
      <div className="komari-aurora-grain" />
      <div className="komari-aurora-vignette" />
    </div>
  )
}

