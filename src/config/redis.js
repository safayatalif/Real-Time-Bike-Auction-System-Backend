const EventEmitter = require('events');

class RedisMock extends EventEmitter {
    constructor() {
        super();
        this.store = new Map();
        // Simulate successful connection immediately
        setTimeout(() => this.emit('connect'), 0);
    }

    async get(key) {
        return this.store.get(key) || null;
    }

    async set(key, value, ...args) {
        this.store.set(key, value);
        return 'OK';
    }

    async del(key) {
        this.store.delete(key);
        return 1;
    }

    async quit() {
        return 'OK';
    }
}

console.log('Using in-memory Redis mock (Redis server not required)');
module.exports = new RedisMock();
