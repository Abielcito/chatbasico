var express = require('express');
var app = express();

//crear servidor con la libreria http de node utilizando express
var server = require('http').Server(app);

//a socket le pasamos el servidor creado con express
var io = require('socket.io')(server);

//app.use(express.static('public'));

//LIBRERIA MOMENT
var moment = require('moment');

// CONEXION MYSQL 
var mysql = require('mysql');

var connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'namedatabase',
  charset : 'utf8mb4'
});

connection.connect(function(err) {
	if (err) throw err;
});

//FIN CONEXION MYSQL


var MESSAGES = [];
var USERS = {};


//LISTENER DE SOCKET AL ENCONTRAR UNA CONEXION, EMITIRA UN MENSAJE
io.on('connection', function(socket) {

    //PRIMER EMIT CON NOMBRE 'getDataToken' QUE RECIBIRA CON UN CALLBACK, EL TOKEN.
    //ENVIARA ESTE CALLBACK A LA FUNCION 'obtenerDatosPorToken' PARA OBTENER LOS USUARIOS MOBILE
    //PERTENENCIENTES A LA EMPRESA Y LOS EMITIRA POR 'users_mobile_belongs_to_company'
    socket.emit('getDataToken', [], function(error, data){
    	var name = data.username;

    	if (data.is_admin){

    		var sql = 
    		`SELECT
    			um.id,um.company_id, um.username, um.folder_id
				, um.name, um.last_name, um.phone
				, um.color 
				, MAX(rc.created_at) created_at
				,(
					select c.text 
					from route.chat AS c 
			        where c.user_mobile_id=um.id and c.created_at=MAX(rc.created_at) limit 1
				) text_chat
				,(
					select COUNT(c.id) 
					from route.chat AS c
			        
					where c.user_mobile_id=um.id and c.viewed_at is null
				) no_leidos

			FROM
				route.user_mobile AS um
			INNER JOIN route.token_tokens ON um.company_id=route.token_tokens.company_id
			LEFT JOIN route.chat AS rc ON um.id=rc.user_mobile_id
			WHERE 
				route.token_tokens.token = '${data.token}' AND um.allow_chat = 1
			GROUP BY 
				um.id,um.company_id, um.username, um.folder_id, um.name,
				um.last_name, um.phone, um.color;`;

			connection.query(sql, function(err, results) {
		        if (err) throw err;

		        if (results.length > 0){

			    	socket.is_admin = true;
				    socket.nickname = name;

					socket.join('admin_' + results[0].company_id);

				    USERS[socket.nickname] = socket;		   	
			        console.log('Un administrador se ha conectado: ' + name);

			        setTimeout(function(){
				    	USERS[name].emit('users_mobile_belongs_to_company', results);
				    }, 100);
			    }

		    });
	    }else{

	    	var sql = `SELECT * FROM route.chat WHERE user_mobile_id = ${data.user_mobile_id};`;

	    	connection.query(sql, function(err, results) {
		        if (err) throw err;

		    	socket.is_admin = false;
	    		socket.nickname = name;

			    USERS[socket.nickname] = socket;
	    		console.log('Un usuario se ha conectado: ' + name);

		        setTimeout(function(){
			    	USERS[name].emit('messages_belongs_to_users_mobile', results);
			    }, 100);

		    });

	    }
	});

    //LISTENER DE NEW-MESSAGE
	socket.on('new-message', function(data) {
		//MESSAGES.push(data);
		var msg = data.text.trim();
		var name = data.username;
		var timeNow = moment().format('YYYY-MM-DD HH:mm:ss');
		var mensaje = strip_html_tags(data.text);

		if( data.user_id == null ){
			//BUSCAR LOS SOCKETS QUE SEAN 
			console.log("ESTE ES UN MENSAJE DESDE UN MOBILE");

			var sql = "INSERT INTO route.chat (company_id, user_mobile_id, text, author, created_at) VALUES ('"+data.company_id+"', '"+data.user_mobile_id+"', '"+mensaje+"', '"+data.author+"', '"+timeNow+"')";
			connection.query(sql, function (err, result) {
				if (err) throw err;
			});
			obtenerMensajes(data);
			//MENSAJE PRIVADO AL ADMIN
		}else{
			//PRIVADO AL USUARIO MOBILE
			var sql = "INSERT INTO route.chat (company_id, user_mobile_id, user_id, text, author, created_at, viewed_at) VALUES ('"+data.company_id+"', '"+data.user_mobile_id+"', '"+data.user_id+"', '"+mensaje+"', '"+data.author+"', '"+timeNow+"', '"+data.viewed_at+"')";
			connection.query(sql, function (err, result) {
				if (err) throw err;
			});

			//---------------------------------------------

			obtenerMensajes(data);
		}
	});


	//LISTENER DE MENSAJE OFFLINE
	socket.on('new-message-offline', function(data) {
		var timeNow = moment().format('YYYY-MM-DD HH:mm:ss');
		

		if (data != ""){
			var NUEVOARRRAY = data.split("|");

			var arregloTemporalChat = NUEVOARRRAY.map(function(item) {
				return JSON.parse(item);
			});

			for (i = 0; i < arregloTemporalChat.length; i++) {
				var mensaje = strip_html_tags(arregloTemporalChat[i].text);
				
				var sql = "INSERT INTO route.chat (company_id, user_mobile_id, text, author, created_at) VALUES ('"+arregloTemporalChat[i].company_id+"', '"+arregloTemporalChat[i].user_mobile_id+"', '"+mensaje+"', '"+arregloTemporalChat[i].author+"', '"+timeNow+"')";
				connection.query(sql, function (err, result) {
					if (err) throw err;
				});
			}

			var last_element = arregloTemporalChat[arregloTemporalChat.length - 1];
			obtenerMensajes(last_element);

		}


	});

	function obtenerMensajes(data){
		//console.log(data);
		var name = data.username;

		connection.query("SELECT * FROM route.chat WHERE user_mobile_id = '"+data.user_mobile_id+"' AND company_id = '"+data.company_id+"' ;", function(err, results) {
	       	if (err) throw err;

	       	MESSAGES = [];
	       	for (var i = 0; i < results.length; i++) {
	       		MESSAGES.push(results[i]);
	       	}

	       	setTimeout(function(){
	       		if (USERS[name] !== void 0){
					USERS[name].emit('messages_user', MESSAGES);
	       			io.to('admin_' + data.company_id).emit('messages_user', MESSAGES);
	       		}

	       	}, 100);
	    });
	    //----------------------------------------------------

	    var sql = 
			`SELECT
				um.id,um.company_id, um.username, um.folder_id
				, um.name, um.last_name, um.phone
				, um.color 
				, MAX(rc.created_at) created_at
				,(
					select c.text 
					from route.chat AS c 
				    where c.user_mobile_id=um.id and c.created_at=MAX(rc.created_at) limit 1
				) text_chat
				,(
					select COUNT(c.id) 
					from route.chat AS c
			        
					where c.user_mobile_id=um.id and c.viewed_at is null
				) no_leidos
			FROM 
				route.user_mobile AS um
			INNER JOIN route.token_tokens ON um.company_id=route.token_tokens.company_id
			LEFT JOIN route.chat AS rc ON um.id=rc.user_mobile_id
			WHERE 
				route.token_tokens.token = '${data.token}' AND um.allow_chat = 1
			GROUP BY 
				um.id,um.company_id, um.username, um.folder_id, um.name,
				um.last_name, um.phone, um.color;`;

			connection.query(sql, function(err, results) {
			    if (err) throw err;

			    setTimeout(function(){
			    	if (USERS[name] !== void 0){
				   		USERS[name].emit('users_mobile_belongs_to_company', results);
				   	}
				}, 100);
			});
	}

	function marcar_como_leidos(data){
		var name = data.username; //user_mobile_id
		var timeNow = moment().format('YYYY-MM-DD HH:mm:ss');

		connection.query("UPDATE route.chat SET viewed_at='"+timeNow+"' WHERE viewed_at is null and user_mobile_id='"+data.user_mobile_id+"';", function(err, results) {
	       	if (err) throw err;


	    });
	}

	function marcar_como_leidos_mobile(data){
		var name = data.username; //user_mobile_id
		var timeNow = moment().format('YYYY-MM-DD HH:mm:ss');

		connection.query("UPDATE route.chat SET viewed_at_mobile='"+timeNow+"' WHERE viewed_at_mobile is null and user_mobile_id='"+data.user_mobile_id+"';", function(err, results) {
	       	if (err) throw err;
	    });
	}


	socket.on('get_messages_user', function(data) {
		obtenerMensajes(data);
	});

	socket.on('marcar_como_leidos', function(data) {
		marcar_como_leidos(data);
	});

	socket.on('marcar_como_leidos_mobile', function(data) {
		marcar_como_leidos_mobile(data);
	});

	function strip_html_tags(str){
	   	if ((str===null) || (str===''))
	       return false;
	  	else
	   	str = str.toString();
	  	return str.replace(/<[^>]*>/g, '');
	}


	function updateNicknames() {
		console.log(Object.keys(USERS));
		io.sockets.emit('usernames', Object.keys(USERS) );
	}

	socket.on('disconnect', function(data) {
		if(!socket.nickname) return;
		//delete USERS[socket.nickname];
		updateNicknames();
	});

});

server.listen(5000, '0.0.0.0', function() {
	console.log('Servidor corriendo en ');
});