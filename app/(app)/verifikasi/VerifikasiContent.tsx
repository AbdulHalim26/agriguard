'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import WaterLevelForm from '@/components/features/WaterLevelForm'
import ReportVerification from '@/components/features/ReportVerification'
import RekapLaporan from './RekapLaporan'

export default function VerifikasiContent() {
  return (
    <Tabs defaultValue="water" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3 print:hidden">
        <TabsTrigger value="water">Tinggi Air</TabsTrigger>
        <TabsTrigger value="reports">Verifikasi Laporan</TabsTrigger>
        <TabsTrigger value="rekap">Rekap</TabsTrigger>
      </TabsList>

      <TabsContent value="water" className="space-y-4">
        <WaterLevelForm />
      </TabsContent>

      <TabsContent value="reports" className="space-y-4">
        <ReportVerification />
      </TabsContent>

      <TabsContent value="rekap" className="space-y-4">
        <RekapLaporan />
      </TabsContent>
    </Tabs>
  )
}