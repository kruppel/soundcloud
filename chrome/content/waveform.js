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
 * \file waveform.js
 * \brief
 */

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;

Cu.import("resource://app/jsmodules/DOMUtils.jsm");
Cu.import("resource://app/jsmodules/SBDataRemoteUtils.jsm");
Cu.import("resource://app/jsmodules/sbProperties.jsm");
Cu.import("resource://app/jsmodules/WindowUtils.jsm");

if (typeof(gMM) == "undefined")
  var gMM = Cc["@songbirdnest.com/Songbird/Mediacore/Manager;1"]
              .getService(Ci.sbIMediacoreManager);

if (typeof SoundCloudWaveform == "undefined") {
  var SoundCloudWaveform = {};
}

SoundCloudWaveform.onLoad =
function SoundClouWaveform_onLoad() {
  var self = this;
  gMM.addListener(this);

  this._tracking = 0;
  this._idle = document.getElementById("socl-idle");
  this._wfdisplay = document.getElementById("socl-wf-display");
  this._cursor = document.getElementById("wf-cursor");
  this._waveform = document.getElementById("waveform");

  this._currentItem = gMM.sequencer.currentItem;
  if (this._currentItem) {
    var img = this._currentItem.getProperty(SB_PROPERTY_WAVEFORM);
    if (img != null) {
      this._waveform.src = img;
      this._idle.style.visibility = "hidden";
      this._wfdisplay.style.visibility = "visible";
    }
  }

  var dataRemoteListener = {
    observe: function(aSubject, aTopic, aData) {
      self.onPositionChanged();
    }
  };

  this.remote_position = SBNewDataRemote("metadata.position", null);
  this.remote_position.bindObserver(dataRemoteListener, true);
  this.remote_length = SBNewDataRemote("metadata.length", null);
  this.remote_length.bindObserver(dataRemoteListener, true);
  this.onPositionChanged();

  this._domEventListenerSet = new DOMEventListenerSet();
  var onCursorMove = function(event) {
    var boxObject = event.target.parentNode.getBoundingClientRect();
    var percent = event.clientX / boxObject.width * 100;
    self._cursor.style.width = percent + "%";
  }
  var onCursorDown = function(event) {
    self._tracking = 1;
    self.remote_position.unbind();
    self.remote_length.unbind();
    var boxObject = event.target.parentNode.getBoundingClientRect();
    var percent = event.clientX / boxObject.width * 100;
    self._cursor.style.width = percent + "%";
    self._mouseMoveListenerId = self._domEventListenerSet.add(self._wfdisplay,
                                                              "mousemove",
                                                              onCursorMove,
                                                              false,
                                                              false);
  }
  this._domEventListenerSet.add(this._wfdisplay,
                                "mousedown",
                                onCursorDown,
                                false,
                                false);
  var onCursorRelease = function(event) {
    self._tracking = 0;
    self._domEventListenerSet.remove(self._mouseMoveListenerId);
    self.remote_position = SBNewDataRemote("metadata.position", null);
    self.remote_position.bindObserver(dataRemoteListener, true);
    self.remote_length = SBNewDataRemote("metadata.length", null);
    self.remote_length.bindObserver(dataRemoteListener, true);
    var boxObject = event.target.parentNode.getBoundingClientRect();
    var rel_pos = event.clientX / boxObject.width;
    try {
      gMM.playbackControl.position = rel_pos * self.remote_length.intValue;
    } catch(e) {
      Cu.reportError(e);
    }
  }
  this._domEventListenerSet.add(this._wfdisplay,
                                "mouseup",
                                onCursorRelease,
                                false,
                                false);
}

SoundCloudWaveform.onPositionChanged =
function SoundCloudWaveform_onPositionChanged() {
  var percent = this.remote_position.intValue /
                this.remote_length.intValue *
                100;
  this._cursor.style.width = percent + "%";
}

SoundCloudWaveform.onMediacoreEvent =
function SoundCloudWaveform_onMediacoreEvent(aEvent) {
  switch(aEvent.type) {
    case Ci.sbIMediacoreEvent.BEFORE_TRACK_CHANGE:
      break;
    case Ci.sbIMediacoreEvent.TRACK_CHANGE:
      this._currentItem = gMM.sequencer.currentItem;
      var img = this._currentItem.getProperty(SB_PROPERTY_WAVEFORM);
      if (img != null) {
        this._idle.style.visibility = "hidden";
        this._wfdisplay.style.visibility = "visible";
        this._waveform.src = img;
      } else {
        this._idle.style.visibility = "visible";
        this._wfdisplay.style.visibility = "hidden";
      }
      break;
    case Ci.sbIMediacoreEvent.SEQUENCE_CHANGE:
      break;
    case Ci.sbIMediacoreEvent.VIEW_CHANGE:
      break;
    default:
      break;
  }
}

SoundCloudWaveform.onUnload =
function SoundCloudWaveform_onUnload(aEvent) {
  gMM.removeListener(this);

  this.remote_position.unbind();
  this.remote_length.unbind();

  if (this._domEventListenerSet) {
    this._domEventListenerSet.removeAll();
    this._domEventListenerSet = null;
  }
}

window.addEventListener("load",
                        function(e) { SoundCloudWaveform.onLoad(e); }, false);
window.addEventListener("unload",
                        function(e) { SoundCloudWaveform.onUnload(e); }, false);
