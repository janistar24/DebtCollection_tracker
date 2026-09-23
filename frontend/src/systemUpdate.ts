export const SYSTEM_UPDATE_EVENT = 'debt-collection:before-system-update'

export interface SystemUpdateEventDetail {
  tasks: Promise<boolean>[]
}

export async function saveOpenEditorsBeforeSystemUpdate(): Promise<boolean> {
  const detail: SystemUpdateEventDetail = { tasks: [] }
  window.dispatchEvent(new CustomEvent<SystemUpdateEventDetail>(SYSTEM_UPDATE_EVENT, { detail }))
  if (detail.tasks.length === 0) return true
  const results = await Promise.allSettled(detail.tasks)
  return results.every(result => result.status === 'fulfilled' && result.value)
}
