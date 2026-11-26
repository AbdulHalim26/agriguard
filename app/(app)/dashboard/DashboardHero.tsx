'use client'

import { useFloodAssessment } from '@/components/features/FloodAssessmentProvider'
import FloodStatusPanel from '@/components/features/FloodStatusPanel'

export default function DashboardHero({ showScanCta = true }: { userName: string; showScanCta?: boolean }) {
  const assessment = useFloodAssessment()
  return <FloodStatusPanel {...assessment} showScanCta={showScanCta} />
}
