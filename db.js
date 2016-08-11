var mysql = require('mysql');
var fs = require('fs');
var moment = require('moment');
var pool  = mysql.createPool({
    host     : 'localhost',
    user     : 'xxxxx',
    password : 'xxxxx',
    database : 'xxxxx'
});
var sqlCount = 0;
var shutdown = false;
var wOption = {
        flags: 'a+',
        encoding: null,
        mode: 0666
    };
var fileWriteStream = fs.createWriteStream('./log/db.log',wOption);
exports.execSQL = function(sql,params){
    sqlCount ++;
    pool.getConnection(function(err, client) {
        if (!!err) {
            console.error('[sqlqueryErr] '+err.stack);
	   fileWriteStream.write('\n\r'+sql); 
	    fileWriteStream.write('\n\r'+moment().format('YYMMDDHHmmss')+'\n\r[sqlqueryErr] '+err.stack);
            return;
        }
        if(params == undefined){
	    //console.log(sql);
            client.query(sql, function(err, res) {
		sqlCount --;
		//console.log("inn");
                pool.releaseConnection(client);
                if (!!err) {
                    console.error('[sqlqueryErr] '+err.stack);
		    fileWriteStream.write('\n\r'+sql);
		    fileWriteStream.write('\n\r'+moment().format('YYMMDDHHmmss')+'\n\r[sqlqueryErr] '+err.stack);
                    return;
                }

                //sqlCount --;
                if(shutdown == true && sqlCount == 0)
                    pool.end();
            });
        }else{
	    //console.log(sql);
            client.query(sql,params, function(err, res) {
		sqlCount --;
		//console.log("inn");
                pool.releaseConnection(client);
                if (!!err) {
                    console.error('[sqlqueryErr] '+err.stack);
		    fileWriteStream.write('\n\r'+sql);
		    fileWriteStream.write('\n\r'+moment().format('YYMMDDHHmmss')+'\n\r[sqlqueryErr] '+err.stack);
                    return;
                }

                //sqlCount --;
                if(shutdown == true && sqlCount == 0)
                    pool.end();
            });
        }
    });
}

exports.execQuery = function(sql,callBack){
    sqlCount ++;
    pool.getConnection(function(err, client){
        if (!!err) {
            console.error('[sqlqueryErr] '+err.stack);
	    fileWriteStream.write('\n\r'+sql);
	    fileWriteStream.write('\n\r'+moment().format('YYMMDDHHmmss')+'\n\r[sqlqueryErr] '+err.stack);
            return;
        }

        //获取所有待处理的任务
        client.query(sql,function(err,rows,fields){
            sqlCount --;
            if(!!err){
                console.error('[sqlqueryErr] '+err.stack);
		fileWriteStream.write('\n\r'+sql);
		fileWriteStream.write('\n\r'+moment().format('YYMMDDHHmmss')+'\n\r[sqlqueryErr] '+err.stack);
            }
            pool.releaseConnection(client);
            callBack(rows,fields);
            if(shutdown == true && sqlCount == 0)
                pool.end();
        });
    });
}

exports.close = function(){
    if(sqlCount == 0)
        pool.end();
    else
        shutdown = true;
}
