# Node.JS Server & ffmpeg Streaming



### Server example

```js
var netConnection = require('fxNetSocket').netConnection;

var srv = new netConnection(8000, {runListen:true});

srv.on('Listening', function(app){});

srv.on('connection', function (client) {
    
    client.on('message', function (data) {
        console.log('received: %s', event.data);
    });
    
    client.on('disconnect', function (name) { });
    
    client.write('1. something');

});

srv.on('message', function (event) {
    console.log('client: %s', event.client.name);
    console.log('received: %s', event.data);

    event.client.write('2. something');
    
});

srv.on('disconnect', function (name) { });

srv.on('httpUpgrade', function (req, client, head) {

    console.log('## HTTP upgrade ##');
    
    client.close();
});

```

### Daemon example
```js


```
