/* *=BEGIN SONGBIRD GPL
 *
 * This file is part of the Songbird web player.
 *
 * Copyright(c) 2005-2011 POTI, Inc.
 * http://www.songbirdnest.com
 *
 * This file may be licensed under the terms of of the
 * GNU General Public License Version 2 (the ``GPL'').
 *
 * Software distributed under the License is distributed
 * on an ``AS IS'' basis, WITHOUT WARRANTY OF ANY KIND, either
 * express or implied. See the GPL for the specific language
 * governing rights and limitations.
 *
 * You should have received a copy of the GPL along with this
 * program. If not, go to http://www.gnu.org/licenses/gpl.html
 * or write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 *
 *=END SONGBIRD GPL
 */

/**
 * \file authorize.js
 */
var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu.import("resource://app/jsmodules/DOMUtils.jsm");
Cu.import("resource://app/jsmodules/WindowUtils.jsm");

var SoundCloudAuthorize = {
  _open: function SoundCloudAuthorizeAuthorize_open() {
    this._service = Cc["@songbirdnest.com/soundcloud/service;1"]
                      .getService(Ci.sbISoundCloudService);
    this._browser = document.getElementById("soundcloud_auth_browser");
    this._browser.loadURI(this._service.soundcloudURL
                          + "/oauth/authorize?oauth_token="
                          + this._service.token
                          + "&display=popup");
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
      this._browser.focus();
      return;
    }

    var state = doc.getElementsByTagName("h1")[0].innerHTML;
    if (state == "You're now connected") {
      this._service.authorized = true;
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
