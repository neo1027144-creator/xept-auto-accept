import { XeptConfig } from '../config';

// ── Webview → Extension ─────────────────────────────

export type IncomingMessage =
  | { type: 'toggleConfig'; key: string; value: boolean }
  | { type: 'updateConfig'; key: string; value: any }
  | { type: 'addListItem'; key: string; value: string }
  | { type: 'removeListItem'; key: string; index: number }
  | { type: 'ready' };

// ── Extension → Webview ─────────────────────────────

export interface LogEntry {
  time: string;
  icon: string;
  text: string;
}

export interface DashboardState {
  isRunning: boolean;
  clickCount: number;
  health: 'connected' | 'disconnected' | 'reconnecting';
  config: XeptConfig;
  logs: LogEntry[];
}

export type OutgoingMessage =
  | { type: 'stateUpdate'; payload: DashboardState };
