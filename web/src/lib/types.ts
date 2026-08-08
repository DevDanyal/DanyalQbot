export interface BotStatus {
  running: boolean;
  started_at: number | null;
  uptime: number;
  balance: number | null;
  error: string | null;
  mode: "demo" | "live";
}

export interface Trade {
  id: string;
  time: string;
  pair: string;
  direction: string;
  amount: string;
  expiry: string;
  open_price: string;
  result: string;
  payout: string;
  pnl: string;
  balance_after: string;
  signal_reason: string;
}

export interface DailyRow {
  day: string;
  trades: string;
  wins: string;
  losses: string;
  pnl: string;
  end_balance: string;
}

export interface ExperienceSlot {
  trades: number;
  wins: number;
  pnl: number;
}

export interface Stats {
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  pnl: number;
  recent: Trade[];
  daily: DailyRow[];
  experience: { slots: Record<string, ExperienceSlot> };
}

export type AnalyzeSuccess = {
  ok: true;
  direction: "UP" | "DOWN" | "FLAT";
  confidence: number;
  candles_detected: number;
  reasons: string[];
  disclaimer: string;
};

export type AnalyzeFailure = { ok: false; error: string };

export type AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure;

export interface ActionResponse {
  ok: boolean;
  message: string;
}
