import type { Customer } from '../day/types.ts';
import type { FloorRoomId } from './starter-map.ts';

export type TableSurfaceState = 'unset' | 'ready' | 'occupied' | 'dirty';

export interface FloorTable {
  placementId: string;
  state: TableSurfaceState;
  seatSlotCount: number;
}

export interface SeatSlot {
  tablePlacementId: string;
  slotIndex: number;
  x: number;
  y: number;
  facing: 0 | 90 | 180 | 270;
}

export type GuestStage =
  | 'queued'
  | 'entering'
  | 'waiting'
  | 'seating'
  | 'seated'
  | 'ordered'
  | 'eating'
  | 'leaving'
  | 'done';

export interface FloorTicket {
  id: string;
  customerId: string;
  ingredientIds: string[];
  status: 'open' | 'plated' | 'delivered';
}

export interface FloorGuest {
  id: string;
  customer: Customer;
  stage: GuestStage;
  seat?: SeatSlot;
  /** Last fully reached grid cell while an enter, seating, or exit walk is in flight. */
  motionPosition?: { x: number; y: number };
  eatTicksRemaining: number;
}

export interface FloorDay {
  pool: FloorGuest[];
  tables: FloorTable[];
  seats: SeatSlot[];
  tickets: FloorTicket[];
  carriedTicketId: string | null;
  selectedTicketId: string | null;
  tutorialStep: string | null;
  playerPosition: { x: number; y: number };
  /** Room containing playerPosition. Missing in older saves and defaults to main. */
  playerRoom?: FloorRoomId;
}
