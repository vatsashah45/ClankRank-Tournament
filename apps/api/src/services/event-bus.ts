import { EventEmitter } from "node:events";

export type TournamentEventType = "match:started" | "match:completed" | "state:advanced" | "round:completed";

export interface TournamentEvent {
  type: TournamentEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

class TournamentEventBus extends EventEmitter {
  private eventId = 0;

  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  publish(event: TournamentEvent): void {
    this.eventId++;
    this.emit("tournament-event", { ...event, id: this.eventId });
  }

  getNextEventId(): number {
    return this.eventId;
  }
}

// Singleton
export const eventBus = new TournamentEventBus();
