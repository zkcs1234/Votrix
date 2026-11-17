import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PLATFORM_NAME, usePlatformStore } from './platform.store'

beforeEach(() => {
  usePlatformStore.setState({ platformName: DEFAULT_PLATFORM_NAME, maintenanceMode: false, loaded: false })
})

describe('platform store', () => {
  it('starts with the default name and maintenance off', () => {
    expect(usePlatformStore.getState()).toMatchObject({ platformName: 'Votrix', maintenanceMode: false, loaded: false })
  })

  it('applies a name and maintenance state from the server', () => {
    usePlatformStore.getState().apply({ platformName: '  BISU Votes ', maintenanceMode: true })
    expect(usePlatformStore.getState()).toMatchObject({ platformName: 'BISU Votes', maintenanceMode: true, loaded: true })
  })

  it('ignores unusable values and keeps what it had', () => {
    usePlatformStore.getState().apply({ platformName: 'BISU Votes', maintenanceMode: true })
    usePlatformStore.getState().apply({ platformName: '   ', maintenanceMode: 'yes' })
    expect(usePlatformStore.getState()).toMatchObject({ platformName: 'BISU Votes', maintenanceMode: true })
    usePlatformStore.getState().apply()
    expect(usePlatformStore.getState().platformName).toBe('BISU Votes')
  })

  it('can turn maintenance off again', () => {
    usePlatformStore.getState().setMaintenance(true)
    expect(usePlatformStore.getState().maintenanceMode).toBe(true)
    usePlatformStore.getState().apply({ maintenanceMode: false })
    expect(usePlatformStore.getState().maintenanceMode).toBe(false)
  })
})
