var FileReciever = (function() {
	'use strict';
	var URL = (window.URL || window.webkitURL || window.mozURL || window.msURL || window.oURL);
	var moz = navigator.appCodeName === "Mozilla";

	function dataURItoBlob(dataURI, dataTYPE) {
		var binary = atob(dataURI.split(',')[1]),
			array = [];
		for (var i = 0; i < binary.length; i++) array.push(binary.charCodeAt(i));
		return new Blob([new Uint8Array(array)], {
			type: dataTYPE
		});
	}

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

	return FileReciever;
}());