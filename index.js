exports.NetCoonection = require("./lib/FxConnection");
exports.netConnection = exports.NetCoonection;

exports.StdoutStream = require('./FFmpegStream/FxOutdevs.js');
exports.stdoutStream = exports.StdoutStream;

exports.Parser = require('./lib/FxParser.js');
exports.parser = exports.Parser;

exports.Utilities = require('./lib/FxUtility.js');
exports.utilities = exports.Utilities;

exports.Logger = require('./lib/FxLogger.js');
exports.logger = exports.Logger;

exports.Daemon = require('./lib/FxDaemon.js');
exports.daemon = exports.Daemon;

exports.WSClient = require('./lib/FxWebSocketClient.js');
exports.wsClient = exports.WSClient;

exports.fxTCP = require('./lib/FxTCP.js');

exports.clusterConstructor = require('./lib/clusterConstructor.js');

// exports.cbConnect = require('./lib/cbConnect.js');
// exports.CBConnect = require('./lib/cbConnect.js');

exports.getConfig = require('./lib/Fxnconf.js').getConfig;
exports.getConfiguration = require('./lib/Fxnconf.js').getConfiguration;