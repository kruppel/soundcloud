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

  setPlayerState: function(stream) {
    var playButton = document.getElementById("play_pause_button");

    if (stream) {
      for (var i in mmListener.disableTags) {
        var elements = document.getElementsByTagName(mmListener.disableTags[i]);

        for (var j=0; j<elements.length; j++) {
          elements[j].setAttribute('disabled', 'true');
        }
      }

    } else {
      // if we're not playing something then reset the button state
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
 *
 */
SoundCloud.SB_NS = "http://songbirdnest.com/data/1.0#";
SoundCloud.SP_NS = "http://songbirdnest.com/rdf/servicepane#";

SoundCloud.URL_SIGNUP = 'http://soundcloud.com/signup';
SoundCloud.URL_PASSWORD = 'https://soundcloud.com/login/forgot';

SoundCloud.Icons = {
  busy: 'chrome://soundcloud/skin/busy.png',
  disabled: 'chrome://soundcloud/skin/disabled.png',
  logged_in: 'chrome://soundcloud/skin/soundcloud_favicon.png'
};

SoundCloud.onLoad = function() {
  // initialization code
  this._strings = document.getElementById("soundcloud-strings");

  this._service = Components.classes['@songbirdnest.com/soundcloud;1'].
    getService().wrappedJSObject;
  this._service.listeners.add(this);

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

  this._statusIcon = document.getElementById('soundcloudStatusIcon');
  this._panelBinding = document.getElementById('soundcloudLoginPanel');
  this._panel = this._getElement(this._panelBinding, 'loginPanel');
  this._deck = this._getElement(this._panelBinding, 'loginDeck');
  this._login = this._getElement(this._panelBinding, 'loginBox');
  this._username = this._getElement(this._panelBinding, 'username');

  // Hacky solution to increase max length of username field
  this._username.setAttribute("maxlength", 255);

  this._loginAutoLogin = this._getElement(this._panelBinding,
                                          'loginAutoLogin');
  this._password = this._getElement(this._panelBinding, 'password');
  this._loginError = this._getElement(this._panelBinding, 'loginError');
  this._loginButton = this._getElement(this._panelBinding, 'loginButton');
  this._loggingIn = this._getElement(this._panelBinding, 'loginProgressBox');
  this._cancelButton = this._getElement(this._panelBinding, 'cancelButton');

  this._signup = this._getElement(this._panelBinding, 'signup');
  this._signup.textContent = this._strings.getString('soundcloud.signup.label');

  this._forgotpass = this._getElement(this._panelBinding, 'forgotpass');
  this._forgotpass.textContent =
         this._strings.getString('soundcloud.forgotpass.label');

  this._profile = this._getElement(this._panelBinding, 'profile');
  this._logoutButton = this._getElement(this._panelBinding, 'logoutButton');
  this._image = this._getElement(this._panelBinding, 'image');

  this._profileAutoLogin = this._getElement(this._panelBinding,
                                            'profileAutoLogin');

  // Wire up click event for the status icon
  this._statusIcon.addEventListener('click',
    function(event) {
    // Only the left button
      if (event.button != 0) return;
      SoundCloud.showPanel();
    }, false);

  // Wire up UI events for popup buttons
  this._loginButton.addEventListener('command',
    function(event) { SoundCloud.onLoginClick(event); }, false);
  this._cancelButton.addEventListener('command',
    function(event) { SoundCloud.onCancelClick(event); }, false);
  this._logoutButton.addEventListener('command',
    function(event) { SoundCloud.onLogoutClick(event); }, false);

  // Wire up the signup link
  this._signup.addEventListener('click',
    function(event) { SoundCloud.loadURI(SoundCloud.URL_SIGNUP, event); }, false);

  this._forgotpass.addEventListener('click',
    function(event) { SoundCloud.loadURI(SoundCloud.URL_PASSWORD, event); }, false);

  var self = this;
  this._panelBinding.addEventListener("login-button-clicked",
                function(event) { self._handleUIEvents(event); }, false);
  this._panelBinding.addEventListener("cancel-button-clicked",
                function(event) { self._handleUIEvents(event); }, false);
  this._panelBinding.addEventListener("logout-button-clicked",
                function(event) { self._handleUIEvents(event); }, false);

  // Focus & select username field on popupshown event
  this._panel.addEventListener('popupshown',
    function(event) {
      if (SoundCloud._deck.selectedPanel == SoundCloud._login) {
        SoundCloud._username.focus();
        SoundCloud._username.select();
      }
    }, false);

  // React to changes in the login form
  this._username.addEventListener('input', 
    function(event) { SoundCloud.loginFormChanged(event); }, false);
  this._password.addEventListener('input',
    function(event) { SoundCloud.loginFormChanged(event); }, false);
  SoundCloud.loginFormChanged();

  // React to keypresses
  this._username.addEventListener('keypress', 
    function(event) { SoundCloud.loginFormKeypress(event); }, false);
  this._password.addEventListener('keypress',
    function(event) { SoundCloud.loginFormKeypress(event); }, false);

  // Attach our listener for media core events
  gMM.addListener(mmListener);

  this.onLoggedInStateChanged();
  this.updateStatus();

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

  SoundCloud._prefBranch = Cc["@mozilla.org/preferences-service;1"]
    .getService(Ci.nsIPrefService).getBranch("songbird.metadata.")
    .QueryInterface(Ci.nsIPrefBranch2);

  	
}

SoundCloud.showPanel = function() {
  this._panel.openPopup(this._statusIcon);
}

SoundCloud.loginFormChanged = function(event) {
  if (this._username.value.length && this._password.value.length) {
    this._loginButton.disabled = false;
  } else {
    this._loginButton.disabled = true;
  }
}

SoundCloud.loginFormKeypress =
  function(event) {
    if (event.keyCode == KeyEvent.DOM_VK_RETURN ||
        event.keyCode == KeyEvent.DOM_VK_ENTER) {
      if (!this._loginButton.disabled) {
        this.onLoginClick(event);
      }
    }
  }

SoundCloud.onLoginClick = function(event) {
  this._service.username = this._username.value;
  this._service.password = this._password.value;
  dump("\n\n\nPASSWORD: \n" + this._password.value + "\n\n");

  this._service.login(true);
}

SoundCloud.onCancelClick = function(event) {
  this._deck.selectedPanel = this._login;
}

SoundCloud.onLogoutClick = function(event) {
  this._deck.selectedPanel = this._login;
}

SoundCloud.loadURI = function(uri, event) {
  gBrowser.loadURI(uri, null, null, event, '_blank');
  this._panel.hidePopup();
}

// SoundCloud event handlers for login events
SoundCloud.onLoggedInStateChanged = function SoundCloud_onLoggedInStateChanged() {
  if (this._service.loggedIn) {
    this._deck.selectedPanel = this._profile;
  } else {
    this._deck.selectedPanel = this._login;
  }

  this.updateStatus();
}

SoundCloud.onLoginBegins = function SoundCloud_onLoginBegins() {
  this._deck.selectedPanel = this._loggingIn;
  this.setStatusIcon(this.Icons.busy);
  //this.setStatusTextId('soundcloud.state.logging_in');
}

SoundCloud.onLoginSucceeded = function SoundCloud_onLoginSucceeded() {
  this._deck.selectedPanel = this._profile;
  this.setStatusIcon(this.Icons.logged_in);
}

SoundCloud.updateStatus = function SoundCloud_updateStatus() {
  if (this._service.loggedIn) {
    this.setStatusIcon(this.Icons.logged_in);
    //this.setStatusTextId('soundcloud.state'+stateName);
  } else {
    this.setStatusIcon(this.Icons.disabled);
  }
}

SoundCloud.setStatusIcon = function SoundCloud_setStatusIcon(aIcon) {
  this._statusIcon.setAttribute('src', aIcon);
}

SoundCloud.setStatusText = function SoundCloud_setStatusText(aText) {
  this._statusIcon.setAttribute('tooltip', aText);
}

SoundCloud.setStatusText = function SoundCloud_setStatusText(aId) {
  this._statusIcon.setStatusText(this._strings.getString(aId));
}

SoundCloud.onUnLoad = function() {
  this._service.listeners.remove(this);
  gMM.removeListener(mmListener);
}

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
    var tabs = gBrowser.mTabs;
    var found = -1;
    var loadURL = "chrome://soundcloud/content/directory.xul";
    for (var i=0; i<tabs.length; i++) {
      var curBrowser = gBrowser.getBrowserAtIndex(i);
      var loadingURI = curBrowser.userTypedValue;
      var compValue;
      if (loadingURI != null)
        compValue = loadingURI;
      else
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
  }
}

SoundCloud._getElement = function(aWidget, aElementID) {
  return document.getAnonymousElementByAttribute(aWidget, "sbid", aElementID);
}

window.addEventListener("load",
                        function(e) { SoundCloud.onLoad(e); }, false);
window.addEventListener("unload",
                        function(e) { SoundCloud.onUnLoad(e); }, false);
