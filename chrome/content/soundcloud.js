var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;

Cu.import("resource://app/jsmodules/DOMUtils.jsm");
Cu.import("resource://app/jsmodules/WindowUtils.jsm");

const CONSUMER_KEY = "eJ2Mqrpr2P4TdO62XXJ3A";
const soundcloudURL = "http://api.soundcloud.com/tracks.json?order=hotness";

var SoundCloud = {
  _open: function SoundCloud_open() {
    this._service = Cc['@songbirdnest.com/soundcloud;1']
                      .getService().wrappedJSObject;
    this._browser = document.getElementById("soundcloud_auth_browser");
    this._browser.loadURI(this._service.soundcloud_url
                          + '/oauth/authorize?oauth_token='
                          + this._service.oauth_token
                          + '&display=popup');
    var self = this;
    this._domEventListenerSet = new DOMEventListenerSet();
    this._domEventListenerSet.add(window,
                                  "DOMContentLoaded",
                                  function(aEvent) {
                                    self._authListener(aEvent);
                                  },
                                  true,
                                  false);
  },

  _authListener: function SoundCloud_authListener(aEvent) {
    var doc = this._browser.contentDocument;
    var deck = document.getElementById("soundcloud_auth_deck");

    if (deck.selectedPanel != this._browser) {
      deck.selectedPanel = this._browser;
      WindowUtils.sizeToContent(window);
      return;
    }

    var state = doc.getElementsByTagName("h1")[0].innerHTML;
    if (state == "You're now connected") {
      this._service.loggedIn = true;
      window.close();
    } else if (state == "Access Denied") {
      window.close();
    }
  },

  _close: function SoundCloud_close() {
    this._service.authCallback();

    if (this._domEventListenerSet) {
      this._domEventListenerSet.removeAll();
      this._domEventListenerSet = null;
    }
  },
        
  getSearchURL : function(event) {
    // Reset the library
    CloudDirectory.radioLib.clear();
    CloudDirectory.resetTracksFound();
    // Get value from search textbox
    var value = document.getElementById("soundcloud-search-textbox").value;
    var query = encodeURIComponent(value);
    var url = soundcloudURL + "&q=" + query + "&consumer_key=" + CONSUMER_KEY;
    this.getTracks(url, 0);
  },

  getTracks : function(url, offset) {
    var req;

    try{
      // create the XMLHttpRequest object
      req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
      req.onreadystatechange = function() {
        if (req.readyState == 4) {
          if (req.status == 200) {
            // Could be more safe/secure... you could potentially inject
            // harmful js here. Going to assume SoundCloud is a reliable
            // source though.
            let rs = eval('(' + req.responseText + ')');
            let results = rs.length;
            let next = offset + results;
            CloudDirectory.loadTable(rs);
            if (results > 40) {
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
