// Realtime Communication module for Gibber

module.exports = function( Server ) {

var Rtc = {
  rooms : {},
  users : {},
  usersByNick : {},
  wsLibServer : require('ws').Server,
  socket  : null,
  server: Server, 
  sendall : function( msg ) {
    for( var ip in Rtc.users ) {
      Rtc.users[ ip ].send( msg )
    }
  },
  heartbeat : function() {
    var time = Date.now()
    for( var room in Rtc.rooms ) {
      if( room !== 'Gibber' ) {
        !function() {
          var _room = Rtc.rooms[ room ],
              roomName = room
              
          if( time - _room.timestamp > 3000 && _room.clients.length === 0 ) {
            console.log( 'deleting room', roomName )
            delete Rtc.rooms[ roomName ]
            var msg = { msg:'roomDeleted', room:roomName }
            Rtc.sendall( JSON.stringify( msg ) )
          }
        }() 
      }
    }
    setTimeout( Rtc.heartbeat, 10000 ) 
  },
  sendToRoom : function( msg, roomName ) {
    if( roomName && msg ) {
      var room = Rtc.rooms[ roomName ]
      if( room ) {
        room.timestamp = Date.now()
        for( var i = 0; i < room.clients.length; i++ ){
          var client = room.clients[ i ]
          if( client ) {
            client.send( msg )
          }
        }
        return true
      }
    }
    return false
  },
  init : function() {
    Rtc.socket = new Rtc.wsLibServer({ server:Server })
    
    //Rtc.io.sockets.on( 'connection', function( client ) {
    Rtc.socket.on( 'connection', function( client ) {
      console.log( client.upgradeReq.headers.origin )
      client.ip = client.upgradeReq.headers.origin//client.handshake.address.address
      console.log( 'CONNECTION', client.ip )
      Rtc.users[ client.ip ] = client

      var msg = { connection: true }

      client.send( JSON.stringify( msg ) )

      client.on( 'message', function( _msg ) {
        var msg = JSON.parse( _msg )
        
        console.log( _msg, msg, client.TESTING )
        Rtc.handlers[ msg.cmd ]( client, msg )
      })
      
      client.TESTING = 123
      
      client.on( 'disconnect', function() {
        if( Rtc.rooms[ client.room ]  ) {
          var idx = Rtc.rooms[ client.room ].clients.indexOf( client )
          if( client.room ) {
            Rtc.rooms[ client.room ].clients.splice( idx , 1 )
            var notification = JSON.stringify( { msg:'departure', nick:client.nick } )
            Rtc.sendToRoom( notification, client.room )
          }
        }
        delete Rtc.users[ client.ip ]
      })
    })

    Rtc.rooms[ 'Gibber' ] = {
      clients : [],
      password: null
    }
    Rtc.heartbeat()    
  },
  handlers : {
    register : function( client, msg ) {
      client.nick = msg.nick
      
      Rtc.usersByNick[ client.nick ] = client
      
      console.log("REGISTERED", client.nick )

      var msg = { msg:'registered', nickRegistered: client.nick }

      client.send( JSON.stringify( msg ) )
    },
     
    joinRoom : function( client, msg ) {
      var response = null, occupants = []

      if( Rtc.rooms[ msg.room ] ) {
        if( Rtc.rooms[ msg.room ].password !== null ) {
          if( Rtc.rooms[ msg.room ].password === msg.password ) {
            client.room = msg.room

            for( var i = 0; i < Rtc.rooms[ msg.room ].clients.length; i++ ) {
              occupants.push( Rtc.rooms[ msg.room ].clients[ i ].nick )
            }
            if( Rtc.rooms[ msg.room ].clients.indexOf( client ) === -1 ) {
              Rtc.rooms[ msg.room ].clients.push( client )
            }
            response = { msg:'roomJoined', roomJoined: msg.room, occupants:occupants }

            notification = JSON.stringify( { msg:'arrival', nick:client.nick } )

            Rtc.sendToRoom( notification, msg.room )
          }else{
            response = { msg:'roomJoined', roomJoined:null, error:'ERROR: The password you submitted to join ' + msg.room + ' was incorrect.' }
          }
        }else{
          client.room = msg.room

          for( var i = 0; i < Rtc.rooms[ msg.room ].clients.length; i++ ) {
            occupants.push( Rtc.rooms[ msg.room ].clients[ i ].nick )
          }

          if( Rtc.rooms[ msg.room ].clients.indexOf( client ) === -1 ) {
            Rtc.rooms[ msg.room ].clients.push( client )
          }

          response = { msg:'roomJoined', roomJoined: msg.room, occupants:occupants }

          notification = JSON.stringify( { msg:'arrival', nick:client.nick } )

          Rtc.sendToRoom( notification, msg.room )
        }
      }else{
        response = { msg:'roomJoined', roomJoined: null, error:"ERROR: There is no room named " + msg.room + '.' }
      }

      client.send( JSON.stringify( response ) )
    },

    leaveRoom : function( client, msg ) {
      var response = null, notification

      if( Rtc.rooms[ msg.room ] ) {
        var idx = Rtc.rooms[ msg.room ].clients.indexOf( client )

        if( idx > -1 ) {
          Rtc.rooms[ msg.room ].clients.splice( idx, 1 )

          response = { msg:'roomLeft', roomLeft: msg.room }
          
          notification = JSON.stringify( { msg:'departure', nick:client.nick } )

          Rtc.sendToRoom( notification, msg.room )
        }else{
          response = { msg:'roomLeft', roomLeft: null, error:'ERROR: The server tried to remove you from a room you weren\'t in' }
        }
      }else{
        response = { msg:'roomLeft', roomLeft: null, error:'ERROR: The server tried to remove you from a room that doesn\'t exist.' }
      }

      client.send( JSON.stringify( response ) )
    },
    
    message : function( client, msg ) {
      var room = Rtc.rooms[ client.room ], result = false, response = null, _msg = null
      
      console.log("CLIENT NICK", client.nick)
      _msg = JSON.stringify({ msg:'incomingMessage', incomingMessage:msg.text, nick:msg.user }) 
       
      result = Rtc.sendToRoom( _msg, client.room )

      if( result ) {
        response = { msg:'messageSent', messageSent: msg.text, nick:client.nick }
      }else{
        response = { msg:'messageSent', messageSent:null, error:'ERROR: You tried to send a message without joining a chat room!' }
      }

      client.send( JSON.stringify( response ) )
    },
    collaborationRequest: function( client, msg ) {
      var from = msg.from, 
          to = msg.to,
          room = Rtc.rooms[ client.room ]

      for( var i = 0; i < room.clients.length; i++ ){
        var _client = room.clients[ i ]
        if( _client.nick === to ) {
          _client.send( JSON.stringify( { msg:'collaborationRequest', from:client.nick, enableRemoteExecution:msg.enableRemoteExecution } ) )
          break;
        }
      }
    },
    collaborationResponse: function( client, msg ) {
      var to = msg.to, room = Rtc.rooms[ client.room ]

      for( var i = 0; i < room.clients.length; i++ ){
        var _client = room.clients[ i ]
        if( _client.nick === to ) {
          _client.send( JSON.stringify({ msg:'collaborationResponse', from:client.nick, response:msg.response }) )
          break;
        }
      } 
    },
    shareCreated: function( client, msg ) {
      // GE.Share.openDoc( msg.shareName )
      var to = msg.to, room = Rtc.rooms[ client.room ]
      for( var i = 0; i < room.clients.length; i++ ){
        var _client = room.clients[ i ]
        if( _client.nick === to ) {
          _client.send( JSON.stringify({ msg:'shareReady', from:client.nick, shareName:msg.shareName }) )
          break;
        }
      } 
    },
    createRoom : function( client, msg ) {
      var response = null, room = null, success = false

      if( typeof Rtc.rooms[ msg.name ] === 'undefined' ) {
        Rtc.rooms[ msg.name ] = {
          clients : [],
          password: msg.password || null,
          timestamp: Date.now()
        }
        success = true
        response = { msg:'roomCreated', roomCreated: msg.room } 
      }else{
        response = { msg:'roomCreated', roomCreated: null, error:'ERROR: A room with that name already exists' }
      }

      client.send( JSON.stringify( response ) )
      
      if( success ) {
        var msg = { msg:'roomAdded', roomAdded:msg.room }
        Rtc.sendall( JSON.stringify( msg ) )
      }
    },

    listRooms : function( client, msg ) {
      var response = {}
      for( var key in Rtc.rooms ) {
        response[ key ]  = { 
          password: Rtc.rooms[ key ].password !== null,
          userCount : Rtc.rooms[ key ].clients.length
        }
      }

      client.send( JSON.stringify({ msg:'listRooms', rooms:response }) )
    },

    logout : function( client, msg ) {
      var response = null,
          idx = Rtc.rooms[ client.room ].clients.indexOf( client )

      if( idx > -1 ) {

      }
    },

    listUsers : function( client, msg ) {
      var reponse = null, _users = []
      for( var key in Rtc.users ) {
        _users.push( Rtc.users[ key ].nick )
      }

      response = { msg:'listUsers', users:_users }

      client.send( JSON.stringify( response ) )
    },

    remoteExecution : function( client, msg ) {
      var to = Rtc.usersByNick[ msg.to ],
          _msg = {
            from: msg.from,
            selectionRange : msg.selectionRange,
            code: msg.code,
            msg: 'remoteExecution',
            shareName:msg.shareName
          }
      
      to.send( JSON.stringify( _msg ) )
    },
  }
}

return Rtc
}