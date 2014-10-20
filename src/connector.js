var Connector = (function() {
	'use strict';
	var PeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
	var nativeRTCIceCandidate = (window.mozRTCIceCandidate || window.RTCIceCandidate);
	var nativeRTCSessionDescription = (window.mozRTCSessionDescription || window.RTCSessionDescription); // order is very important: "RTCSessionDescription" defined in Nighly but useless
	var iceServer = {
		"iceServers": [{
			"url": "stun:stun.l.google.com:19302"
		}]
	};

	function Connector(config) {
		if (!(this instanceof Connector)) {
			return new Connector(config);
		}
		this.pc = new PeerConnection(iceServer);
		this.id = config.id;
		this.to = config.to;
		this.peertc = config.peertc;
		this.__init(config);
		this.queue = [];
		this.sending = false;
		this.fileSenders = {};
		this.fileRecievers = {};
	}

	Connector.prototype.__initDataChannel = function(channel) {
		var that = this;
		that.channel = channel;

		channel.onopen = function() {
			that.peertc.emit('open', that.to);
		};

		channel.onmessage = function(message) {
			var json = JSON.parse(message.data);
			if (json.type === 'message') {
				that.__parseMessage(json.data);
			} else if (json.type === 'file') {
				that.__parseFileChunk(json.data);
			}
		};

		channel.onclose = function(event) {
			that.close();
			that.peertc.emit('close', that.to);
		};

		channel.onerror = function(err) {
			that.peertc.emit('error', err, that.to);
		};
	};

	Connector.prototype.__parseMessage = function(data) {
		var from = this.to;
		this.peertc.emit('message', data, from);
	};

	Connector.prototype.__parseFileChunk = function(data) {
		var that = this;
		var from = that.to;
		var fileRecievers = that.fileRecievers;
		fileRecievers[from] = fileRecievers[from] || {};
		var fileReciever = fileRecievers[from][data.id] = fileRecievers[from][data.id] || new FileReciever(data.id, data.meta, from);
		fileReciever.addChunk(data.chunk);
		that.peertc.emit('fileChunk', data, from);
		if (data.sended === data.sum) {
			fileReciever.download();
			that.peertc.emit('file', fileReciever.meta, from);
			delete fileRecievers[from][data.id];
		}
	}

	Connector.prototype.__init = function(config) {
		var that = this;
		var pc = that.pc;
		var id = that.id;
		var to = that.to;

		pc.onicecandidate = function(evt) {
			if (evt.candidate) {
				that.peertc.socket.send(JSON.stringify({
					"event": "__ice_candidate",
					"data": {
						"label": evt.candidate.sdpMLineIndex,
						"candidate": evt.candidate.candidate,
						"from": id,
						"to": to
					}
				}));
			}
		};

		pc.ondatachannel = function(evt) {
			that.__initDataChannel(evt.channel);
		};
		if (config.isOpenner) {
			that.__initDataChannel(pc.createDataChannel(to));
		}
	};

	Connector.prototype.sendFile = function(dom) {
		var that = this;
		var file = file;
		var reader = reader;
		if (typeof dom === 'string') {
			dom = document.querySelector(dom);
		}
		if (!dom.files || !dom.files[0]) {
			that.peertc.emit('error', new Error('no file need to be send'), that.id);
			return;
		}
		file = dom.files[0];
		var fileSender = new FileSender(file);
		fileSender.chunkify(function() {
			function send() {
				var chunk = fileSender.getChunk();
				var data = {
					sum: fileSender.sum,
					sended: fileSender.sended,
					meta: fileSender.meta,
					id: fileSender.id,
					chunk: chunk
				};
				if (chunk) {
					that.queue.push({
						type: 'file',
						data: data
					});
					that.peertc.emit("fileChunkSended", data, that.to);
					if (data.sended === data.sum) {
						that.peertc.emit("fileSended", data.meta, that.to);
					}
					setTimeout(send, 0);
				}
				if (!that.sending) {
					setTimeout(function() {
						that.__send();
					}, 0);
				}
			}
			setTimeout(send, 0);
		});
		return that;
	};

	Connector.prototype.close = function() {
		var that = this;
		that.sending = false;
		that.queue = [];
		if (that.channel && that.channel.readyState.toLowerCase() === 'connecting') {
			that.channel.close();
		}
		that.channel = null;
		if (that.pc.signalingState !== 'closed') {
			that.pc.close();
		}
		delete that.peertc.connectors[that.to];
	};

	Connector.prototype.send = function(data) {
		var that = this;
		that.queue.push({
			type: 'message',
			data: data
		});
		if (!that.sending) {
			setTimeout(function() {
				that.__send();
			}, 0);
		}
		return that;
	};

	Connector.prototype.__send = function() {
		var that = this;
		var queue = that.queue;
		if (queue.length === 0) {
			return;
		}
		that.sending = true;
		var data = queue[0];
		var channel = that.channel;
		if (!channel) {
			return;
		} else {
			var readyState = channel.readyState.toLowerCase();
			if (readyState === 'open') {
				data.from = that.id;
				data.to = that.to;
				channel.send(JSON.stringify(data));
				queue.shift();
				that.sending = false;
			} else if (readyState === 'connecting') {
				setTimeout(function() {
					that.__send();
				}, 0);
			} else {
				that.close();
			}
		}
	};

	Connector.prototype.__addCandidate = function(data) {
		this.pc && this.pc.addIceCandidate(new nativeRTCIceCandidate(data));
	}

	Connector.prototype.__sendOffer = function() {
		var that = this;
		var pc = that.pc;
		var socket = that.peertc.socket;

		function sendOffer() {
			var readyState = socket.readyState;
			if (readyState === 1) {
				pc.createOffer(function(session_desc) {
						pc.setLocalDescription(session_desc);
						socket.send(JSON.stringify({
							"event": "__offer",
							"data": {
								"sdp": session_desc,
								"to": that.to,
								"from": that.id
							}
						}));
					},
					function(error) {
						that.peertc.emit('error', error);
					});
			} else if (readyState === 0) {
				setTimeout(sendOffer, 0);
			}

		}
		setTimeout(sendOffer, 0);
	}

	Connector.prototype.__sendAnswer = function(data) {
		var sdp = data.sdp;
		var that = this;
		var pc = that.pc;
		pc.setRemoteDescription(new nativeRTCSessionDescription(sdp));
		pc.createAnswer(function(session_desc) {
			pc.setLocalDescription(session_desc);
			that.peertc.socket.send(JSON.stringify({
				"event": "__answer",
				"data": {
					"from": that.id,
					"to": that.to,
					"sdp": session_desc
				}
			}));
		}, function(error) {
			that.peertc.emit('error', error);
		});
	}

	Connector.prototype.__recieveAnswer = function(data) {
		this.pc.setRemoteDescription(new nativeRTCSessionDescription(data.sdp));
	}
	return Connector;
}());