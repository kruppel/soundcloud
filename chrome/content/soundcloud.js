/*


Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const DESCRIPTION = "SoundCloud";
const CID = "{0f8eed80-1dd2-11b2-b610-d7e8729d7d35}";
const CONTRACTID = "@songbirdnest.com/soundcloud;1";

const soundcloudURL = "http://api.soundcloud.com/tracks?q=";
*/

const soundcloudURL = "http://api.soundcloud.com/tracks.json?order=hotness";

var SoundCloud = {
        /* 
        getSearchURL : function(query) {
                return (soundcloudURL + query);
        },
        */
        
	getSearchURL : function(event) {
	        let value = document.getElementById("soundcloud-search-textbox").value;
	        let query = encodeURIComponent(value);
	        CloudDirectory.loadTable(soundcloudURL + "&q=" + query);
	},
        /*
        getTracksList : function(genre) {
                var req = new XMLHttpRequest();
                if (genre == "sbITop")
                        genre = "BigAll&limit=200";
                req.open("GET",
                        "http://yp.shoutcast.com/sbin/newxml.phtml?genre="+genre, false);                       
                req.genre = genre;
                req.send(null);
                var xml = (new DOMParser()).
                                parseFromString(req.responseText, "text/xml");
                var stationList = xml.getElementsByTagName("stationlist")[0].
                                getElementsByTagName("station");
                return (stationList);
        }
        */

        getTracks : function(url, offset) {
                 var req;
                 try{
                   // create the XMLHttpRequest object
                   req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
                   // setup event handlers
                   //req.onload = function(event) { onload(req); }
                   //req.onerror = function(event) { onerror(req); }
                   // open connection to the URL
                   req.open('GET', url, false);
                   // XXX set request header for application/json
                   //req.setRequestHeader('Content-Type', 'text/xml');
                   // Change to onreadystatechange later
		   /*
		   req.onreadystatechange = function() {
                     if (req.readyState == 4) {
                       if (req.status == 200) {
                         var xml = (new DOMParser()).
                                      parseFromString(req.responseText, "text/xml");
                         var trackList = xml.getElementsByTagName("tracks")[0].getElementsByTagName("track");
		       } else { 
		         alert("There was a problem retrieving the XML data:\n" + req.statusText);
		       } 
		     } 
		   };
		   */
                   // open connection to the URL
                   //req.open('GET', url, true);
                   // XXX Pass url-encoded params?
                   req.send(null);
		   
		   var next = offset + 50;
                   var rs = eval('(' + req.responseText + ')');
		   
		   var results = rs.length;

		   if ( results < 49 ) {
		     return rs;
		   } else {
		     return rs.concat(this.getTracks(url + "&offset=" + next, next));
		   }
		   //var xml = (new DOMParser()).
                   //               parseFromString(req.responseText, "application/json");
                   //var trackList = xml.getElementsByTagName("tracks")[0].getElementsByTagName("track");
		   //return (trackList);
                 } catch(e) {
                   Cu.reportError(e);
                   //onerror(xhr);
                 }
        }
}
