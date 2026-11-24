import { invoke } from '@tauri-apps/api/core'

export interface CuPermissions {
  supported: boolean
  accessibility: boolean
  screenRecording: boolean
  runtimeReady: boolean
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ControlledWindow {
  windowId: number
  appName: string
  title: string
  appIcon: string | null
  active: boolean
  lastAction: string
  updatedAt: number
  bounds: WindowBounds | null
  streamError: string | null
}

export interface CuFramePayload {
  windowId: number
  mimeType: string
  data: string
  width: number
  height: number
}

export interface CuStopPayload {
  windowId: number
}

export function getCuPermissions(): Promise<CuPermissions> {
  return invoke<CuPermissions>('cu_permissions')
}

export function requestCuPermission(kind: 'accessibility' | 'screen_recording'): Promise<CuPermissions> {
  return invoke<CuPermissions>('cu_request_permission', { kind })
}

export function focusCuWindow(windowId: number): Promise<void> {
  return invoke<void>('cu_focus_window', { windowId })
}

export function unwatchCuWindow(windowId: number): Promise<void> {
  return invoke<void>('cu_unwatch_window', { windowId })
}

export function clearCuWindows(): Promise<void> {
  return invoke<void>('cu_clear_all')
}

export function listCuWindows(): Promise<ControlledWindow[]> {
  return invoke<ControlledWindow[]>('cu_list_windows')
}
