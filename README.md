Peertc
===

##简介
Peertc用于在浏览器之间通过WebRTC建立点对点的通信，并提供文件传输和消息传输

##示例
使用如下命令启动demo服务器：
```
$ git clone git@github.com:LingyuCoder/peertc.git
$ npm install
$ node server.js
```
开启两个页面分别访问`http://localhost:2999`，并在注册框中填入不同的id，然后在一个页面的连接框中填入另外一个页面的id，点击“连接”后即可相互发送文件和消息

##使用
###注册
Peertc希望能够通过简单的语句来创建点对点的信道。首先需要向服务器进行注册：
```javascript
var peertc = Peertc('ws://localhost:2999', 'user1');
```
完成后，用户将以user1为id在服务器上注册，使用同样的方式注册user2。

###连接
通过简单的命令即可建立user1与user2之间的连接：
```javascript
//user1
var connector = peertc.connect('user2');
peertc.on('open', function(id){
    //连接建立后的逻辑
}).on('close', function(id){
    //连接关闭后的逻辑
});
```
通过connect建立连接会返回一个connector，用于发送文件和消息

###发送消息
####发送
peertc强调的是简单，所以发送消息使用如下命令即可：
```javascript
connector.send({
    data: 'hahahahahaha',
    type: 'laugh'
});
```
####链式发送
可以链式的发送消息：
```javascript
connector.send('Hello ').send('world');
```
####监听
通过在peertc上监听message事件即可监听所有到来的消息：
```javascript
peertc.on('message', function(data, from){
    //data为消息内容，from为发送者的id
});
```

###发送文件
####发送
发送文件与发送消息基本相同，不同的是传入的参数是一个file类型的input节点：
```javascript
connector.sendFile(dom1).sendFile(dom2);
```
####监听
文件发送会分片，所以提供了fileChunk和file两个事件来分别监听文件碎片和完整文件:
```javascript
peertc.on('fileChunk', function(data, from){
    //data: 碎片信息
    //  meta: 文件基本信息
    //      name: 文件名
    //      size: 文件大小
    //      type: 文件类型
    //  chunk: 碎片内容
    //  sum: 须传输的总大小
    //  sended: 已传输的大小
    //  id: 每一次传输的特有id

    //from: 发送者的id
}).on('file', function(meta, from){
    //meta: 同上meta
    //from: 发送者的id
});
```
**文件发送完成后会自动下载**

###错误处理
通过如下方式可以监听错误：
```javascript
peertc.on('error', function(err){
    //err为错误对象
});
```

##自动退化
在支持WebRTC DataChannel的浏览器（chrome，firefox，opera）中，使用DataChannel，否则将退化使用websocket替代。

##依赖
依赖peertc，已上传到npm上

##协议
MIT







