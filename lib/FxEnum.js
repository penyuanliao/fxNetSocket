/**
 * Created by Benson.Liao on 16/1/20.
 */


function FxEnum() {
};

// 連線狀態 //
const fxStatus = {
    "http":         "http",
    "websocket":    "ws",
    "flashSocket":  "flashsocket",
    "socket":       "socket"
};
// 子程序分流規則 //
const balanceOpt = {
    "roundrobin": 0,
    "url_param" : 1,
    "leastconn" : 2
};

module.exports = {fxStatus:fxStatus, balanceOption:balanceOpt};

