var FileSender = (function() {
	var packetSize = 1000;

	function getRandomId() {
		return (Math.random() * new Date().getTime()).toString(36).toUpperCase().replace(/\./g, '-');;
	}

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

	return FileSender;
}());