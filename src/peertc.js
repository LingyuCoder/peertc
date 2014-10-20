(function(factory) {
	if (typeof define === 'function' && define.amd) {
		define([], function() {
			return factory();
		});
	} else if (typeof define === 'function' && define.cmd) {
		define(function(require, exports, module) {
			module.exports = factory();
		});
	} else {
		window.Peertc = factory();
	}
}(function() {
	'use strict';
	var PeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
	var DataChannelSupport = false;
	var WebSocketSupport = !!WebSocket;
	var noop = function() {};

	(function() {
		var pc;
		try {
			if (!PeerConnection) {
				DataChannelSupport = false;
			}
			pc = new PeerConnection(null);
			if (pc && pc.createDataChannel) {
				DataChannelSupport = true;
			} else {
				DataChannelSupport = false;
			}
		} catch (e) {
			DataChannelSupport = false;
		}
	}());

	function Peertc(server, id) {
		if (!(this instanceof Peertc)) {
			return new Peertc(server, id);
		}

		if (!WebSocketSupport) {
			this.emit('error', new Error('WebSocket is not supported, Please upgrade your browser!'));
			return;
		}

		this.id = id;
		this.socket = new WebSocket(server);
		this.connectors = {};
		this.__init();
	}

	Peertc.prototype = new EventEmitter();

	Peertc.prototype.__init = function() {
		var that = this;
		var id = that.id;
		var connectors = that.connectors;
		var socket = that.socket;
		socket.onopen = function() {
			socket.send(JSON.stringify({
				'event': '__init',
				'data': {
					id: id
				}
			}));
		};
		socket.onmessage = function(message) {
			var json = JSON.parse(message.data);
			if (json.event) {
				that.emit(json.event, json.data, socket);
			} else {
				that.emit('message', json.data, socket);
			}
		};
		socket.onerror = function(error) {
			that.emit('error', new Error('Socket error'));
		};
		socket.onclose = function() {
			for (var i in connectors) {
				connectors[i].close();
			}
			connectors = {};
		};
		that.on('_init', function() {
			that.emit('init');
		});
		that.on('_ice_candidate', function(data) {
			connectors[data.from].__addCandidate(data);
		});
		that.on('_offer', function(data) {
			var connector = that.__createConnector(data.from, false);
			connector.__sendAnswer(data);
		});
		that.on('_answer', function(data) {
			connectors[data.from].__recieveAnswer(data);
		});
	};

	Peertc.prototype.connect = function(to) {
		var that = this;
		var connector;
		if (!that.connectors[to]) {
			connector = that.__createConnector(to, true);
			connector.__sendOffer();
		} else {
			connector = that.connectors[to];
		}
		return connector;
	};

	Peertc.prototype.__createConnector = function(to, isOpenner) {
		var that = this;
		return that.connectors[to] = DataChannelSupport ? new Connector({
			to: to,
			id: that.id,
			peertc: that,
			isOpenner: isOpenner
		}) : new SocketConnector({
			to: to,
			id: that.id,
			peertc: that,
			isOpenner: isOpenner
		});
	};
	return Peertc;
}));