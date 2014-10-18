var SocketConnector = (function() {
	function recieveCb(connector) {
		return function(message) {
			var json = message;
			if (json.type === 'message') {
				connector.__parseMessage(json.data, connector.to);
			} else if (json.type === 'file') {
				connector.__parseFileChunk(json.data, connector.to);
			}
		};
	}

	function Connector(config) {
		if (!(this instanceof Connector)) {
			return new Connector(config);
		}
		this.id = config.id;
		this.to = config.to;
		this.peertc = config.peertc;
		this.queue = [];
		this.sending = false;
		this.fileSenders = {};
		this.fileRecievers = {};
		this.channel = peertc.socket;
		this.__init(config);
	}

	Connector.prototype.__init = function(config) {
		var that = this;
		that.recieveCb = recieveCb(that);
		that.peertc.on('_socket', that.recieveCb);
		if (!config.isOpenner) {
			setTimeout(function(){
				that.peertc.emit('open', that.to);
			}, 0);
		}
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
		return that;
	};

	Connector.prototype.close = function() {
		var that = this;
		var to = that.to;
		that.sending = false;
		that.queue = [];
		that.channel = null;
		that.peertc.off(that.recieveCb);
		delete that.peertc.connectors[to];
		that.peertc.emit('close', to);
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
			var readyState = channel.readyState;
			if (readyState === 1) {
				data.from = that.id;
				data.to = that.to;
				channel.send(JSON.stringify({
					event: '__socket',
					data: data
				}));
				queue.shift();
				that.sending = false;
			} else if (readyState === 0) {
				setTimeout(function() {
					that.__send();
				}, 0);
			} else {
				that.close();
			}
		}
	};

	Connector.prototype.__sendOffer = function() {
		var that = this;
		var pc = that.pc;
		var socket = that.peertc.socket;

		function sendOffer() {
			var readyState = socket.readyState;
			if (readyState === 1) {
				socket.send(JSON.stringify({
					"event": "__offer",
					"data": {
						"to": that.to,
						"from": that.id
					}
				}));
			} else if (readyState === 0) {
				setTimeout(sendOffer, 0);
			}
		}
		setTimeout(sendOffer, 0);
	}

	Connector.prototype.__sendAnswer = function() {
		var that = this;
		var pc = that.pc;
		var socket = that.peertc.socket;

		function sendAnswer() {
			var readyState = socket.readyState;
			if (readyState === 1) {
				socket.send(JSON.stringify({
					"event": "__answer",
					"data": {
						"to": that.to,
						"from": that.id
					}
				}));
			} else if (readyState === 0) {
				setTimeout(sendAnswer, 0);
			}
		}
		setTimeout(sendAnswer, 0);
	}

	Connector.prototype.__recieveAnswer = function() {
		this.peertc.emit('open', this.to);
	}
	return Connector;
}());