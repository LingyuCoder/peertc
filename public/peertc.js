var Peertc = (function() {
	'use stricy';
	var PeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
	var URL = (window.URL || window.webkitURL || window.msURL || window.oURL);
	var getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
	var nativeRTCIceCandidate = (window.mozRTCIceCandidate || window.RTCIceCandidate);
	var nativeRTCSessionDescription = (window.mozRTCSessionDescription || window.RTCSessionDescription); // order is very important: "RTCSessionDescription" defined in Nighly but useless
	var moz = !!navigator.mozGetUserMedia;
	var noop = function() {};

	var iceServer = {
		"iceServers": [{
			"url": "stun:stun.l.google.com:19302"
		}]
	};
	var packetSize = 1000;

	var gid = 0;

	function getGid() {
		return ++gid;
	}

	function EventEmitter() {
		this.events = {};
	}
	//绑定事件函数
	EventEmitter.prototype.on = function(eventName, callback) {
		this.events[eventName] = this.events[eventName] || [];
		this.events[eventName].push(callback);
		return this;
	};
	//触发事件函数
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


	function FileSender(file) {
		var that = this;
		that.file = file;
		that.chunks = [];
		that.sended = 0;
		that.state = 'preparing';
	}

	FileSender.prototype.chunkify = function(callback) {
		var that = this;
		var file = that.file;
		var reader = new window.FileReader(file);
		reader.readAsDataURL(file);
		reader.onload = function(event, text) {
			var data = event.target.result;
			var chunks = that.chunks;
			while (data.length) {
				var chunk;
				if (data.length > packetSize) {
					chunks.push(chunk = data.slice(0, packetSize));
				} else {
					chunks.push(chunk = data);
				}
				data = data.slice(chunk.length);
			}
			callback();
		};
	}

	FileSender.prototype.getChunk = function() {
		if (this.chunks.length) {
			return this.chunks.shift();
		} else {
			return null;
		}
	};


	function Connector(config) {
		if (!(this instanceof Connector)) {
			return new Connector(config);
		}
		this.pc = config.pc;
		this.id = config.id;
		this.to = config.to;
		this.peertc = config.peertc;
		this.__init(config);
		this.queue = [];
		this.sending = false;
		this.fileSenders = {};
	}

	Connector.prototype.__initDataChannel = function(channel) {
		var that = this;
		that.channel = channel;
		channel.onmessage = function(message) {
			var json = JSON.parse(message.data);
			json = JSON.parse(json);
			if (json.type === 'message') {
				that.__parseMessage(json.data, that.to);
			} else if (json.type === 'file') {
				that.__parseFileChunk(json.data);
			}
		};

		channel.onclose = function(event) {
			console.log('close');
		};

		channel.onerror = function(err) {
			console.log('error');
		};
	};

	Connector.prototype.__parseMessage = function(data, from) {
		this.peertc.emit('message', data, from);
	};

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
		if (config.channel) {
			that.__initDataChannel(pc.createDataChannel(to));
		}
	};

	Connector.prototype.sendFile = function(dom) {
		var that = this,
			file,
			reader,
			fileToSend,
			sendId;
		if (typeof dom === 'string') {
			dom = document.getElementById(dom);
		}
		if (!dom.files || !dom.files[0]) {
			throw Error('No file needs to be send');
			return;
		}
		file = dom.files[0];
		var fileSender = new FileSender(file);
		fileSender.chunkify(function() {
			function send() {
				var chunk = fileSender.getChunk();
				if (chunk) {
					that.queue.push(JSON.stringify({
						type: 'message',
						data: chunk
					}));
					if (!that.sending) {
						setTimeout(function() {
							that.__send();
						}, 0);
					}
					setTimeout(send, 0);
				}
			}
			setTimeout(send, 0);
		});
	};

	Connector.prototype.send = function(data) {
		var that = this;
		that.queue.push(JSON.stringify({
			type: 'message',
			data: data
		}));
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
		if (channel.readyState.toLowerCase() === 'open') {
			channel.send(JSON.stringify(data));
			queue.shift();
			that.sending = false;
		} else if (channel.readyState.toLowerCase() === 'connecting') {
			setTimeout(function() {
				that.__send();
			}, 0);
		}
	};

	Connector.prototype.close = function() {
		that.sending = false;
		that.queue = [];
		that.pc.close();
	};

	function Peertc(server, id) {
		if (!(this instanceof Peertc)) {
			return new Peertc(server, id);
		}
		this.id = id;
		this.socket = new WebSocket(server);
		this.connectors = {};
		this.messageCb = noop;
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
			console.log('inited');
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