if(process.argv.length < 3){
    console.log('Usage: node [appname].js [IP]');
    return;
};

var lol=0;
var IP = process.argv[2];
var ip = IP;
var PORT = 23;
var MAX_OLT_CONNECT = 3;
var db=require('./db');
var exchName = '';
var loginName = 'zte';
var loginPassword = 'zte';
var moment = require('moment');
var net = require('net');
var fs = require('fs');
var mysql = require('mysql');
var spawn = require('child_process').spawn;
var pool  = mysql.createPool({
    host     : 'localhost',
    user     : 'xxxxx',
    password : 'xxxxx',
    database : 'xxxxx'
});
var id=0;
var portCountStart = 0;
var sqlCount=0;
var shutdown=false;
var sid = 0;
var promptStr = '#';
var spList = {};
var boardList = [];
var ontList = [];
var step = 0;
var fn = [];
var ont = null;
var connected = 0;
var index = 0;
var fsp = '';
var holdLastLine = false;
var lastLine = '';
var threadCount = 0;
var failedIpList = {};
var oltCount = 0;
var portCounts = 0;
var sqlList = [];
var LOCAL = 0;
var zteLogin = 0;
var boardCount = 0;
var oltPortCount = 0;
var sid ;

function format()
{
    var args = arguments;
    return args[0].replace(/\{(\d+)\}/g,function(m,i){return args[i]; });
}
/*db.execQuery('SELECT * FROM DEVICE WHERE IP_PARENT ="'+IP+'" AND FACTORY_NAME=\'中兴\' ',function(rows){
    console.log(rows.length);
    if(rows.length>0){
        for(var i = 0;i<rows.length;i++){
            db.execSQL('DELETE FROM MAC_ADDRESS_LOG WHERE ID = "'+rows[i]['ID']+'"');
            //console.log(rows.length);
        }
    }else{
        console.log('DEVICE TABLE HAVE NO IP:'+IP+'\n');
        //client.destroy();
    }
});*/
db.execQuery('SELECT LOCAL_NET_ID,SID FROM DEVICE WHERE IP="'+IP+'"',function(rows){
      if(rows.length>0){
          LOCAL = rows[0]['LOCAL_NET_ID'];
	  sid = rows[0]['SID'];
      }else{
          console.log('表中没有此IP!');
          client.destroy();
	  db.close();
          process.exit(0);
      }
});
fn[0] = function(d){//第0步：用户登录，执行show run
    activePort = [];
    if(d.indexOf('Username:') >= 0 )
        client.write(loginName+'\n');//zte
    else if(d.indexOf('Password:') >= 0 ){
        client.write(loginPassword+'\n');
    }else if(d.indexOf('bad password') >= 0 ){
        if (zteLogin == 0){
            loginName = 'xtjczx';
	    loginPassword = 'xtjc1234';
            zteLogin = 1;
        }else if(zteLogin == 1){
            console.log('RESULT:{"IP":"'+ip+'","CODE":2,"TEXT":"用户名、密码错误"}');
            db.execSQL('UPDATE DEVICE SET CHECK_RESULT = 2,LAST_CHECK_TIME = NOW() WHERE IP="'+ip+'"');
            client.destroy();
        }
    }else if(d.indexOf('#') > 0 ){
        promptStr = d;
        client.write('show run\n');
        //var sql = 'DELETE FROM DEVICE_PORT WHERE OLT_IP ="'+IP+'"';
        var sql = 'DELETE FROM DEVICE WHERE IP_PARENT = "'+IP+'"'; 
        db.execSQL(sql);
        //sql = 'DELETE FROM MAC_ADDRESS_LOG WHERE '
        step=1;
        holdLastLine = true;
    }else if(d.indexOf('\>\>U')>=0){
        console.log('RESULT:{"IP":"'+ip+'","CODE":6,"TEXT":"设备类型错误"}');
        db.execSQL('UPDATE DEVICE SET CHECK_RESULT = 6,LAST_CHECK_TIME = NOW(),FACTORY_NAME = "华为" WHERE IP="'+ip+'"');
        client.destroy();
        process.exit(0);
    }else if(d.indexOf('BLM1500')>=0){
        console.log('RESULT:{"IP":"'+ip+'","CODE":6,"TEXT":"设备类型错误"}');
        db.execSQL('UPDATE DEVICE SET CHECK_RESULT = 6,LAST_CHECK_TIME = NOW(),FACTORY_NAME = "爱立信" WHERE IP="'+ip+'"');
        client.destroy();
        process.exit(0);
    }else if(d.indexOf('More') > 0 )
        client.write(' ');
     /*else if(d.indexOf('No username')>=0){
        console.log('RESULT:{"IP":"'+IP+'","CODE":2,"TEXT":"用户名、密码错误"}');
        db.execSQL('UPDATE DEVICE SET CHECK_RESULT = 2,LAST_CHECK_TIME = NOW() WHERE IP="'+IP+'"');
        client.destroy();
    */else if(d.indexOf('product  of ZTE')>=0){
         db.execSQL('UPDATE DEVICE SET DEVICE_TYPE="C300" WHERE IP="'+IP+'"');
    }else if(d.indexOf('C200')>=0){
         db.execSQL('UPDATE DEVICE SET DEVICE_TYPE="C200" WHERE IP="'+IP+'"');
    }else if(d.indexOf('C220')>=0){
         db.execSQL('UPDATE DEVICE SET DEVICE_TYPE="C220" WHERE IP="'+IP+'"');
    }else if(d.indexOf('C300')>=0){
         db.execSQL('UPDATE DEVICE SET DEVICE_TYPE="C300" WHERE IP="'+IP+'"');
    }
};
fn[1] = function(d){//第1步：获取ONT信息存入ontList
    if(d.indexOf(promptStr) >= 0 ){
	client.write('show card\r');
        step = 3;
    }else if(d.indexOf('interface epon-olt_')>=0){//获取F/S/P
        d = d.substring(d.indexOf('interface epon-olt_'));
        fsp = d.replace('interface epon-olt_','');
    }else if(d.indexOf('interface gpon-olt_')>=0){//获取F/S/P
        d = d.substring(d.indexOf('interface gpon-olt_'));
        fsp = d.replace('interface gpon-olt_','');
    }
    else if(d.indexOf('sn ZTE')>=0){
        d=d.substring(d.indexOf('onu')).trim();
        var data = d.split(' ');
        ont = {'F_S_P' : fsp,'ID': data[1],'TYPE':data[3].substring(4),'MAC':null,'BOARD_COUNT':0,'PORT_COUNT':0,'MARK':null};
        if(ont['TYPE'].indexOf('F411') >= 0|| ont['TYPE'].indexOf('F420') >= 0 || ont['TYPE'].indexOf('F612') >= 0||ont['TYPE'].indexOf('D420') >= 0)
            ont['SUB_TYPE'] = 'ONT';
        else if(ont['TYPE'].indexOf('F822') >= 0|| ont['TYPE'].indexOf('F820') >= 0 || ont['TYPE'].indexOf('F803') >= 0 || ont['TYPE'].indexOf('9806') >= 0||ont['TYPE'].indexOf('F401') >= 0)
            ont['SUB_TYPE'] = 'ONU';
        ontList.push(ont);
        //console.log(ont);
    }else if(d.indexOf('ip-cfg static')>0){
        d = d.substring(d.indexOf('onu'));
        var data = d.split(' ');
        data[5]=data[5].replace(/\./g,"");
        ont = {'F_S_P' : fsp,'ID': data[1],'TYPE':data[3].substring(4),'MAC':data[5],'BOARD_COUNT':0,'PORT_COUNT':0,'MARK':null};
	if(ont['TYPE'].indexOf('F411') >= 0|| ont['TYPE'].indexOf('F420') >= 0 || ont['TYPE'].indexOf('F612') >= 0||ont['TYPE'].indexOf('D420') >= 0)
	    ont['SUB_TYPE'] = 'ONT';
	else if(ont['TYPE'].indexOf('F822') >= 0|| ont['TYPE'].indexOf('F820') >= 0 || ont['TYPE'].indexOf('F803') >= 0 || ont['TYPE'].indexOf('9806') >= 0||ont['TYPE'].indexOf('F401') >= 0)
	    ont['SUB_TYPE'] = 'ONU';
        ontList.push(ont);
    }else if(d.indexOf('auto-cfg')>0){
        d = d.substring(d.indexOf('onu'));
        var data = d.split(' ');
        data[5]=data[5].replace(/\./g,"");
        ont = {'F_S_P' : fsp,'ID': data[1],'TYPE':data[3].substring(4),'MAC':data[5],'BOARD_COUNT':0,'PORT_COUNT':0,'MARK':null};
        if(ont['TYPE'].indexOf('F411') >= 0|| ont['TYPE'].indexOf('F420') >= 0 || ont['TYPE'].indexOf('F612') >= 0||ont['TYPE'].indexOf('D420') >= 0)
            ont['SUB_TYPE'] = 'ONT';
        else if(ont['TYPE'].indexOf('F822') >= 0|| ont['TYPE'].indexOf('F820') >= 0 || ont['TYPE'].indexOf('F803') >= 0 || ont['TYPE'].indexOf('9806') >= 0||ont['TYPE'].indexOf('F401') >= 0)
            ont['SUB_TYPE'] = 'ONU';
        ontList.push(ont);
    }else if(d.indexOf('type ZTE-F612 loid')>0||d.indexOf('type ZTE-F617 loid')>0){
        d = d.substring(d.indexOf('onu'));
        var data = d.split(' ');
        ont = {'F_S_P' : fsp,'ID': data[1],'TYPE':data[3].substring(4),'MAC':null,'BOARD_COUNT':0,'PORT_COUNT':0,'MARK':null};
        if(ont['TYPE'].indexOf('F411') >= 0|| ont['TYPE'].indexOf('F420') >= 0 || ont['TYPE'].indexOf('F612') >= 0||ont['TYPE'].indexOf('D420') >= 0)
            ont['SUB_TYPE'] = 'ONT';
        else if(ont['TYPE'].indexOf('F822') >= 0|| ont['TYPE'].indexOf('F820') >= 0 || ont['TYPE'].indexOf('F803') >= 0 || ont['TYPE'].indexOf('9806') >= 0||ont['TYPE'].indexOf('F401') >= 0)
            ont['SUB_TYPE'] = 'ONU';
        ontList.push(ont);
        //console.log(ont);
    }else if(d.indexOf('After interface -- show run on RP start') > 0){
        index = 0;
        fsp = 0;
        portCountStart = 1;
    }else if(d.indexOf('pon-onu-mng epon-onu_')>=0){
        d = d.substring(d.indexOf('pon-onu-mng epon-onu_'));
        d = d.replace('pon-onu-mng epon-onu_','');
        var tmp = d.split(':');
        fsp = tmp[0];
        index = tmp[1];
        portCounts = 0;
    }else if(d.indexOf('pon-onu-mng gpon-onu_')>=0){
        d = d.substring(d.indexOf('pon-onu-mng gpon-onu_'));
        d = d.replace('pon-onu-mng gpon-onu_','');
        var tmp = d.split(':');
        fsp = tmp[0];
        index = tmp[1];
        portCounts = 0;
    }else if(d.indexOf('mgmt-ip') >= 0){//管理IP
        d = d.substring(d.indexOf('mgmt-ip')).trim();
        ontList.forEach(function(o){
                if(o['F_S_P'] == fsp && o['ID'] == index){
                    o['IP'] = d.split(' ')[1];
                    o['MARK'] = 'mgmt-ip';
                    if(o['IP'] == 'onu-ip')
                        o['IP'] = d.split(' ')[2];
					ont = o;
                    //ont['PORT_COUNT'] = 0;
                }
        });
    }/*else if(d.indexOf('voip-ip mode') >= 0){//语音模板
        d = d.substring(d.indexOf('voip-ip mode')).trim();
        ontList.forEach(function(o){
                if(o['F_S_P'] == fsp && o['ID'] == index){
                    o['IP'] = d.split(' ')[6];
                    if(o['IP'] == 'onu-ip')
                        o['IP'] = d.split(' ')[2];
                    ont = o;
                    //ont['PORT_COUNT'] = 0;
                }
        });
    }*/else if(d.indexOf('voip ip-address') >= 0){//语音IP
        d = d.substring(d.indexOf('voip ip-address')).trim();
        ontList.forEach(function(o){
                if(o['F_S_P'] == fsp && o['ID'] == index){
                    o['IP'] = d.split(' ')[2];
                    o['MARK'] = 'voip ip-address';
					ont = o;
                    //ont['PORT_COUNT'] = 0;
                }
        });
	
    }else if(d.indexOf('vlan port')>=0){
        var d = d.substring(d.indexOf('vlan port'));
        var data = d.split(' ');
        var eth  = data[2];
        var vlan = data[6];
        portCounts++;
        ontList.forEach(function(o){
                if(o['F_S_P'] == fsp && o['ID'] == index){
                    o['PORT_COUNT'] ++;
                }
        });
        //if(ont['VLAN'] == undefined)
        //    ont['VLAN'] = {};
        //if(ont['VLAN'][data[6]] == undefined)
        //    ont['VLAN'][data[6]] = [];
        //ont['VLAN'][data[6]].push({'INDEX':ont['VLAN'][data[6]].length,'F_S_P':data[2].split('_')[1]});
        //ont['PORT_COUNT'] = portCounts;
        //console.log(ont['PORT_COUNT']);
        //console.log(ont);
    }
}
fn[3] = function(d){
    if(d.indexOf('ETG')>=0 ||d.indexOf('GTG')>=0){
	boardCount ++;
	oltPortCount +=8;
    }else if(d.indexOf('EPFC')>=0){
	boardCount ++;
        oltPortCount +=4;
    }else if(d.indexOf('ETXD')>=0){
	boardCount ++;
	oltPortCount +=2;
    }else if(d.indexOf(promptStr)>=0){
	var sql = format('UPDATE DEVICE SET BOARD_COUNT = "{1}",PORT_COUNT = "{2}" WHERE IP="{3}"',boardCount,oltPortCount,IP);
	console.log(sql);
	db.execSQL(sql);
	step = 5;
	client.write('\r');
    }
}
fn[5] = function(d){//第5步：退出登录,保存数据
    if(d.indexOf(promptStr) >= 0){
        //client.write('exit\n');
	//console.log('this is a exit !');
        //ontList.forEach(function(o){
         //   saveData(o);
       // });
        console.log('RESULT:{"IP":"'+IP+'","CODE":0,"TEXT":"扫描结束"}');
        db.execSQL('UPDATE DEVICE SET CHECK_RESULT = 0,LAST_CHECK_TIME = NOW() WHERE IP="'+IP+'"');
        for(var i=0;i<ontList.length;i++){
            saveData(ontList[i]);
	    //console.log(ontList[i]);
           // for(var j=0;j<1000000;j++) ;
        }
        //console.log(sqlList.length);
        //for(var i=0;i<sqlList.length;i++){
        //    console.log(sqlList[i]);
        //    db.execSQL(sqlList[i]);
        //}
         //for(var j=0;j<10000000;j++) ;
         client.write('exit\n');
	//console.log('RESULT:{"IP":"'+IP+'","CODE":0,"TEXT":"扫描结束"}');
        //db.execSQL('UPDATE DEVICE SET CHECK_RESULT = 0,LAST_CHECK_TIME = NOW() WHERE IP="'+IP+'"');
        client.destroy();
    }
    /*else if(d.indexOf('#')>=0){
        client.write('exit\n');
		console.log('RESULT:{"IP":"'+IP+'","CODE":0,"TEXT":"扫描结束2"}');
        db.execSQL('UPDATE DEVICE SET CHECK_RESULT = 0,LAST_CHECK_TIME = NOW() WHERE IP="'+IP+'"');
        client.destroy();
    }*/
    else if(d.indexOf('More') > 0 || d.indexOf('ore--')>=0)
        client.write(' ');
}
fn[6] = function(d){
    
}
var sqlCount = 0;

var saveData = function(data){//将数据存入数据库
    var check = format('SELECT * FROM DEVICE WHERE ONT_ID="{1}" AND IP="{2}" AND IP_PARENT="{3}" AND F_S_P="{4}"',data['ID'],data['IP'],IP,data['F_S_P']);
    db.execQuery(check,function(rows){
        if(rows.length>0){
            var sql = format('UPDATE DEVICE SET LOCAL_NET_ID={1},REMARK ="{2}"  WHERE  ID={3}',LOCAL,data['MARK'],rows[0]['ID']);
            //console.log(sql);
            db.execSQL(sql);
            //var sql = format('UPDATE DEVICE SET BOARD_COUNT="{1}" AND PORT_COUNT = "{2}" AND CHECK_RESULT=0 AND LAST_CHECK_TIME=NOW() WHERE  ONT_ID="{3}" AND IP="{4}" AND IP_PARENT="{5}" AND F_S_P="{6}"',data['BOARD_COUNT'],data['PORT_COUNT'],data['ID'],data['IP'],IP,data['F_S_P']);
            //console.log(sql);
            //db.execSQL(sql);
            //for(var i = 0;i<100000000;i++);
            //var sql2 = format('INSERT INTO DEVICE_PORT (ID,OLT_IP,IP,LAST_CHECK_TIME,LAST_CHECK_STS) VALUES ("{1}","{2}","{3}",now(),"0")',rows[0]['ID'],IP,data['IP']);
            //console.log(sql2);
            //db.execSQL(sql2);
            //if(data['MAC']!=null){
              //  var sql3 = format('INSERT INTO MAC_ADDRESS_LOG (ID,IP_ADDR_NAME,MAC_ADDRESS,PORT_NAME,CHECK_DATE,CHECK_TIME,CHECK_TIMESTAMP,LOCAL_NET_ID) VALUES ("{1}","{2}","{3}","{4}",TO_CHAR(NOW(),"YYYY-MM-DD"),NOW(),NOW(),{5})',rows[0]['ID'],data['IP'],data['MAC'],data['F_S_P'],rows[0]['LOCAL_NET_ID']);
                //console.log(sql3);
                //db.execSQL(sql3);
                //var sql2 = format('INSERT INTO DEVICE_PORT (ID,OLT_IP,IP,PORT_NAME,LAST_CHECK_TIME,LAST_CHECK_STS,MAC_ADDRESS) VALUES ("{1}","{2}","{3}","{4}",now(),"0","{5}")',rows[0]['ID'],IP,data['IP'],data['F_S_P'],data['MAC']);
                //console.log(sql2);
                //db.execSQL(sql2);
            //}else {
              //  var sql2 = format('INSERT INTO DEVICE_PORT (ID,OLT_IP,IP,PORT_NAME,LAST_CHECK_TIME,LAST_CHECK_STS,MAC_ADDRESS) VALUES ("{1}","{2}","{3}","{4}",now(),"0","{5}")',rows[0]['ID'],IP,data['IP'],data['F_S_P'],null);
                //console.log(sql2);
                //db.execSQL(sql2);
            //}
            //console.log("portcount:"+Math.ceil(data['PORT_COUNT']/8));
            //var sql = format('UPDATE DEVICE SET BOARD_COUNT="{1}" AND PORT_COUNT = "{2}" AND CHECK_RESULT=0 AND LAST_CHECK_TIME=NOW() WHERE  ID="{3}"',Math.ceil(data['PORT_COUNT']/8),data['PORT_COUNT'],rows[0]['ID']);
            //console.log(sql);
            //db.execSQL(sql);
        }else {
            var sql = format('INSERT INTO DEVICE (DEVICE_CLASS,FACTORY_NAME,DEVICE_TYPE,F_S_P,ONT_ID,IP,IP_PARENT,DEVICE_MAC_ADDRESS,CHECK_RESULT,LAST_CHECK_TIME,LOCAL_NET_ID,REMARK) VALUES ("{1}","{2}","{3}","{4}","{5}","{6}","{7}","{8}",0,NOW(),{9},"{10}")',data['SUB_TYPE'],'中兴',data['TYPE'],data['F_S_P'],data['ID'],data['IP'],IP,data['MAC'],LOCAL,data['MARK']);
            console.log(sql);
            db.execSQL(sql);
            //db.execQuery(check,function(rows){
              //  sql = format('INSERT INTO DEVICE_PORT (ID,OLT_IP,IP,LAST_CHECK_TIME,LAST_CHECK_STS) VALUES ("{1}","{2}","{3}",now(),"0")',rows[0]['ID'],IP,data['IP']);
                //console.log(sql);
                //db.execSQL(sql);
                //if(data['MAC']!=null){
                  //  sql = format('INSERT INTO MAC_ADDRESS_LOG (ID,IP_ADDR_NAME,MAC_ADDRESS,PORT_NAME,CHECK_DATE,CHECK_TIME,CHECK_TIMESTAMP,LOCAL_NET_ID) VALUES ("{1}","{2}","{3}","{4}",TO_CHAR(NOW(),"YYYY-MM-DD"),NOW(),NOW(),{5})',rows[0]['ID'],data['IP'],data['MAC'],data['F_S_P'],rows[0]['LOCAL_NET_ID']);
                    //console.log(sql);
                    //db.execSQL(sql);
               // }
            //});
        }
    });
    
    //var sql = format('INSERT INTO DEVICE (DEVICE_CLASS,FACTORY_NAME,DEVICE_TYPE,F_S_P,ONT_ID,IP,IP_PARENT,DEVICE_MAC_ADDRESS) VALUES ("{1}","{2}","{3}","{4}","{5}","{6}","{7}","{8}")',data['SUB_TYPE'],'中兴',data['TYPE'],data['F_S_P'],data['ID'],data['IP'],IP,data['MAC']);
	//console.log(sql);
    //db.execSQL(sql);
};
var tl = false;
var telnet_con = function(){
    console.log('%%start%%');
    var buf = new Buffer(3);
    buf[0] = 255;
    buf[1] = 251;
    buf[2] = 31;
    client.write(buf);
    var buf2 = new Buffer(9);
    buf2[0] = 255;
    buf2[1] = 250;
    buf2[2] = 31;
    buf2[3] = 52;
    buf2[4] = 52;
    buf2[5] = 52;
    buf2[6] = 52;
    buf2[7] = 255;
    buf2[8] = 240;
    client.write(buf2);
    console.log('%stop%');
}
var client;
function startConnect(){
    client = new net.Socket();
    var wOption = {
        flags: 'w',
        encoding: null,
        mode: 0666
    };
    var fileWriteStream = fs.createWriteStream('./log/olt_'+IP+'.log',wOption);
    client.connect(PORT, IP, function() {
        connected = 1;
        fileWriteStream.write(moment().format('YYYY-MM-DD HH:mm:ss') + ' -- Connected TO: ' + IP);
    });
    client.setTimeout(5000,function(){
        console.log('RESULT:{"IP":"'+IP+'","CODE":1,"TEXT":"连接超时"}');
        db.execSQL('UPDATE DEVICE SET CHECK_RESULT = 1,LAST_CHECK_TIME = NOW() WHERE IP="'+IP+'"');
	db.close();
        client.destroy();
	//db.close();
    });
    client.on('error',function(event){
        console.log('出现错误%s',event.toString());
    });
    client.on('data', function(data) {
	if(tl == false ){
            telnet_con();
       	    tl = true;
        }
        fileWriteStream.write(data);
        var lines = data.toString().split('\n');
        if(holdLastLine == true){
            lines[0] = lastLine + lines[0];
            lastLine = lines.pop();
        }
        console.log(lines);
        console.log("=="+step);
        lines.forEach(function(d){
            if(d.indexOf('More') > 0 ){
                client.write(' ');
            }else
                fn[step](d.trim());
        });
        if(lastLine.indexOf('More') > 0 ){
            client.write(' ');
            lastLine = '';
        }else if((lastLine.indexOf(promptStr) >=0) && (holdLastLine == true)){
            //fn[step](lastLine);
	    holdLastLine = false;
	    client.write('\r');
	}
        //else if(lastLine.indexOf('#')>=0)
        //    fn[step](lastLine);
    }); 
    client.on('close', function() {
        console.log('Connection closed %d,%d',threadCount,sqlCount);
        if(threadCount == 0 && sqlCount == 0)
            pool.end();
        db.close();
        connected = false;
        process.stdin.end();
        fileWriteStream.end();
    });
}
var sqlCount = 0;


/*pool.getConnection(function(err, client) {
    if (!!err) {
        console.error('[sqlqueryErr] '+err.stack);
        return;
    }
   // client.query('DELETE FROM DEVICE WHERE IP_PARENT = "'+IP+'"');
    client.query('SELECT EXCH_NAME FROM DEVICE WHERE IP_ADDR_NAME="' + IP +'"',function(err,rows,fields){
        if(!err && rows.length > 0){
            exchName = rows[0]['EXCH_NAME'];
        }
        client.query('SELECT MAX(ID) ID FROM DEVICE', function(err, rows, fields) {
            if(!err && rows.length > 0){
               sid = rows[0]['ID'];
            }
            pool.releaseConnection(client);
        });
    });
});*/
startConnect();
