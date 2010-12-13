var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;

Cu.import("resource://app/jsmodules/DOMUtils.jsm");
Cu.import("resource://app/jsmodules/WindowUtils.jsm");

var SoundCloudAuthorizeAuthorize = {
  _open: function SoundCloudAuthorizeAuthorize_open() {
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

    this._domEventListenerSet.add(window,
                                  "keydown",
                                  function(aEvent) {
                                    self._submitListener(aEvent);
                                  },
                                  true,
                                  false);
  },

  _authListener: function SoundCloudAuthorize_authListener(aEvent) {
    var doc = this._browser.contentDocument;
    var deck = document.getElementById("soundcloud_auth_deck");

    if (deck.selectedPanel != this._browser) {
      doc.getElementById("username").value = this._service.username;
      doc.getElementById("password").value = this._service.password;
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

  _submitListener: function SoundCloudAuthorize_submitListener(aEvent) {
    if (aEvent.keyCode == KeyEvent.DOM_VK_RETURN ||
        aEvent.keyCode == KeyEvent.DOM_VK_ENTER) {
      this._browser.getElementById("authorize-token").submit();
      aEvent.stopPropagation();
    }
  },

  _close: function SoundCloudAuthorize_close() {
    this._service.authCallback();

    if (this._domEventListenerSet) {
      this._domEventListenerSet.removeAll();
      this._domEventListenerSet = null;
    }
  }
}
