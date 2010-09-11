// Make a namespace.
if (typeof SoundCloud == 'undefined') {
  var SoundCloud = {};
}

if (typeof Cc == 'undefined')
  var Cc = Components.classes;
if (typeof Ci == 'undefined')
  var Ci = Components.interfaces;
if (typeof Cu == 'undefined')
  var Cu = Components.utils;

if (typeof(gMM) == "undefined")
  var gMM = Cc["@songbirdnest.com/Songbird/Mediacore/Manager;1"].
    getService(Ci.sbIMediacoreManager);

if (typeof(gMetrics) == "undefined")
  var gMetrics = Cc["@songbirdnest.com/Songbird/Metrics;1"].
    createInstance(Ci.sbIMetrics);

if (typeof(SOCL_FAVICON_PATH) == "undefined")
  const SOCL_FAVICON_PATH = "chrome://soundcloud/skin/soundcloud_favicon.png";

const soundcloudTempLibGuid = "extensions.soundcloud.templib.guid";

var mmListener = {
  time : null,
  playingTrack : null,
  
  onMediacoreEvent : function(ev) {
    var item = ev.data;
    
    if (gMM.sequencer.view == null)
      return;
    
    var list = gMM.sequencer.view.mediaList;

    switch (ev.type) {
      case Ci.sbIMediacoreEvent.STREAM_START:
        // first we'll get the currently playing media item
        var currentItem = gMM.sequencer
	                     .view.getItemByIndex(gMM.sequencer.viewPosition);

        // check to see if we have an active timer
        if (mmListener.time) {
          var now = Date.now()/1000;
          var diff = now - mmListener.time;
          gMetrics.metricsAdd("soundcloud", "stream", "time", diff);
        }

        // if our new stream we're playing isn't a soundcloud
        // stream then cancel the timer
        if (!currentItem.getProperty(SOCL_url)) {
          mmListener.time = null;
          mmListener.setPlayerState(false);
          mmListener.playingTrack = null;
          return;
        }
        // Ensure the playing buttons and SoundCloud faceplate
        // icon are in the right state
        mmListener.playingTrack = item;
        mmListener.setPlayerState(true);

        // if we're here then we're a soundcloud stream, and we should
        // start a timer
        mmListener.time = Date.now()/1000;
        break;

      case Ci.sbIMediacoreEvent.BEFORE_TRACK_CHANGE:
        mmListener.setPlayerState(false);
        break;

      case Ci.sbIMediacoreEvent.STREAM_END:

      case Ci.sbIMediacoreEvent.STREAM_STOP:
        mmListener.setPlayerState(false);
        mmListener.playingTrack = null;

        // check to see if we have an active timer
        if (!mmListener.time) {
          mmListener.time = null;
          return;
        }

        var now = Date.now()/1000;
        var diff = now - mmListener.time;
        
	gMetrics.metricsAdd("soundcloud", "stream", "time", diff);
        mmListener.time = null;
        break;

      case Ci.sbIMediacoreEvent.METADATA_CHANGE:
        var currentItem = gMM.sequencer.currentItem;
        /*
        if (currentItem.getProperty(SC_url) == -1) {
          var props = ev.data;

          for (var i=0; i<props.length; i++) {
            var prop = props.getPropertyAt(i);
            dump(prop.id + " == " + prop.value + "\n");

            if (prop.id == SBProperties.bitRate) {
              dump("bitrate!!!!!!!\n");
              var libraryManager = Cc['@songbirdnest.com/Songbird/library/Manager;1'].
                getService(Ci.sbILibraryManager);
              var libGuid = Application.prefs.get(shoutcastTempLibGuid);
              var l = libraryManager.getLibrary(libGuid.value);
              var a = l.getItemsByProperty(SBProperties.customType,
                                           "radio_favouritesList");
              var faves = a.queryElementAt(0, Ci.sbIMediaList);

              var item = faves.getItemByGuid(currentItem.getProperty(
                SBProperties.outerGUID));
              dump("item: " + item.guid + "\n");
              dump("outer; " + currentItem.getProperty(SBProperties.outerGUID));
              item.setProperty(SBProperties.bitRate, prop.value);
            }
          }
        }
        */
        break;

      default:
        break;
    }
  },

  disableTags : [ ],

  setPlayerState: function(scStream) {
    var playButton = document.getElementById("play_pause_button");

    if (scStream) {
      // stationIcon.style.visibility = "visible";
      for (var i in mmListener.disableTags) {
        var elements = document.getElementsByTagName(mmListener.disableTags[i]);

        for (var j=0; j<elements.length; j++) {
          elements[j].setAttribute('disabled', 'true');
        }
      }

    //playButton.setAttribute("hidden", "true");
    //stopButton.removeAttribute("hidden");

    } else {
      //stationIcon.style.visibility = "collapse";
      //stopButton.setAttribute("hidden", "true");
      //playButton.removeAttribute("hidden");

      // if we're not playign something then reset the button state
      // OR if we're not playing Last.fm
      if ((gMM.status.state == Ci.sbIMediacoreStatus.STATUS_STOPPED) ||
          (gMM.status.state == Ci.sbIMediacoreStatus.STATUS_PLAYING &&
           Application.prefs.getValue('songbird.lastfm.radio.station', '') == ''))
      {
        for (var i in mmListener.disableTags) {
          var elements = document.getElementsByTagName(mmListener.disableTags[i]);

          for (var j=0; j<elements.length; j++) {
            elements[j].removeAttribute('disabled');
          }
        }
      }
    }
  }
}

/**
 * UI controller that is loaded into the main player window
 */
SoundCloud.Controller = {
  SB_NS: "http://songbirdnest.com/data/1.0#",
  SP_NS: "http://songbirdnest.com/rdf/servicepane#",

  URL_SIGNUP: 'http://soundcloud.com/signup',

  onLoad: function() {
    // initialization code
    this._initialized = true;
    this._strings = document.getElementById("soundcloud-strings");

    // Create a service pane node for our chrome
    var SPS = Cc['@songbirdnest.com/servicepane/service;1'].
      getService(Ci.sbIServicePaneService);

    // Check whether the node already exists
    if (SPS.getNode("SB:RadioStations:SoundCloud"))
      return;
		
    // Walk nodes to see if a "Radio" folder already exists
    var radioFolder = SPS.getNode("SB:RadioStations");

    if (!radioFolder) {
      radioFolder = SPS.createNode();
      radioFolder.id = "SB:RadioStations";
      radioFolder.className = "folder radio";
      radioFolder.name = this._strings.getString("radioFolderLabel");
      radioFolder.setAttributeNS(this.SB_NS, "radioFolder", 1); // for backward-compat
      radioFolder.setAttributeNS(this.SP_NS, "Weight", 2);
      SPS.root.appendChild(radioFolder);
    } 

    radioFolder.editable = false;
    radioFolder.hidden = false;

    // Add SoundCloud chrome to service pane
    var scNode = SPS.createNode();
    scNode.url = "chrome://soundcloud/content/directory.xul";
    scNode.id = "SB:RadioStations:SoundCloud";
    scNode.name = "SoundCloud";
    scNode.image = SOCL_FAVICON_PATH;
    radioFolder.appendChild(scNode);
    scNode.editable = false;
    scNode.hidden = false;

/*
    var favNode = SPS.createNode();
    favNode.url="chrome://soundcloud/content/directory.xul";
    favNode.id = "urn:scfavorites"
    favNode.name = "Favorites";
    favNode.tooltip = "SoundCloud favorites";
    favNode.editable = false;
    scNode.appendChild(favNode);
    favNode.hidden = false;

    var domNode = window.gServicePane.getDOMNode(favNode.id);
    if (domNode) domNode.appendBadge(25, null);
*/

    // Status bar icon
    this._statusIcon = document.getElementById('soundcloudStatusIcon');
    // Panel
    this._panel = document.getElementById('soundcloudPanel');
    // Deck
    this._deck = document.getElementById('soundcloudDeck');
    // Login page of the deck
    this._login = document.getElementById('soundcloudLogin');
    // Login username field
    this._email = document.getElementById('soundcloudEmail');
    // Login password field
    this._password = document.getElementById('soundcloudPassword');
    // Login error
    this._loginError = document.getElementById('soundcloudLoginError');
    // Login button
    this._loginButton = document.getElementById('soundcloudLoginButton');
    // Logging-in page of the deck
    this._loggingIn = document.getElementById('soundcloudLoggingIn');
    // Cancel button
    this._cancelButton = document.getElementById('soundcloudCancelButton');
    // Sign up link
    this._signup = document.getElementById('soundcloudSignup');

    // Profile page of the deck
    this._profile = document.getElementById('soundcloudProfile');
    // Logout button
    this._logoutButton = document.getElementById('soundcloudLogoutButton');
    // Profile image
    this._image = document.getElementById('soundcloudImage');

    // Wire up click event for the status icon
    this._statusIcon.addEventListener('click',
      function(event) {
      // Only the left button
        if (event.button != 0) return;
        SoundCloud.Controller.showPanel();
      }, false);
   
    // Wire up UI events for popup buttons
    this._loginButton.addEventListener('command',
      function(event) { SoundCloud.Controller.onLoginClick(event); }, false);
    this._cancelButton.addEventListener('command',
      function(event) { SoundCloud.Controller.onCancelClick(event); }, false);
    this._logoutButton.addEventListener('command',
      function(event) { SoundCloud.Controller.onLogoutClick(event); }, false);

    // Wire up the signup link
    this._signup.addEventListener('click',
      function(event) { SoundCloud.Controller.loadURI(SoundCloud.Controller.URL_SIGNUP, event); }, false);

    // Focus & select email field on popupshown event
    this._panel.addEventListener('popupshown',
      function(event) {
        if (SoundCloud.Controller._deck.selectedPanel == SoundCloud.Controller._login) {
          SoundCloud.Controller._email.focus();
          SoundCloud.Controller._email.select();
        }
      }, false);

    // React to changes in the login form
    this._email.addEventListener('input', 
      function(event) { SoundCloud.Controller.loginFormChanged(event); }, false);
    this._password.addEventListener('input',
      function(event) { SoundCloud.Controller.loginFormChanged(event); }, false);
    SoundCloud.Controller.loginFormChanged();

    // React to keypresses
    this._email.addEventListener('keypress', 
      function(event) { SoundCloud.Controller.loginFormKeypress(event); }, false);
    this._password.addEventListener('keypress',
      function(event) { SoundCloud.Controller.loginFormKeypress(event); }, false);

    // Attach our listener for media core events
    gMM.addListener(mmListener);

    // Attach our listener to the ShowCurrentTrack event issued by the
    // faceplate
    var faceplateManager = Cc['@songbirdnest.com/faceplate/manager;1'].
      getService(Ci.sbIFaceplateManager);
    var pane = faceplateManager.getPane("songbird-dashboard");
    var sbWindow = Cc["@mozilla.org/appshell/window-mediator;1"].
      getService(Ci.nsIWindowMediator).
      getMostRecentWindow("Songbird:Main").window;
    sbWindow.addEventListener("ShowCurrentTrack", curTrackListener, true);

    // Create our properties if they don't exist
    var pMgr = Cc["@songbirdnest.com/Songbird/Properties/PropertyManager;1"].
      getService(Ci.sbIPropertyManager);

    if (!pMgr.hasProperty(SOCL_title)) {
      var pI = Cc["@songbirdnest.com/Songbird/Properties/Info/Text;1"].
        createInstance(Ci.sbITextPropertyInfo);
      pI.id = SOCL_title;
      pI.displayName = this._strings.getString("trackName");
      pI.userEditable = false;
      pI.userViewable = false;
      pMgr.addPropertyInfo(pI);
    }
    
    if (!pMgr.hasProperty(SOCL_time)) {
      var pI = Cc["@songbirdnest.com/Songbird/Properties/Info/Number;1"].
        createInstance(Ci.sbINumberPropertyInfo);
      pI.id = SOCL_time;
      pI.displayName = this._strings.getString("duration");
      pI.userEditable = false;
      pI.userViewable = false;
      pMgr.addPropertyInfo(pI);
    }

    if (!pMgr.hasProperty(SOCL_user)) {
      var pI = Cc["@songbirdnest.com/Songbird/Properties/Info/Text;1"].
        createInstance(Ci.sbITextPropertyInfo);
      pI.id = SOCL_user;
      pI.displayName = this._strings.getString("user");
      pI.userEditable = false;
      pI.userViewable = false;
      pMgr.addPropertyInfo(pI);
    }

    if (!pMgr.hasProperty(SOCL_plays)) {
      var pI = Cc["@songbirdnest.com/Songbird/Properties/Info/Text;1"].
        createInstance(Ci.sbITextPropertyInfo);
      pI.id = SOCL_plays;
      pI.displayName = " ";
      pI.userEditable = false;
      pI.userViewable = false;
      pMgr.addPropertyInfo(pI);
    }

    if (!pMgr.hasProperty(SOCL_favs)) {
      var pI = Cc["@songbirdnest.com/Songbird/Properties/Info/Text;1"].
        createInstance(Ci.sbITextPropertyInfo);
      pI.id = SOCL_favs;
      pI.displayName = " ";
      pI.userEditable = false;
      pI.userViewable = false;
      pMgr.addPropertyInfo(pI);
    }

    if (!pMgr.hasProperty(SOCL_url)) {
      var pI = Cc["@songbirdnest.com/Songbird/Properties/Info/Text;1"].
        createInstance(Ci.sbITextPropertyInfo);
      pI.id = SOCL_url;
      pI.displayName = this._strings.getString("streamURL");
      pI.userEditable = true;
      pI.userViewable = false;
      pMgr.addPropertyInfo(pI);
    }

    // Register our observer for application shutdown
    soundcloudUninstallObserver.register();
		
    SoundCloud.Controller._prefBranch = Cc["@mozilla.org/preferences-service;1"]
      .getService(Ci.nsIPrefService).getBranch("songbird.metadata.")
      .QueryInterface(Ci.nsIPrefBranch2);
		
    // Reset the filter at startup
    Application.prefs.setValue("extensions.soundcloud.filter", "");
		
  },

  showPanel: function() {
    this._panel.openPopup(this._statusIcon);
  },

  loginFormChanged: function(event) {
    if (this._email.value.length && this._password.value.length) {
      this._loginButton.disabled = false;
    } else {
      this._loginButton.disabled = true;
    }
  },

  loginFormKeypress: function(event) {
    if (event.keyCode == KeyEvent.DOM_VK_RETURN ||
        event.keyCode == KeyEvent.DOM_VK_ENTER) {
      if (!this._loginButton.disabled) {
        this.onLoginClick(event);
      }
    }
  },

  onLoginClick: function(event) {
    this._deck.selectedPanel = this._loggingIn;
    var url = "http://api.soundcloud.com/oauth/request_token";
    var accessor = { consumerSecret: "YqGENlIGpWPnjQDJ2XCLAur2La9cTLdMYcFfWVIsnvw"};
    var message = { action: url,
                    method: "POST",
                    parameters: []
                  };

    message.parameters.push(['oauth_consumer_key', 'eJ2Mqrpr2P4TdO62XXJ3A']);
    message.parameters.push(['oauth_signature_method', 'HMAC-SHA1']);

    OAuth.setTimestampAndNonce(message);
    OAuth.SignatureMethod.sign(message, accessor);

    var params = "";

    for (var p in message.parameters) {
      if (p == 0) {
        params += message.parameters[p][0] + "=" + message.parameters[p][1];
      } else {
        params += "&" + message.parameters[p][0] + "=" + message.parameters[p][1];
      }
    }

    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);

    xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    xhr.setRequestHeader("Content-length", params.length);
    xhr.setRequestHeader("Connection", "close");

    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          alert(xhr.responseText);
        }
      }
    }
  
    xhr.send(params);
  },

  onCancelClick: function(event) {
    this._deck.selectedPanel = this._login;
  },

  onLogoutClick: function(event) {
    this._deck.selectedPanel = this._login;
  },

  loadURI: function(uri, event) {
    gBrowser.loadURI(uri, null, null, event, '_blank');
    this._panel.hidePopup();
  },

  onUnLoad: function() {
    this._initialized = false;
    gMM.removeListener(mmListener);
  }
}

/*
SoundCloud.Controller.metadataObserver = {
  observe: function(subject, topic, data) {
    var item;
      try {
        item = gMM.sequencer.currentItem;
       } catch (e) {
         return;
       }

    if (subject instanceof Ci.nsIPrefBranch) {
      if (data == "title" && item && item.getProperty(SC_streamName)) {
        if (!Application.prefs.getValue("extensions.soundcloud.title-parsing", 
                                        true))
          return;

        var title = subject.getCharPref(data);

        if (title.indexOf(item.getProperty(SC_streamName)) >= 0)
          return;

        var m = title.match(/^(.+) - ([^-]+)$/);
	
        if (m) {
          SoundCloud.Controller.ts = Date.now();
          item.setProperty(SBProperties.artistName, m[1]);
          item.setProperty(SBProperties.trackName, m[2]);
					
          var ev = gMM.createEvent(Ci.sbIMediacoreEvent.TRACK_CHANGE,
                                   gMM.primaryCore, item);
          gMM.QueryInterface(Ci.sbIMediacoreEventTarget).dispatchEvent(ev);
        }
      }
    }
  }
};
*/

var curTrackListener = function(e) {
  var list;
  var gPPS;

  if (typeof(Ci.sbIMediacoreManager) != "undefined") {
    list = gMM.sequencer.view.mediaList;
  } else {
    gPPS = Cc['@songbirdnest.com/Songbird/PlaylistPlayback;1'].
      getService(Ci.sbIPlaylistPlayback);
    list = gPPS.playingView.mediaList;
  }

  // get the list that owns this guid
  if (list.getProperty(SBProperties.customType) == "radio_tempStreamList") {
    var streamName;
    if (typeof(Ci.sbIMediacoreManager) != "undefined") {
      streamName = gMM.sequencer.view
                                .getItemByIndex(gMM.sequencer.viewPosition)
                                .getProperty(SOCL_title);
    } else {
      streamName = list.getItemByGuid(gPPS.currentGUID)
                       .getProperty(SOCL_title);
    }

    // check to see if this tab is already loaded
    /*
    var tabs = gBrowser.mTabs;
    var found = -1;
    var loadURL = "http://shoutcast.com/directory/?s=" + escape(streamName);
                
    for (var i=0; i<tabs.length; i++) {
      var curBrowser = gBrowser.getBrowserAtIndex(i);
      var loadingURI = curBrowser.userTypedValue;
      var compValue;

      if (loadingURI != null) {
        compValue = loadingURI;
      } else {
        compValue = curBrowser.currentURI.spec;

      if (compValue == loadURL) {
        found = i;
        break;
      }
    }

    if (found != -1) {
      // a tab already exists, so select it
      gBrowser.selectedTab = tabs[found];
    } else {
      // otherwise load a new tab
      gBrowser.loadOneTab(loadURL);
    }

    // prevent the event from bubbling upwards
    e.preventDefault();
    */
  }
}

var soundcloudUninstallObserver = {
  _uninstall : false,
  _disable : false,
  _tabs : null,

  observe : function(subject, topic, data) {
    if (topic == "em-action-requested") {
      // Extension has been flagged to be uninstalled
      subject.QueryInterface(Ci.nsIUpdateItem);

    if (subject.id == "soundcloud@songbirdnest.com") {
      if (data == "item-uninstalled") {
        this._uninstall = true;
      } else if (data == "item-cancel-action") {
        this._uninstall = false;
        }
      }
    } else if (topic == "quit-application-granted") {
      // We're shutting down, so check to see if we were flagged
      // for uninstall - if we were, then cleanup here
      if (this._uninstall) {
        var tempLibGuid;
        var radioLibGuid;
        var prefs = Cc["@mozilla.org/preferences-service;1"].
          getService(Components.interfaces.nsIPrefService);
        var scPrefs = prefs.getBranch("extensions.soundcloud.");

        // Things to cleanup:
        // Remove preferences
        /*
        if (scPrefs.prefHasUserValue("plsinit"))
          scPrefs.clearUserPref("plsinit");

        if (scPrefs.prefHasUserValue("filter"))
          scPrefs.clearUserPref("filter");

        if (scPrefs.prefHasUserValue("custom-genres"))
          scPrefs.clearUserPref("custom-genres");

        if (scPrefs.prefHasUserValue("library.guid")) {
          radioLibGuid = scPrefs.getCharPref("library.guid");
          scPrefs.clearUserPref("library.guid");
	}

        if (scPrefs.prefHasUserValue("templib.guid")) {
          tempLibGuid = scPrefs.getCharPref("templib.guid");
          scPrefs.clearUserPref("templib.guid");
        }
        */

        scPrefs.deleteBranch("");
      }

      this.unregister();
    }
  },

  register : function() {
    var observerService = Cc["@mozilla.org/observer-service;1"]
      .getService(Ci.nsIObserverService);

    observerService.addObserver(this, "em-action-requested", false);
    observerService.addObserver(this, "quit-application-granted", false);
  },

  unregister : function() {
    var observerService = Cc["@mozilla.org/observer-service;1"]
      .getService(Ci.nsIObserverService);
    observerService.removeObserver(this, "em-action-requested");
    observerService.removeObserver(this, "quit-application-granted");
  }
}

window.addEventListener("load",
                        function(e) { SoundCloud.Controller.onLoad(e); }, false);
window.addEventListener("unload",
                        function(e) { SoundCloud.Controller.onUnLoad(e); }, false);
