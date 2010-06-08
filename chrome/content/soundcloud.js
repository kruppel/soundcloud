const soundcloudURL = "http://api.soundcloud.com/tracks.json?order=hotness";

var SoundCloud = {
        
	getSearchURL : function(event) {
	        // Reset the library
	        CloudDirectory.radioLib.clear();
		CloudDirectory.resetTracksFound();
		// Get value from search textbox
	        var value = document.getElementById("soundcloud-search-textbox").value;
	        var query = encodeURIComponent(value);
	        this.getTracks(soundcloudURL + "&q=" + query, 0);
	},

        getTracks : function(url, offset) {
	         //alert(url + "&offset="+ offset);
                 var req;
                 try{
                   // create the XMLHttpRequest object
                   req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
                   req.onreadystatechange = function() {
		     if (req.readyState == 4) {
		       if (req.status == 200) {
		         let rs = eval('(' + req.responseText + ')');
			 let results = rs.length;
		         let next = offset + results;
			 CloudDirectory.loadTable(rs);
			 if (results > 45) {
			   SoundCloud.getTracks(url, next);
			 } else {
			   /*
			   var tracksFound = CloudDirectory.getTracksFound(results);
			   SBDataSetStringValue("faceplate.status.text",
			                  tracksFound + " " +
					  CloudDirectory._strings.getString("tracksFound"));
					  */
			 }
		       }
		     }
		   }
		   // open connection to the URL
                   req.open('GET', url + "&offset=" + offset, true);
                   req.send(null);
		   /*
		   var next = offset + 50;
                   var rs = eval('(' + req.responseText + ')');
		   
		   var results = rs.length;

		   if ( results < 49 ) {
		     return rs;
		   } else {
		     return rs.concat(this.getTracks(url + "&offset=" + next, next));
		   }
		   */

                 } catch(e) {
                   Cu.reportError(e);
                 }
        }
}
