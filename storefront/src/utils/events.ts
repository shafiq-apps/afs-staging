type EventHandler<T = any> = (payload: T) => void;

class EventBus {
    private events: Record<string, EventHandler[]> = {};

    on<T = any>(event: string, handler: EventHandler<T>) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(handler);
    }

    off<T = any>(event: string, handler: EventHandler<T>) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(h => h !== handler);
    }

    emit<T = any>(event: string, payload?: T) {
        (this.events[event] || []).forEach(handler => handler(payload));
    }
}

export const Events = new EventBus();