var EventEmitter = (function() {
	function EventEmitter() {
		this.events = {};
	}
	EventEmitter.prototype.on = function(eventName, callback) {
		this.events[eventName] = this.events[eventName] || [];
		this.events[eventName].push(callback);
		return this;
	};
	EventEmitter.prototype.emit = function(eventName) {
		var events = this.events[eventName],
			args = Array.prototype.slice.call(arguments, 1),
			i, m;

		if (!events) {
			return;
		}
		for (i = 0, m = events.length; i < m; i++) {
			events[i].apply(null, args);
		}
		return this;
	};
	EventEmitter.prototype.off = function(eventName, callback) {
		var callbacks = this.events[eventName];
		var index;
		if (callbacks && (index = callbacks.indexOf(callback) !== -1)) {
			callbacks.splice(index, 1);
		}
		return this;
	};
	return EventEmitter;
}());