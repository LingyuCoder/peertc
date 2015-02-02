var Connector = (function() {
	'use strict';
	var PeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
	var nativeRTCIceCandidate = (window.mozRTCIceCandidate || window.RTCIceCandidate);
	var nativeRTCSessionDescription = (window.mozRTCSessionDescription || window.RTCSessionDescription); // order is very important: "RTCSessionDescription" defined in Nighly but useless
	var getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
	var URL = (window.URL || window.webkitURL || window.mozURL || window.msURL || window.oURL);
	var iceServer = {
		"iceServers": [{
			"url": "stun:stun.l.google.com:19302"
		}]
	};
	var localMediaStream;

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
		this.streaming = false;
	}

	function attachStream(stream) {
		return function(dom) {
			if (typeof dom === 'string') {
				dom = document.querySelector(dom);
			}
			if (navigator.mozGetUserMedia) {
				dom.mozSrcObject = stream;
			} else {
				dom.src = URL.createObjectURL(stream);
			}
			dom.play();
		};
	}

	Connector.prototype.__initDataChannel = function(channel) {
		var that = this;
		that.channel = channel;

		channel.onmessage = function(message) {
			var json = JSON.parse(message.data);
			if (json.type === 'message') {
				that.__parseMessage(json.data);
			} else if (json.type === 'file') {
				that.__parseFileChunk(json.data);
			} else if (json.type === 'offer') {
				that.__parseOffer(json.data);
			} else if (json.type === 'answer') {
				that.__parseAnswer(json.data);
			}
		};

		channel.onclose = function(event) {
			that.peertc.emit('close', that.to);
			delete that.peertc.connectors[that.to];
		};

		channel.onerror = function(err) {
			that.peertc.emit('error', err, that.to);
			delete that.peertc.connectors[that.to];
		};
	};

	Connector.prototype.__recieveOfferFromDataChannel = function(data) {
		var that = this;
		var pc = that.pc;
		pc.setRemoteDescription(new nativeRTCSessionDescription(data.sdp));
	}

	Connector.prototype.__revieveAnswerFromDataChannel = function(data) {
		this.pc.setRemoteDescription(new nativeRTCSessionDescription(data.sdp));
	};

	Connector.prototype.__sendAnswerByDataChannel = function() {
		var that = this;
		var pc = that.pc;
		pc.createAnswer(function(session_desc) {
			pc.setLocalDescription(session_desc);
			that.queue.push({
				type: 'answer',
				data: {
					sdp: session_desc
				}
			});
			that.__startSend();
		}, function(error) {
			that.peertc.emit('error', error);
		});
	};

	Connector.prototype.__sendOfferByDataChannel = function(options) {
		var that = this;
		var pc = that.pc;
		pc.createOffer(function(session_desc) {
				pc.setLocalDescription(session_desc);
				that.queue.push({
					"type": "offer",
					"data": {
						sdp: session_desc,
						options: options
					}
				});
				that.__startSend();
			},
			function(error) {
				that.peertc.emit('error', error);
			});
	};

	Connector.prototype.__parseOffer = function(data) {
		var that = this;
		var pc = that.pc;

		that.__recieveOfferFromDataChannel(data);
		if (data.options) {
			that.__createLocalStream(data.options, function(stream) {
				pc.addStream(stream);
				that.streaming = true;
				that.__sendAnswerByDataChannel();
			});
		} else {
			pc.removeStream(localMediaStream);
			that.streaming = false;
			that.peertc.emit('removeStream', that.to);
			that.__sendAnswerByDataChannel();
		}
	};

	Connector.prototype.__parseAnswer = function(data) {
		this.__revieveAnswerFromDataChannel(data);
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
			that.peertc.emit('file', fileReciever.meta, from, data.id);
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
						"candidate": evt.candidate,
						"from": id,
						"to": to
					}
				}));
			}
		};

		pc.ondatachannel = function(evt) {
			that.__initDataChannel(evt.channel);
			that.peertc.emit('open', that.to);
		};

		pc.onaddstream = function(evt) {
			var stream = evt.stream;
			if (stream.label === 'default') {
				return;
			}
			stream.attachTo = attachStream(stream);
			that.peertc.emit('stream', stream, that.to);
		};

		/*pc.onremovestream = function(evt) {
			if (that.streaming) {
				that.pc.removeStream(localMediaStream);
				that.streaming = false;
				that.peertc.emit('removeStream', that.to);
			}
		};*/

		if (config.isOpenner) {
			var channel = pc.createDataChannel(to);
			channel.onopen = function() {
				that.peertc.emit('open', that.to);
			};
			that.__initDataChannel(channel);
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
				that.__startSend();
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
		that.__startSend();
		return that;
	};

	Connector.prototype.__startSend = function() {
		var that = this;
		if (!that.sending) {
			setTimeout(function() {
				that.__send();
			}, 0);
		}
	}

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
		var pc = this.pc;
		try {
			pc.addIceCandidate(new nativeRTCIceCandidate(data.candidate));
		} catch (error) {

		}
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

	Connector.prototype.addStream = function(opts) {

		var that = this;
		opts = opts || {};
		var options = {
			video: !!opts.video,
			audio: !!opts.audio
		};

		that.__createLocalStream(options, function(stream) {
			var pc = that.pc;
			pc.addStream(stream);
			that.streaming = true;
			that.__sendOfferByDataChannel(options);
		});
		return that;
	};

	Connector.prototype.removeStream = function() {
		var that = this;
		var pc = that.pc;
		pc.removeStream(localMediaStream);
		that.streaming = false;
		that.peertc.emit('removeStream', that.to);
		that.__sendOfferByDataChannel();
	};

	Connector.prototype.__createLocalStream = function(options, callback) {
		var that = this;
		if (!localMediaStream) {
			getUserMedia.call(navigator, options, function(stream) {
					localMediaStream = stream;
					localMediaStream.attachTo = attachStream(localMediaStream);
					that.peertc.emit('localStream', localMediaStream);
					callback.call(that, localMediaStream);
				},
				function(error) {
					that.peertc.emit("error", error);
				});
		} else {
			setTimeout(function() {
				callback.call(that, localMediaStream);
			}, 0);
		}
	};
	return Connector;
}());