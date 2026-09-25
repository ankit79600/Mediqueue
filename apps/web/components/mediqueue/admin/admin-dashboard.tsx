'use client'

import { KpiCards } from './kpi-cards'
import { DepartmentLoad } from './department-load'
import { ActivityFeed } from './activity-feed'

export function AdminDashboard() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hospital OPD Overview</h1>
          <p className="text-sm text-muted-foreground">City General Hospital · Live operations for today</p>
        </div>
      </div>
      <KpiCards />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DepartmentLoad />
        </div>
        <ActivityFeed />
      </div>
    </div>
  )
}
