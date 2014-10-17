var Peertc = (function() {
	'use strict';
	var PeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
	var URL = (window.URL || window.webkitURL || window.mozURL || window.msURL || window.oURL);
	var nativeRTCIceCandidate = (window.mozRTCIceCandidate || window.RTCIceCandidate);
	var nativeRTCSessionDescription = (window.mozRTCSessionDescription || window.RTCSessionDescription); // order is very important: "RTCSessionDescription" defined in Nighly but useless
	var moz = navigator.appCodeName === "Mozilla";

	var DataChannelSupport = false;
	var WebSocketSupport = !!WebSocket;
	(function(){
		try {
			if(!PeerConnection) {
				DataChannelSupport = false;
			}
			var pc = new webkitRTCPeerConnection(null);
			if (pc && pc.createDataChannel) {
				DataChannelSupport = true;
			} else {
				DataChannelSupport = false;
			}
		} catch (e) {
			DataChannelSupport = false;
		}
	}());
	
	var noop = function() {};

	var iceServer = {
		"iceServers": [{
			"url": "stun:stun.l.google.com:19302"
		}]
	};
	var packetSize = 1000;

	function getRandomId() {
		return (Math.random() * new Date().getTime()).toString(36).toUpperCase().replace(/\./g, '-');;
	}

	function dataURItoBlob(dataURI, dataTYPE) {
		var binary = atob(dataURI.split(',')[1]),
			array = [];
		for (var i = 0; i < binary.length; i++) array.push(binary.charCodeAt(i));
		return new Blob([new Uint8Array(array)], {
			type: dataTYPE
		});
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
		that.meta = {
			name: file.name,
			size: file.size,
			type: file.type
		};
		that.chunks = [];
		that.sended = 0;
		that.id = getRandomId();
		that.sum;
	}

	FileSender.prototype.chunkify = function(callback) {
		var that = this;
		var file = that.file;
		var reader = new window.FileReader(file);
		reader.readAsDataURL(file);
		reader.onload = function(event, text) {
			var data = event.target.result;
			var chunks = that.chunks;
			that.sum = data.length;
			while (data.length) {
				var chunk;
				if (data.length > packetSize) {
					chunks.push(chunk = data.slice(0, packetSize));
				} else {
					chunks.push(chunk = data);
				}
				data = data.slice(chunk.length);
			}
			callback.call(that);
		};
	}

	FileSender.prototype.getChunk = function() {
		var chunk;
		if (this.chunks.length) {
			var chunk = this.chunks.shift();
			this.sended += chunk.length;
			return chunk;
		} else {
			return null;
		}
	};


	function FileReciever(id, meta, from) {
		if (!(this instanceof FileReciever)) {
			return new FileReciever(id, meta, from);
		}
		this.id = id;
		this.chunks = [];
		this.meta = meta;
		this.sended = 0;
	}

	FileReciever.prototype.addChunk = function(chunk) {
		this.chunks.push(chunk);
		return this;
	};

	FileReciever.prototype.download = function() {
		var that = this;
		var data = that.chunks.join('');
		var a = document.createElement("a");
		document.body.appendChild(a);
		a.style = "display: none";
		var blob = dataURItoBlob(data, 'octet/stream');
		var url = window.URL.createObjectURL(blob);
		a.href = url;
		a.download = that.meta.name;
		a.click();
		!moz && window.URL.revokeObjectURL(url);
		a.parentNode.removeChild(a);
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
				that.__parseMessage(json.data, that.to);
			} else if (json.type === 'file') {
				that.__parseFileChunk(json.data, that.to);
			}
		};

		channel.onclose = function(event) {
			that.close();
			that.peertc.emit('close', that.to);
		};

		channel.onerror = function(err) {
			console.log('error');
		};
	};

	Connector.prototype.__parseMessage = function(data, from) {
		this.peertc.emit('message', data, from);
	};

	Connector.prototype.__parseFileChunk = function(data, from) {
		var that = this;
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
		if (config.channel) {
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
			throw Error('No file needs to be send');
			return;
		}
		file = dom.files[0];
		var fileSender = new FileSender(file);
		fileSender.chunkify(function() {
			function send() {
				var chunk = fileSender.getChunk();
				if (chunk) {
					that.queue.push({
						type: 'file',
						data: {
							sum: fileSender.sum,
							sended: fileSender.sended,
							meta: fileSender.meta,
							id: fileSender.id,
							chunk: chunk
						}
					});
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

	Connector.prototype.close = function() {
		var that = this;
		that.sending = false;
		that.queue = [];
		if (that.channel && that.channel.readyState.toLowerCase() === 'connecting') {
			that.channel.close();
		}
		that.channel = null;
		if(that.pc.signalingState !== 'closed') {
			that.pc.close();
		}
		delete that.peertc.connectors[that.to];
	};

	function Peertc(server, id) {
		if (!(this instanceof Peertc)) {
			return new Peertc(server, id);
		}

		if(!WebSocketSupport) {
			this.emit('error', new Error('WebSocket is not supported, Please upgrade your browser!'));
		}
		if(!DataChannelSupport) {
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