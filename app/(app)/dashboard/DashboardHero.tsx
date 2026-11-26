'use client'

import { useFloodAssessment } from '@/components/features/FloodAssessmentProvider'
import FloodStatusPanel from '@/components/features/FloodStatusPanel'

export default function DashboardHero({
  showScanCta = true,
  hideUnsupportedHydrology = false,
  compactFarmer = false,
}: {
  userName: string
  showScanCta?: boolean
  hideUnsupportedHydrology?: boolean
  compactFarmer?: boolean
}) {
  const assessment = useFloodAssessment()
  return (
    <FloodStatusPanel
      {...assessment}
      showScanCta={showScanCta}
      hideUnsupportedHydrology={hideUnsupportedHydrology}
      compactFarmer={compactFarmer}
    />
  )
}
