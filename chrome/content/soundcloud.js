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
             */
            }
          }
        }
      }

      // open connection to the URL
      req.open('GET', url + "&offset=" + offset, true);
      req.send(null);
    } catch(e) {
      Cu.reportError(e);
    }
  }
}
