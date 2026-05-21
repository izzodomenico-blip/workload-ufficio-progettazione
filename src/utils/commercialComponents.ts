import type { AppData, Status, WorkshopOutput, WorkshopOutputStatus } from '../types'

export type CommercialClosureResolution = 'confirm_ordered' | 'proceed_warning'

export const WORKSHOP_OUTPUT_CLOSING_STATUSES = new Set<WorkshopOutputStatus>([
  'rilasciato_produzione',
  'ricevuto_officina',
])

export const WORK_ITEM_CLOSING_STATUSES = new Set<Status>(['Completato'])

export function isPendingCommercialOutput(output: WorkshopOutput): boolean {
  return Boolean(
    output.hasCommercialComponents &&
    output.commercialComponentsOrderRequired &&
    !output.commercialComponentsOrdered,
  )
}

export function pendingCommercialOutputsForWorkItem(data: AppData, workItemId: string): WorkshopOutput[] {
  return data.workshopOutputs.filter((output) => output.workItemId === workItemId && isPendingCommercialOutput(output))
}

export function pendingCommercialOutputsForOutput(data: AppData, outputId: string): WorkshopOutput[] {
  return data.workshopOutputs.filter((output) => output.id === outputId && isPendingCommercialOutput(output))
}
