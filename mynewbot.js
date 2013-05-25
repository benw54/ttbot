var Bot    = require('ttapi');
var pg     = require('pg');

var AUTH   = 'dNcValPLtHqLzNkHrsrfsGJb';
var USERID = '517c27a6eb35c118e362e03e';
var ROOMID = '4fd1dd4daaa5cd11a1000061';

// postgres database info -- tcp://user@host:port/dbname
var conString = "tcp://walker@localhost:5432/test";

var bot = new Bot(AUTH, USERID, ROOMID);
//bot.debug = true;

var bot_dj = 0;
var vote_count = 0;
var add_count = 0;
var vote_flag = 0;
var snag_flag = 0;

bot.on('speak', function (data) 
{
    // Get the data
    var name = data.name;
    var text = data.text;
    
    // commands are a new line starting with '/' , followed by the actual command, and ending with newline

    // Respond to "/hello" command
    if (text.match(/^\/hello$/)) 
    {
	bot.speak('Hey! How are you '+name+'?');
    }
    
    //Respond to "/bop" command
    if (text.match(/^\/bop$/))
    {
	console.log('About to Bop');
	console.log(data);

	if (vote_flag == 1)
	    bot.speak('I already voted');

//	else if (data.room.metadata.current_dj == USERID)
//	    bot.speak('uh, I\'m the dj... I can\'t vote');

	else
	    {
		bot.speak('OK, I\'ll vote for this song '+name);
		bot.bop();
		vote_flag = 1;
	    }


    }	

    //Respond to "/votes" command
    if (text.match(/^\/votes$/))
    {
	bot.speak('Vote count for this song is '+vote_count);
    }

    //Respond to "/info" command
    if (text.match(/^\/info$/))
    {
	pmCMD(data.name, data.userid);
    }

    //Respond to "/botup" command
    if (text.match(/^\/botup$/))
    {
	console.log(name+ ' wants bot to DJ');
	shuffle();
	bot.addDj(function (){
	    //set bot_dj flag in callback
	    bot_dj = 1;
	});
    }

    //Respond to "/botdown" command
    if (text.match(/^\/botdown$/))
    {
	console.log(name+ ' wants bot to stop DJing');
	bot.remDj(USERID, function(){
	    //clear bot_dj flag in callback
	    bot_dj = 0;
	});
    }

    //Respond to "/skip" command
    if (text.match(/^\/skip$/))
    {
	console.log(name+ ' wants bot to skip the song');
	if (bot_dj == 1)
	    {
		bot.skip();
		bot.speak(name+ ' wants me to skip this song');
	    }
	else
	    bot.speak('I\'m not the DJ... can\'t skip');

    }

});

bot.on('pmmed', function (data){
    // want to make bot respond to different commands from PM
    // for now, just PM back a list of commands
    pmCMD(null, data.senderid);
});


bot.on('snagged', function (data)
{
    var userid = data.userid;

    if (data.userid != USERID) //if not the bot
	informRoom('add', userid);
});

bot.on('newsong', function (data)
{
    //new song... vote count starts from zero
    vote_count = 0;
    vote_flag = 0;
    snag_flag = 0;
    songid = data.room.metadata.current_song._id;

    //allowing for single quotes in strings
    artist = data.room.metadata.current_song.metadata.artist.replace(/\'/g, "''");
    title = data.room.metadata.current_song.metadata.song.replace(/\'/g, "''");

    var curid = data.room.metadata.current_dj;

    console.log('\nNew Song... ' +songid+ " (" +artist+ " - " +title+ ")");

//  connect to database for song_info

    var client = new pg.Client(conString);
    client.connect();

    client.on('error', function(error){
	console.log('There was an error: (' +error+')');
	client.end();
    });

    client.on('end', function(){
	client.end();
    });

    var songdb = client.query("SELECT count(*) num from song_info WHERE songid = '" +songid+ "';");

    songdb.on('error', function(error){
	console.log('There was an error: (' +error+ ')');
    });

    songdb.on('row',function(row){
	if (typeof row.num == 'number' && row.num > 0)
	    var newsongdb = client.query("UPDATE song_info SET playcount = playcount + 1 where songid = '" +songid+ "';");
	else
	    var newsongdb = client.query("INSERT INTO song_info VALUES ('"+songid+"','" +artist+ "','" +title+ "',default,default);");

	newsongdb.on('row', function(row){
	    console.log(row);
	});
	newsongdb.on('end', function(){
	    client.end();
	});
	newsongdb.on('error', function(error){
	    console.log('There was an error: (' +error+ ')');
	    client.end();
	});

    });


});

bot.on('endsong', function (data)
{

    var songid = data.room.metadata.current_song._id;
    var userid = data.room.metadata.current_song.djid;
    var username = data.room.metadata.current_song.djname;
    var upvotes = data.room.metadata.upvotes;
    var downvotes = data.room.metadata.downvotes;

    console.log('Song ended: ' +songid+ ' - ' +username+ '(' +userid+ ') Up: ' +upvotes+ ' Down: ' +downvotes+ ' Adds: ' +add_count);

// connect to database for play_info

    var pclient = new pg.Client(conString);
    pclient.connect();

    pclient.on('error', function(error){
	console.log('There was an error from pclient: (' +error+')');
	pclient.end();
    });

    pclient.on('end', function(){
	pclient.end();
    });

    var playdb = pclient.query("INSERT INTO play_info VALUES('"+userid+"','"+songid+"',default," +upvotes+ "," +downvotes+ "," +add_count+");");

    playdb.on('row', function(row){
	console.log(row);
    });
    playdb.on('end', function(){
	pclient.end();
    });
    playdb.on('error', function(error){
	console.log('There was an error from playdb: (' +error+ ')');
	pclient.end();
    });

    add_count = 0;

});

bot.on('update_votes', function (data)
{
    var info = data.room.metadata.votelog[0][0];
    var real_list = 0;


    bot.roomInfo(true, function (data)
		 {

		     real_list = data.room.metadata.listeners -1;
		     vote_count = data.room.metadata.upvotes;
		     var vratio = vote_count / real_list;
		     
		     if (bot_dj == 0 && vote_flag == 0 && vratio > 0.4)
		     {
			 bot.speak('Thumbs up!');
			 bot.bop();
			 vote_flag = 1;
			 vote_count = data.room.metadata.upvotes;
			 vratio = vote_count / real_list;
		     }

		     for (var i = 0; i < data.users.length; i++)
		     {
			 if (data.users[i].userid == info)
			     var username = data.users[i].name;
		     }

		     informRoom('vote', info);

		     if (bot_dj == 0 && snag_flag == 0 && vote_count > 2 && vratio >= 0.5)
			 {
			     bot.speak('Everyone seems to like this song, I\'m snagging it');
			     //doesn't actually snag, only makes the little heart happen
			     bot.snag();
			     console.log('ratio over half... adding song to queue');
			     // playlist is pretty big, let's stick the
			     // new song at index 40 since we shuffle regularly now
			     bot.playlistAdd(data.room.metadata.current_song._id, 40);
			     add_count++;
			     snag_flag = 1;
			 }

		 });

});

bot.on('registered', function(data){

    // add users (if unknown) to db
    addNewUsers();
});

bot.on('roomChanged', function(data){
    var real_list = data.room.metadata.listeners -1; 

    console.log('Logged Into Room!');
    console.log('Num Listeners: ' +real_list);


    // Stupid... bot logs into room and then hears its own
    // event for 'registered' don't do this here or it happens twice
    //    addNewUsers();
    
    
});

function informRoom(str, userid)
{
    bot.roomInfo( true, function (data)
		  {
		      // should get this by filtering @tt_stats too... later
		      real_list = data.room.metadata.listeners -1;
		      vote_count = data.room.metadata.upvotes;
		      var vratio = vote_count / real_list;

//		      console.log(data);
		      for (var i = 0; i < data.users.length; i++)
		      {
//			  console.log('data.users[' +i+ '] = ' + data.users[i].userid + ' username = ' + data.users[i].name);
			  if (data.users[i].userid == userid)
			  {
			      var username = data.users[i].name;
//			      console.log('Found a match ' +username);
			      break;
			  }

		      }
		      if (str == 'vote')
		      {
			  if (userid == null || userid == undefined || username == undefined)
			      console.log('Vote... Downvote :(' + ' Ratio = '+vratio);
			  else
			      console.log('Vote... '+userid+ ' (' +username+ ')' + ' Ratio = '+vratio);
		      }
		      
		      if (str == 'add')
		      {
			  bot.speak(username + ' added this song to their playlist');
			  console.log('Add... '+userid+ ' (' +username+ ')');
			  add_count++;
		      }
		  });
}


function shuffle()
{

    bot.playlistAll(function(data){
	var len = data.list.length;
	
	var idx1 = [];
	var idx2 = [];


	// creating two arrays of indices, unique from each other
	for (var i = 0 ; i < len; i++)
	{
	    idx1[i] = Math.floor(Math.random() * len);
	    idx2[i] = Math.floor(Math.random() * len);
	    
	    for (var j = 0; j < i; j++)
	    {
		// if number is already present in first array, try a new one
		if (idx1[j] == idx1[i])
		{
		    idx1[i] = Math.floor(Math.random() * len);
		    j = -1; 
		}
		
		// if second array's order matches first array, try again
		if (idx1[j] == idx2[j])
		{
		    idx2[j] = Math.floor(Math.random() * len);
		    j = -1;
		}
		
	    }
	}
	
	// reorder songs in playlist using those indices
	for (i = 0; i < len; i++)
	    bot.playlistReorder(idx1[i], idx2[i]);


	console.log('Playlist has ' +data.list.length+ ' songs');;
    });

// -- debug --
//    for (i = 0; i < len; i++)
//	console.log('move index ' +idx1[i]+ ' to index ' +idx2[i]);   
    
}


function addNewUsers()
{

    bot.roomInfo(false, function(data){
	//connect to database to add unknown users
	var uclient = new pg.Client(conString);
	
	uclient.connect();
	
	uclient.on('error', function(error){
	    console.log('There was an error: (' +error+')');
	    uclient.end();
	});
	
	uclient.on('end', function(){
	    uclient.end();
	});
	
	
	for (var i = 0 ; i < data.users.length; i++)
	{
	    var userid = data.users[i].userid;
	    var username = data.users[i].name;
	    
	    
	    // Stupid freaking non-blocking queries... tagging query result so when row event occurs, we have a way of
	    // telling which query result we are getting. There must be a better way? An array of query objects maybe?
	    // Documentation mentions Result object... look into that more
	    
	    var userdb = uclient.query("SELECT count(*) num, '" +i+ "' qn from user_info WHERE userid = '" +userid+ "';");
	    
	    userdb.on('error', function(error){
		console.log('There was an error: (' +error+ ')');
	    });
	    
	    userdb.on('row',function(row){
		if (typeof row.num == 'number' && row.num == 0)
		{
		    var j = row.qn;
		    //		console.log('userdb row.num = ' +row.num+ 'for username = ' +data.users[j].name+ '('+data.users[j].userid+ ') and qn = ' +row.qn);
		    console.log('Added ' +data.users[j].name+ ' (' +data.users[j].userid+ ') to user database');
		    
		    var newuserdb = uclient.query("INSERT INTO user_info VALUES ('"+data.users[j].userid+"','" +data.users[j].name+ "');");
		    
		    newuserdb.on('row', function(row){
			console.log(row);
		    });
		    //	    newuserdb.on('end', function(){
		    //		uclient.end();
		    //	    });
		    newuserdb.on('error', function(error){
			console.log('There was an error: (' +error+ ')');
			console.log('With userid: ' +data.users[j].userid+ ' name: ' +data.users[j].name+ ' qnum: ' +j);
			//		uclient.end();
		    });
		}
	    });
	}
    });

    console.log('Added Unknown users to DB');
}

function pmCMD(name, userid)
{

    //chaining callbacks to pm in correct order
    bot.pm('These are the commands I understand:\n\n', userid, function(){
	bot.pm('/hello   --> I say hello to you\n\n', userid, function(){
	    bot.pm('/votes   --> the vote count for current song\n\n', userid, function(){
		bot.pm('/bop     --> I vote for the current song\n\n', userid, function(){
		    bot.pm('/botup   --> I get up and DJ\n\n', userid, function(){
			bot.pm('/botdown --> I stop DJing\n\n', userid, function(){
			    bot.pm('/skip    --> if DJing, I skip the current song\n\n', userid, function(){
				bot.pm('/info    --> I\'ll pm you a list of commands\n\n', userid);
			    });
			});
		    });
		});
	    });
	});
    });
    
    console.log('Pmmed ' +name+ '(' +userid+ ')');    
}
