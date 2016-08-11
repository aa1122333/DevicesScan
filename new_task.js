if(process.argv.length < 4){
    console.log('Usage: node new_task.js [TASK_ID] [TASK_TYPE]');
    return;
};
var db = require('./db.js');
var spawn = require('child_process').spawn;
var taskId = process.argv[2];
var taskType = parseInt(process.argv[3]);
var sql = 'UPDATE QINQ_TASK SET STS = 2,STS_TIME =TO_CHAR(NOW(),"YYYY-MM-DD HH24:MI:SS") WHERE TASK_ID="'+taskId+'"';
db.execSQL(sql);

var MAX_THREAD_COUNT = 100;
var threadCount = 0;
var dataList = [];
var getThreadParams = function(data){} ;
/*
 * 循环执行任务
 */
var startLoop = function(){
    if(threadCount == MAX_THREAD_COUNT)
        return;
    if(dataList.length == 0){
        if(threadCount == 0){
            var sql = 'UPDATE QINQ_TASK SET STS = 3,STS_TIME =TO_CHAR(NOW(),"YYYY-MM-DD HH24:MI:SS") WHERE TASK_ID="'+taskId+'"';
            db.execSQL(sql);
            db.close();
        }
        return;
    }
    console.log("%s待处理数据量：%d",taskId,dataList.length);
    var data = dataList.shift();
    var params = getThreadParams(data);
    if(data['TASK_DATA'] != null)
        params.push(data['TASK_DATA']);
    var worker = spawn('node', params); 
    worker.on('close', function (code) {
        updateTaskSts(data['ID'],2);
        threadCount --;
        startLoop();
    });
    worker.stdout.on('data', function (d) {
        var d = d.toString();
        console.log('%s - %s',params[1],d);
        if(d.indexOf('RESULT:')>=0){
            d = d.substring(d.indexOf('RESULT'));
            try{
                var result = JSON.parse(d.substring(7));
                updateTaskResult(data['ID'],result['CODE'],result['TEXT']);
            }catch(e){
                console.log('JSON数据解析出错，命令为 node %s,错误信息：%s',JSON.stringify(params),d);
            }
        }
    });
    worker.on('error',function(error){
        console.log('thread error: ' + error.toString());
        threadCount --;
        startLoop();
    });
    threadCount ++;
    updateTaskSts(data['ID'],1);
    startLoop();
}

/*
 * 更新任务数据的状态
 */
var updateTaskSts = function(id,sts){
    var sql = 'UPDATE QINQ_TASK_DETAIL SET STS = '+sts+',STS_TIME =TO_CHAR(NOW(),"YYYY-MM-DD HH24:MI:SS") WHERE TASK_ID="'+taskId+'" AND ID ='+id;
    //console.log(sql);
    db.execSQL(sql);
    var sql = 'UPDATE DEVICE SET LAST_CHECK_TIME = TO_CHAR(NOW(),"YYYY-MM-DD HH24:MI:SS") WHERE ID = '+id;
    db.execSQL(sql);
}

/*
 * 更新处理结果
 */
var updateTaskResult = function(id,code,text){
    var sql = 'UPDATE QINQ_TASK_DETAIL SET RESULT_CODE = "'+code+'",RESULT_TEXT="'+text+'" WHERE TASK_ID="'+taskId+'" AND ID ='+id;
    db.execSQL(sql);
    if(taskType == 107 && code == 0){
        var sql = 'UPDATE DEVICE SET PITP_STATUS = 1 WHERE ID = '+id;
        db.execSQL(sql);
    }
}
//提取任务数据的SQL,可根据任务不同而修改
sql = 'SELECT A.ID,A.IP,B.FACTORY_NAME, B.DEVICE_TYPE,A.TASK_DATA FROM QINQ_TASK_DETAIL A,DEVICE B WHERE A.IP = B.IP AND STS = 0 AND A.TASK_ID="'+taskId +'"';
//console.log(sql);
switch(taskType){
    case 101:{//获取OLT下的所有设备信息，任务ID为101
        getThreadParams = function(d){
            //console.log(d);
            if(d['FACTORY_NAME'] == '华为')
                return ['ma5680t.js',d['IP']];
            else if(d['FACTORY_NAME'] == '中兴')
                return ['olt_zte.js',d['IP']];
	    else if(d['FACTORY_NAME'] == '爱立信')
                return ['_telnet_alx.js',d['IP']];
	    else if(d['FACTORY_NAME'] == '贝尔')
		return ['BeiEr_OLT.js',d['IP']];
        };
        break;
    }case 102:{//在OLT上扫描ONT设备的MAC地址
        getThreadParams = function(d){
	    if(d['FACTORY_NAME'] == '华为')
                return ['_mac_HW_update.js',d['IP']];
            else if(d['FACTORY_NAME'] == '中兴')
                return ['ont_mac_insert_zte.js',d['IP']];
        }; 
        break;
    }case 103:{//扫描OLT上的板卡型号以及板卡下在用端口数量
        getThreadParams = function(d){
             if(d['FACTORY_NAME'] == '华为')
                return ['k_mac_hw_only_disp.js',d['IP']];
            else if(d['FACTORY_NAME'] == '中兴')
                return ['ll_zte_mac_only_disp.js',d['IP']];
	     else if(d['FACTORY_NAME'] == '爱立信')
		return ['x_alx_mac_only_disp.js',d['IP']];
        };
        break;
    }case 104:{//登录到指定设备，获取SYSNAME，并存入DEVICE表
        getThreadParams = function(d){
            return ['get_sysname.js',d['IP']];
        };
        break;
    }case 105:{//登录到指定设备，设置SYSNAME
        sql = 'SELECT A.ID,A.IP,B.FACTORY_NAME,B.EXCH_CODE, B.DEVICE_TYPE FROM QINQ_TASK_DETAIL A,DEVICE B WHERE A.ID = B.ID AND STS = 0 AND A.TASK_ID="'+taskId +'"';
        getThreadParams = function(d){
            var sysname = d['EXCH_CODE']+'_'+d['DEVICE_TYPE']+'_'+d['IP'];
            return ['set_sysname.js',d['IP'],sysname];
        };
        break;
    }case 106:{//获取设备的VLAN信息，保存到DEVICE_VLAN表中
        getThreadParams = function(d){
            return ['get_vlan_info.js',d['IP']];
        };
        break;
    }case 107:{//打开PITP功能
        MAX_THREAD_COUNT = 100;
        getThreadParams = function(d){
            return ['set_pitp.js',d['IP']];
        };
        break;
    }case 108:{//扫描ONU端口信息
        //console.log(d['IP']);
        getThreadParams = function(d){
            //console.log(d['IP']);
            if(d['FACTORY_NAME'] == '华为')
                return ['onu_disp_hw.js',d['IP']];
            if(d['FACTORY_NAME'] == '中兴')
                return ['zte_only_exp9806_update_port.js',d['IP']];
        };
        break;
    }case 109:{//扫描MAC+端口信息
        getThreadParams = function(d){
            if(d['FACTORY_NAME'] == '华为')
                return ['HXR_onu_disp_hw_cp.js',d['IP']];
	    else if(d['FACTORY_NAME'] == '中兴')
                return ['zte_all_port.js',d['IP']];
	    else if(d['FACTORY_NAME'] == '爱立信')
                return ['_telnet_alx.js',d['IP']];
            /*else if(d['FACTORY_NAME'] == '中兴' && d['DEVICE_TYPE'] != '9806')
                return ['zte_mac_and_port_disp_exp9806.js',d['IP']];
            else if(d['FACTORY_NAME'] == '中兴' && d['DEVICE_TYPE'] == '9806')
                return ['zte_disp9806_mac_and_port.js',d['IP']];*/
        };
        break;
    }case 110:{//打开PITP功能
        getThreadParams = function(d){
            return ['set_onu_pitp.js',d['IP']];
        };
        break;
    }case 111:{//深度扫描中兴ONU/ONT端口
        getThreadParams = function(d){
            return ['zte_all_port.js',d['IP']];
        };
        break;
    }case 112:{//扫描华为SN码 ，注意少开线程
        getThreadParams = function(d){
            return ['get_sn.js',d['IP']];
        };
        break;
    }case 113:{//检查PITP是否正常开通
        MAX_THREAD_COUNT = 50;
        getThreadParams = function(d){
            return ['check_onu_pitp.js',d['IP']];
        };
        break;
    }case 201:{//为制定的eLT设备分配VLAN
        MAX_THREAD_COUNT = 1;
        getThreadParams = function(d){
            return ['config_vlan.js',d['IP']];
        };
        sql = sql + ' ORDER BY B.EXCH_CODE,REPLACE(B.SYSNAME,B.IP,\'1\')';
        break;
    }default:{
        console.log('无法识别的任务');
        return;
    }
}

//开始获取任务数据，执行sql
db.execQuery(sql,function(rows){
    console.log('本次任务共涉及%d个设备',rows.length);
    dataList = rows;
    startLoop();
});
