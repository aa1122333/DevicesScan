
//nodejs实现堡垒机
var net = require('net');
var crypto = require('crypto');
var db = require('./db.js');
var spawn = require('child_process').spawn;
var fs = require('fs');
var moment = require('moment');
var exec = require('child_process').exec;
var clientList= [];
var cmdList = [];
var cmdType = [];
var inUse= [];
function cleanInput(data) {
    return data.toString().replace(/(\r\n|\n|\r)/g,"");
}

function format()
{
    var args = arguments;
    return args[0].replace(/\{(\d+)\}/g,function(m,i){return args[i]; });
}

for(var i = 0;i<200;i++){
    inUse[i] = 0;
}
function checkLoginName(socket,client){

    var md5=crypto.createHash('md5');
    md5.update(client.passWord);
    var pw=md5.digest('hex').toUpperCase();
    console.log("user");
    db.execQuery('SELECT LOGINNAME  FROM ORGMODEL_USERINFO WHERE LOGINNAME="'+client.userName+'" AND PASSWORD="'+pw+'"',function(rows){
        if(rows.length>0){
            //client.status=2;
            var session = client.sessionId + client.deviceNum;
            db.execSQL('UPDATE TELNET_SESSION SET LOGIN_NAME="'+client.userName+'" WHERE SESSION_ID = "'+client.sessionId+'"');
            socket.write("[INFO]  :Login successfull!\n\r");
            socket.write('\n\r\n\r');
	    static_telnet(client);
	    //var session = client.sessionId + client.deviceNum;
            client.status=4;
            db.execSQL('UPDATE TELNET_SESSION SET DEVICE_IP=\'202.98.0.111\' WHERE SESSION_ID = "'+client.sessionId+'"');
            //socket.write("[INFO]  :Please input the device's IP address.\n\r");
            //socket.write('\n\r');
            //socket.write('[INFO]  :If you want to QUIT,Please input  [quit] \n\r');
            //socket.write('[INFO]  :Please input [IP] input command \n\r');
            //socket.write('\n\r');
            //socket.write('>>>>Input Device IP:');
        }else{
            client.status=0;
            socket.write("[ERR]  :The user name or password is invalid \n\r\n\r");
            socket.write(">>>>Enter your userName: ");
        }
    });

}

function receiveData(socket,client,data) {
        console.log(client.clientIP+"/status:"+client.status);
        var re = new RegExp(/^([0,1]?\d{0,2}|2[0-4]\d|25[0-5])\.([0,1]?\d{0,2}|2[0-4]\d|25[0-5])\.([0,1]?\d{0,2}|2[0-4]\d|25[0-5])\.([0,1]?\d{0,2}|2[0-4]\d|25[0-5])$/);
        var isip = 0;
        data = cleanInput(data);
        //if(re.test(data)){
         ///   client.deviceIp = data;
         //   isip = 1;
        //}
        //data = data.toString();
    switch(client.status){
        case 0:{
            client.userName = cleanInput(data);
            socket.write('>>>>Enter Password: ');
            client.status=1;
                    break;
            }
            case 1:{
            client.passWord = cleanInput(data);
            checkLoginName(socket,client);
            break;

            }
            case 2:{
            /*data = cleanInput(data);
            var session = client.sessionId + client.deviceNum;
            if(data.indexOf('quit') == 0){
                closeSocket(socket,client);
                socket.destroy();
            }else if(isip == 1){
                    getDeviceInfo(socket,client);
            }else if(isip == 0){
                client.status=2;
                    socket.write('\n\r[ERR]Wrong IP \n\r');
                    socket.write('\n\r');
                    socket.write('[INFO]  :If you want to quit,Please input  [quit] \n\r');
                    socket.write('[INFO]  :Please input [IP] input command \n\r');
                    socket.write('\n\r');
                    socket.write('>>>>Input Device IP:');
            }else{
                client.status=2;
                socket.write("[INFO]  :Please input the device's IP address.\n\r");
                socket.write('\n\r');
                socket.write('[INFO]  :If you want to QUIT,Please input  [quit] \n\r');
                socket.write('[INFO]  :Please input [IP] input command \n\r');
                socket.write('\n\r');
                socket.write('>>>>Input Device IP:');
            }*/
                break;
        }
            case 3:{
                    client.status=4;
            break;
            }
            case 4:{
                var writecmd = 0;
		/*var allSpace = 1;
		for(var t = 0;t<data.length;t++){
		    if(data[t]!=' '){
			allSpace = 0;
			break;
		    }
		}
		console.log(data+" "+data.length);	
                if(data =='\n'||data == '\r'||data == '\n\r'||data == ' '||data ==''){
                    writecmd = 1;
		    allSpace = 0;
                }
		if(allSpace == 1){
		    writecmd = 1;
		    data = ' ';
		}*/
		if(client.notChange == 0)
		    data = data.toLowerCase();
		else client.notChange = 0;
                for (var i = 0;i<cmdList.length;i++){
                    if((data==cmdList[i] && cmdType[i] == 0)||(data.indexOf(cmdList[i])==0&&cmdType[i] == 1)) {
                        writecmd = 1;
                        break;
                    }
                }
                if(writecmd == 0){
		    data=cleanInput(data);
		    if(data != '')
		        client.telnet.write(data+'\r');
                    var session = client.sessionId+(client.deviceNum-1);
		    //data.replace(/\'/g,"\\\'");
		    //data.replace(/\"/g,"\\\"");
                    db.execSQL(format('INSERT INTO TELNET_CMD_LOG (SESSION_ID,CMD,CMD_ID,SEND_TIME) VALUES ("{1}","{2}",{3},now())',client.sessionId,cleanInput(data),++client.cmdId));
                }else{
                    socket.write('[ERR]  :You CAN NOT Use this command!\n\r');
                    socket.write('[ERR]  :Please type another command!\n\r');
                }
                break;
            }
            case 5:{
                data = cleanInput(data);
                            client.status=0;
                        socket.write('>>>>Enter Username: ');
                    break;
            }
            case 6:{
                    break;
            }
    }
}
function getDeviceInfo(socket,client){
    db.execQuery('SELECT FACTORY_NAME,DEVICE_CLASS FROM DEVICE WHERE IP="'+client.deviceIp+'"',function(rows){
        if(rows.length>0){
            var session = client.sessionId + client.deviceNum;
            client.status=4;
            if(client.deviceNum == 0){
                db.execSQL('UPDATE TELNET_SESSION SET DEVICE_IP="'+client.deviceIp+'" WHERE SESSION_ID = "'+session+'"');
                client.deviceNum++;
            }else {
                db.execSQL(format('INSERT INTO TELNET_SESSION(SESSION_ID,CLIENT_IP,CLIENT_PORT,DEVICE_IP) VALUES("{1}","{2}",{3},"{4}")',session,client.clientIP,client.clientPort,client.deviceIp));
                db.execSQL('UPDATE TELNET_SESSION SET LOGIN_NAME="'+client.userName+'" WHERE SESSION_ID = "'+session+'"');
                client.flag = 0;
                client.deviceNum++;
                client.datas = '';
                console.log(client.deviceIp+":another IP");
            }
            client.factory_name= rows[0]['FACTORY_NAME'];
            client.device_type=rows[0]['DEVICE_CLASS'];
            if(client.factory_name == '..' && client.device_type == 'OLT')
                OLT_telnet(client);
            else startTelnet(client);
        }else{
            client.status=2;
            socket.write('[ERR]  :You want to access the device does not exist!\n\r\n\r');
            socket.write("[INFO]  :Please input the device's IP address.\n\r");
            socket.write('[INFO]  :If you want to QUIT,Please input  [quit] \n\r\n\r');
            socket.write('[INFO]  :Please input [IP] input command \n\r');
            socket.write('>>>>Input Device IP:');
        }
    });
}
function static_telnet(client){
     var wOption = {
        flags: 'w',
        encoding: null,
         mode: 0666
        };
            //var fileWriteStream = fs.createWriteStream('./log/_202.98.0.111' + moment().format('_YYMMDD_HHmm') +'.log',wOption);
            var worker = spawn('telnet', ['202.98.0.111']);
            client.telnet = worker.stdin;
            worker.on('close', function (code) {
                client.fileWriteStream.end();
                //client.status = 2;
                client.socket.write('\n\r');
                client.socket.write('[Common]');
                client.socket.write('[INFO]  :Connection to Device has closed!\n\r');
                //client.socket.write('>>>>Input Device IP:');
                closeSocket(client.socket,client);
		client.socket.destroy();
            });
            worker.stdout.on('data', function (data) {
                data = data.toString();
                if(client.status == 3){
                    return;
                }
                if((data.indexOf('nms login')>=0)&&(client.isLogin==0)){
                    client.secret = 1;
                    client.telnet.write('xtjczx\n');
                }else if((data.indexOf('Password')>=0)&&(client.isLogin==0)){
                    client.telnet.write('xtjc1234\n');
                    client.isLogin = 1;
                }else if(data.indexOf('Password')>=0&& client.status == 4){
		    client.notChange = 1;
		    client.fileWriteStream.write(data);
                    client.socket.write(data);
                    client.datas = client.datas+data.toString();
		}else {
                    client.fileWriteStream.write(data);
                    client.socket.write(data);
                    client.datas = client.datas+data.toString();
                }
            });
            worker.on('error',function(error){
		
                client.fileWriteStream.end();
                client.status = 2;
                client.socket.write('[ERR2]  :An error occured!')
                client.socket.write('[INFO]  :Connection to Device has closed!\n\r');
                //client.socket.write('>>>>Input Device IP:');
                closeSocket(client.socket,client);
            });

}
/*function startTelnet(client){
    var wOption = {
        flags: 'w',
        encoding: null,
         mode: 0666
        };
            //var fileWriteStream = fs.createWriteStream('./log/_'+client.deviceIp + moment().format('_YYMMDD_HHmm') +'.log',wOption);
            var worker = spawn('telnet', [client.deviceIp]);

            worker.on('close', function (code) {
                client.fileWriteStream.end();
                //client.status = 2;
                client.socket.write('\n\r');
                client.socket.write('[Common]\n\r');
                client.socket.write('[INFO]  :Connection to Device has closed!\n\r');
                //client.socket.write('>>>>Input Device IP:');
                closeSocket(client.socket,client);
		process.exit(0);
            });
            worker.stdout.on('data', function (data) {
                if(client.status == 3){
                    return;
                }
                client.fileWriteStream.write(data);
                client.socket.write(data);
		data.toString().replace(/\'/g,"");
                data.replace(/\"/g,"");
                client.datas = client.datas+data;
            });
            worker.on('error',function(error){
                fileWriteStream.end();
                client.status = 2;
                client.socket.write('[ERR2]  :An error occured!\n\r')
                client.socket.write('[INFO]  :Connection to Device has closed!\n\r');
                client.socket.write('>>>>Input Device IP:');
                closeSocket(client.socket,client);
            });
            client.telnet = worker.stdin;
}
function loginDevice(data,client){

}*/
function closeSocket(socket,client) {
    if(client.deviceNum == 0) var session = client.sessionId+client.deviceNum;
    else var session = client.sessionId+(client.deviceNum-1);
    db.execSQL('UPDATE TELNET_SESSION SET END_TIME=now()  WHERE SESSION_ID = "'+client.sessionId+'"');
    //var session = client.sessionId+(client.deviceNum-1);
    db.execQuery('SELECT SESSION_ID FROM TELNET_SESSION_LOG WHERE SESSION_ID="'+client.sessionId+'"',function(rows){
        if(rows.length==0){
	    //client.datas.replace(/"([^"]*)"/g, "'$1'");
            client.datas=client.datas.toString().replace(/\"/g,"\\\"");
	    client.datas=client.datas.toString().replace(/\'/g,"\\\'");
	    //console.log('INSERT INTO TELNET_SESSION_LOG (SESSION_ID,LOG) VALUES ("'+client.sessionId+'","'+client.datas+'")');
            db.execSQL('INSERT INTO TELNET_SESSION_LOG (SESSION_ID,LOG) VALUES ("'+client.sessionId+'","'+client.datas+'")');
        }
    });
    if(client.position != -1){
        inUse[client.position] = 0;
        clientList[client.position] = '';
    }
}

var saveSession =function (client){
    var session = client.sessionId+client.deviceNum;
    var sql =format('INSERT INTO TELNET_SESSION(SESSION_ID,CLIENT_IP,CLIENT_PORT) VALUES("{1}","{2}",{3})',client.sessionId,client.clientIP,client.clientPort);
    db.execSQL(sql);
}

function newSocket(socket) {
    socket.write('=====================Welcome to the Telnet server!=======================\n\r');
    socket.write('*******[WARNING]DO NOT USE CTRL+C!USER CTRL+] TO ESCAPE!*******\n\r');
    var client = {socket:socket,telnet:null,userName:'',passWord:'',deviceIp:'',factory_name:'',device_type:'',clientIP:'',clientPort:'',sessionId:'',cmdId:0,status:5,flag:0,deviceNum:0,datas:'',position:-1,secret:0,isLogin:0,fileWriteStream: null,specialIP:0,notChange:0};
    client.clientIP = socket.remoteAddress;
    client.clientPort = socket.remotePort;;
    var originalString="0123456789qwertyuioplkjhgfdsazxcvbnm";
    var tmp="";
    for(var i=0;i<14;i++)
    {
        var stringLength = Math.random()*originalString.length;
        tmp += originalString.charAt(Math.ceil(stringLength)%originalString.length);
    }
    var wOption = {
        flags: 'w',
        encoding: null,
        mode: 0666
    };
    client.fileWriteStream = fs.createWriteStream('./log/tel_'+client.clientIP+'_'+moment().format('YYMMDDHHmmss') +'.log',wOption);
    client.sessionId = tmp + moment().format('_YYMMDD_HHmm');
    client.fileWriteStream.write(moment().format('YYYY-MM-DD HH:mm:ss') + ' -- Connected FROM: ' + client.clientIP + 'sessionId:' + client.sessionId );
    var full=1;
    for(var i=0;i<200;i++)
    {
        if(inUse[i]==0) {
            client.position = i;
            inUse[i] = 1;
            full = 0;
            break;
        }
    }
    if(full == 1) {
        socket.write('[ERR4]Connection pool is full!\n\r');
	client.fileWriteStream.write(client.clientIP + ':[ERR4]Connection pool is full!');
        closeSocket(socket,client);
        socket.destroy();
    }
    db.execQuery('SELECT * FROM TELNET_CMD_WHITELIST WHERE SERVER_IP = \'222.163.28.13\'',function(rows){
        for(var i = 0; i<rows.length ; i++){
            cmdList[i] = rows[i]['CMD'];
            cmdType[i] = rows[i]['FILTER_TYPE'];
        }
    });
    saveSession(client);
    console.log(client.sessionId);
    clientList[client.position]=client;
    socket.on('data', function(data) {
	client.fileWriteStream.write(data);
        receiveData(socket,client,data);
    })
    socket.on('end', function() {
        closeSocket(socket,client);
        socket.destroy();
    })
    socket.setTimeout(360000,function(){
        if(socket!=null){
            socket.write('[ERR2]Connection timed out!');
	    client.fileWriteStream.write(client.clientIP + ':[ERR2]Connection timed out!');
            console.log(client.clientIP+':[ERR2]Connection timed out!');
            closeSocket(socket,client);
            socket.destroy();
        }
    });
    socket.on('error',function(event){
	client.fileWriteStream.write(event.toString());
    });
}


var server = net.createServer(newSocket);
console.log('====Server Start!====');
server.listen(23);

