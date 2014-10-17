var Peertc = (function() {
	'use strict';
	var PeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
	var nativeRTCIceCandidate = (window.mozRTCIceCandidate || window.RTCIceCandidate);
	var nativeRTCSessionDescription = (window.mozRTCSessionDescription || window.RTCSessionDescription); // order is very important: "RTCSessionDescription" defined in Nighly but useless
	var DataChannelSupport = false;
	var WebSocketSupport = !!WebSocket;
	var noop = function() {};

	(function() {
		var pc;
		try {
			if (!PeerConnection) {
				DataChannelSupport = false;
			}
			pc = new webkitRTCPeerConnection(null);
			if (pc && pc.createDataChannel) {
				DataChannelSupport = true;
			} else {
				DataChannelSupport = false;
			}
		} catch (e) {
			DataChannelSupport = false;
		}
	}());

	var iceServer = {
		"iceServers": [{
			"url": "stun:stun.l.google.com:19302"
		}]
	};

	function Peertc(server, id) {
		if (!(this instanceof Peertc)) {
			return new Peertc(server, id);
		}

		if (!WebSocketSupport) {
			this.emit('error', new Error('WebSocket is not supported, Please upgrade your browser!'));
		}
		if (!DataChannelSupport) {
			this.emit('error', new Error('DataChannel is not supported, Please upgrade your browser!'));
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
			that.emit('error', error, socket);
		};
		socket.onclose = function() {
			for (var i in connectors) {
				connectors[i].pc && connectors[i].pc.close();
			}
			connectors = {};
		};
		that.on('_init', function() {
			that.emit('init');
		});

		that.on('_ice_candidate', function(data) {
			var candidate = new nativeRTCIceCandidate(data);
			var pc = connectors[data.from].pc;
			pc.addIceCandidate(candidate);
		});
		that.on('_offer', function(data) {
			var connector = that.__createConnector(data.from, false);
			var sdp = data.sdp;
			var pc = connector.pc;
			pc.setRemoteDescription(new nativeRTCSessionDescription(sdp));
			pc.createAnswer(function(session_desc) {
				pc.setLocalDescription(session_desc);
				that.socket.send(JSON.stringify({
					"event": "__answer",
					"data": {
						"from": id,
						"to": data.from,
						"sdp": session_desc
					}
				}));
			}, function(error) {
				console.log(error);
			});
		});

		that.on('_answer', function(data) {
			var pc = connectors[data.from].pc;
			pc.setRemoteDescription(new nativeRTCSessionDescription(data.sdp));
		});
	};

	Peertc.prototype.connect = function(to) {
		var that = this;
		var connector;
		if (!that.connectors[to]) {
			connector = that.__createConnector(to, true);
			that.__sendOffer(to);
		} else {
			connector = that.connectors[to];
		}
		return connector;
	};

	Peertc.prototype.__sendOffer = function(to) {
		var that = this;
		var pc = that.connectors[to].pc;

		function sendOffer() {
			var readyState = that.socket.readyState;
			if (readyState === 1) {
				pc.createOffer(function(session_desc) {
						pc.setLocalDescription(session_desc);
						that.socket.send(JSON.stringify({
							"event": "__offer",
							"data": {
								"sdp": session_desc,
								"to": to,
								"from": that.id
							}
						}));
					},
					function(error) {
						console.log(error);
					});
			} else if (readyState === 0) {
				setTimeout(sendOffer, 0);
			}

		}
		setTimeout(sendOffer, 0);
	};

	Peertc.prototype.__createConnector = function(to, channel) {
		var that = this;
		var pc = new PeerConnection(iceServer);
		return that.connectors[to] = new Connector({
			pc: pc,
			to: to,
			id: that.id,
			peertc: that,
			channel: channel
		});
	};

	return Peertc;
}());