var Connector = (function() {
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
			that.peertc.emit('error', err, that.to);
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
		if (that.pc.signalingState !== 'closed') {
			that.pc.close();
		}
		delete that.peertc.connectors[that.to];
	};
	return Connector;
}());