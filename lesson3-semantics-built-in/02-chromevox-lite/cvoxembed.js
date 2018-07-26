
function $(e) {
  return document.getElementById(e);
}

function matchesSelector(element, selector) {
  if (element.matches) {
    return element.matches(selector);
  }
  if (element.webkitMatchesSelector) {
    return element.webkitMatchesSelector(selector);
  }
  if (element.mozMatchesSelector) {
    return element.mozMatchesSelector(selector);
  }
  if (element.msMatchesSelector) {
    return element.msMatchesSelector(selector);
  }
  return false;
}

/**
 * Liberally match two language codes, for example:
 * langsMatch('en-US', 'en') -> true
 * langsMatch('en', 'en-US') -> true
 * langsMatch('en-UK', 'en-US') -> false
 * @param {string} lang1 An ISO language code
 * @param {string} lang2 An ISO language code
 * @return {boolean} Whether the two language match.
 */
function langsMatch(lang1, lang2) {
  if (lang1 === lang2) return true;

  if (lang1.trim() === '' || lang2.trim() === '') return false;
  var lang1Test = document.createElement('test');
  lang1Test.lang = lang1;
  var lang2Test = document.createElement('test');
  lang2Test.lang = lang2;
  return matchesSelector(lang2Test, ':lang(' + lang1 + ')') ||
      matchesSelector(lang1Test, ':lang(' + lang2 + ')');
}


class CvoxPageManager {
  constructor(embed) {
    this.embed = embed;
    this.injectStubs();
    const scriptTag = document.createElement('script');
    scriptTag.src = 'chromeandroidvox.js';
    document.head.append(scriptTag);
    // this.disableChromeVoxOnInitialLoad();
    // this.cvoxEmbedDisable();
    // this.addWindowEventListeners();
    // this.embed.updateSelectedVoiceOnLanguageUpdate(
    //     document.documentElement.lang);
    // this.replaceStubsWithRealImplementation();
  }

  replaceStubsWithRealImplementation() {
    // Finally replace the stubs with a real implementation now
    // that ChromeVox won't speak on startup.
    window.accessibility.speak = function(text, queueMode, params) {
      this.embed.speak({text, queuemode, params});
    };
    window.accessibility.isSpeaking = function() {};
    window.accessibility.stop = function() {
      this.embed.stop();
    };
    window.accessibility.braille = function() {};
    window.Audio = window.saveAudio;
    cvox.ChromeVox.earcons.audioMap = {};

    document.getElementById('enable-cvox')
        .addEventListener('click', function() {
          cvoxEmbedEnable();
        });
  }

  addWindowEventListeners() {
    // Stop talking if the user changes tab
    window.addEventListener('blur', function(e) {
      window.accessibility.stop();
    });

    // Stop talking if the user changes tab
    window.addEventListener('blur', function(e) {
      window.accessibility.stop();
    });
  }

  disableChromeVoxOnInitialLoad() {
    window.setTimeout(function() {
      // Hide chromevox indicator
      var cvoxIndicator = document.querySelector('.cvox_indicator_container');
      if (cvoxIndicator) cvoxIndicator.parentElement.removeChild(cvoxIndicator);
    }, 101);
    cvox.ChromeVox.host.activateOrDeactivateChromeVox(false);
    cvox.ChromeVoxEventWatcher.focusFollowsMouse = false;
    cvox.ChromeVox.host.mustRedispatchClickEvent = function() {
      return false;
    }
  }

  // TODO: do we need these?
  injectStubs() {
    window.accessibility = {};
    window.accessibility.speak = function(text, queueMode, params) {};
    window.accessibility.isSpeaking = function() {};
    window.accessibility.stop = function() {};
    window.accessibility.braille = function() {};

    // Prevent ChromeVox from playing an earcon on startup.
    window.saveAudio = window.Audio;
    window.Audio = function() {};
  }

  // ChromeVox embed commands.
  cvoxEmbedEnable() {
    if (document.body.hasAttribute('cvox-enabled')) return;
    window.setTimeout(function() {
      document.body.setAttribute('cvox-enabled', true);
      cvox.ChromeVox.host.activateOrDeactivateChromeVox(true);
      cvox.ChromeVoxEventWatcher.focusFollowsMouse = false;
      cvox.ChromeVox.executeUserCommand('jumpToTop');

      // TODO: Get rid of this circular dependency thing.
      this.embed.enableCvox();
    }, 200);
  }

  cvoxEmbedDisable() {
    if (!document.body.hasAttribute('cvox-enabled')) return;
    document.body.removeAttribute('cvox-enabled');
    
    // TODO: Get rid of this circular dependency thing.
    this.embed.disableCvox();

    window.accessibility.stop();
    cvox.ChromeVox.host.activateOrDeactivateChromeVox(false);
  }

  cvoxEmbedNext() {
    cvox.ChromeVox.executeUserCommand('forward');
  }
  cvoxEmbedPrevious() {
    cvox.ChromeVox.executeUserCommand('backward');
  }
  cvoxEmbedTop() {
    cvox.ChromeVox.executeUserCommand('jumpToTop');
  }
  cvoxEmbedHeading() {
    cvox.ChromeVox.executeUserCommand('nextHeading');
  }
  cvoxEmbedClick() {
    cvox.ChromeVox.executeUserCommand('forceClickOnCurrentItem');
  }
}

class CvoxEmbed {
  constructor() {
    this.domBuilder = new CvoxEmbedDomBuilder();
    this.pageManager = new CvoxPageManager(this);
    this.root = this.domBuilder.buildEverything();
    this.insertCvoxEmbed();

    this.caption = $('caption');
    this.controlsDiv = $('controls');
    this.voices = $('voices');
    this.rates = $('rates');
    this.volumeControl = $('volume');
    this.speechQueue = [];

    this.ctrls = this.controlsDiv.querySelectorAll('button,select');

    this.disableCvox();
    this.addControlListeners();
    this.currentVoiceOptions = [];
    speechSynthesis.onvoiceschanged = (() => this.updateVoices);
    this.updateVoices();
  }

  updateSelectedVoiceOnLanguageUpdate(chromeVoxLang) {
    for (var option = voices.firstChild; option != null;
         option = option.nextSibling) {
      var optionLang = option.value;
      if (langsMatch(option.value, chromeVoxLang)) {
        option.selected = true;
        return;
      }
    }
  }

  /**
   * Updates list of voices that can be used by secreenreader.
   */
  updateVoices() {
    while (voices.firstChild) {
      voices.removeChild(voices.firstChild);
    }
    const defaultLang = this.getDefaultLang();
    let foundDefaultLang = false;
    this.currentVoiceOptions = speechSynthesis.getVoices();
    for (let voice of this.currentVoiceOptions) {
      var option = document.createElement('option');
      option.innerText = voice.name;
      var chromeVoxLang = voice.lang;
      option.value = chromeVoxLang;
      if (!foundDefaultLang && this.isDefaultLang(voice.lang)) {
        option.defaultSelected = true;
        foundDefaultLang = true;
      }
      voices.appendChild(option);
    }
  }


  // TODO: Build embed dynamically and add listeners then.
  addControlListeners() {
    $('toggle-cvox').addEventListener('click', e => this.onToggleClicked(e), true);
    $('next').addEventListener('click', e => this.onNextButtonClicked(e));
    $('previous').addEventListener('click', e => this.onPreviousButtonClicked(e));
    $('top').addEventListener('click', e => this.onTopButtonClicked(e));
    $('heading').addEventListener('click', e => this.onHeadingButtonClicked(e));
    $('click').addEventListener('click', e => this.onClickButtonClicked(e));
  }

  onClickButtonClicked(e) {
    this.pageManager.cvoxEmbedClick();
    e.stopPropagation();
  }

  onHeadingButtonClicked(e) {
    this.pageManager.cvoxEmbedHeading();
    e.stopPropagation();
  }

  onTopButtonClicked(e) {
    this.pageManager.cvoxEmbedTop();
    e.stopPropagation();
  }

  onNextButtonClicked(e) {
    this.pageManager.cvoxEmbedNext();
    e.stopPropagation();
  }

  onPreviousButtonClicked(e) {
    this.pageManager.cvoxEmbedPrevious();
    e.stopPropagation();
  }

  onToggleClicked(e) {
    this.root.hasAttribute('enabled') ? this.disableCvox() : this.enableCvox();
    $('toggle-cvox').blur();
  }

  insertCvoxEmbed() {
    const headContent = this.domBuilder.buildHeadContent();
    document.head.append(headContent);
    document.body.append(this.root);
  }

  enableCvox() {
    if (this.root.hasAttribute('enabled')) return;

    this.pageManager.cvoxEmbedEnable();

    this.root.classList.add('cvoxembed-enabled');
    this.root.setAttribute('enabled', '');
    for (let ctrl of this.ctrls) {
      ctrl.disabled = false;
      ctrl.tabIndex = -1;
    }
  }

  disableCvox() {
    if (!this.root.hasAttribute('enabled')) return;

    this.pageManager.cvoxEmbedDisable();
    caption.innerHTML = '';

    this.root.classList.remove('cvoxembed-enabled');
    this.root.removeAttribute('enabled');
    for (let ctrl of this.ctrls) {
      ctrl.disabled = true;
    }
  }

  controlsDataForUtterance() {
    return {
      rate: parseFloat(this.rates.selectedOptions[0].value),
      volume: this.volumeControl.value / 100.0,
      voice: this.currentVoiceOptions[voices.selectedIndex],
    };
  }

  clearCaption() {
    this.caption.innerHTML = '';
  }

  updateCaption(newCaptionHtml, queueMode) {
    if (queueMode == 0) {
      caption.innerHTML = '';
    } else if (caption.textContent !== '') {
      caption.innerHTML += ',&nbsp;'
    }
    caption.innerHTML += newCaptionHtml;
  }

  getDefaultLang() {
    return navigator.language;
  }

  isDefaultLang(lang) {
    return langsMatch(lang, this.getDefaultLang())
  }

  speakNextUtterance() {
    if (speechSynthesis.speaking) return;

    if (this.speechQueue.length == 0) return;

    var data = this.speechQueue.shift();
    const controlsDataForUtterance = this.getControlsData();
    var u = new SpeechSynthesisUtterance(data.text);
    u.pitch = 2 * data.params.pitch;
    Object.assign(u, controlsDataForUtterance);
    u.onend = function() {
      window.setTimeout(function() {
        speakNextUtterance();
      }, 0);
    };
    speechSynthesis.speak(u);
  }

  speak(data) {
    console.log('speak', data);
    var text = data.text;
    var queueMode = data.queueMode;
    var params = data.params;

    const captionHtml = this.generateNewCaptionHtml(params);
    this.updateCaption(captionHtml, queueMode);

    if (queueMode == 0) {
      speechSynthesis.cancel();
      speechQueue.length = 0;
    }

    if (text.trim() !== '')
      speechQueue.push({text: text, queueMode: queueMode, params: params});
    speakNextUtterance();
  }

  generateNewCaptionHtml(params) {
    const newCaptionHtml = '<span>' + text + '</span>&nbsp;&nbsp;';
    return newCaptionHtml + (params.pitch < 0.5 ? text : '<b>' + text + '</b>');
  }

  stop() {
    this.clearCaption();
    speechSynthesis.cancel();
  }
}

class CvoxEmbedDomBuilder {
  buildHeadContent() {
    const cssLink = document.createElement('link');
    cssLink.href = 'embed.css';
    cssLink.rel = 'stylesheet';
    return cssLink;

    // TODO: move this into page manager?
    // link.type = 'text/css';
    // link.media = 'screen';
    // const jsScript = document.createElement('script');
  }

  buildEverything() {
    const wrapper = document.createElement('div');
    wrapper.id = 'cvoxembed';
    wrapper.className = 'cvoxembed';
    wrapper.ariaHidden = 'true';

    wrapper.innerHTML = `
        <div id="shade" class="shade" aria=hidden="true">
  <span id="cvox-logo">
    <img height="24" width="24" src="chromevox-no-background.svg" alt="ChromeVox Lite logo" class="enabled">
    <img height="24" width="24" src="chromevox-no-background-off.svg" alt="ChromeVox Lite disabled logo" class="disabled">
  </span>
  <span id="caption"></span>
  <button id="toggle-cvox"><span id="enable-cvox">Enable ChromeVox Lite</span><span id="disable-cvox">Disable ChromeVox Lite</button>
</div>
<div id="controls" class="controls" aria-hidden="true">
  <div class="controlsContentWrapper">
    <div class="controlsContent">
      <span>
        Voice:
        <select id="voices">
        </select>
      </span>
      <span>
        Speech rate:
        <select id="rates">
          <option value="1.0">Slow</option>
          <option value="1.2" selected>Default</option>
          <option value="1.8">Intermediate</option>
          <option value="3.0">
              Advanced (normal for a blind person)
          </option>
        </select>
      </span>
      <span>
        Navigate:
        <button id="previous">Previous</button>
        <button id="next">Next</button>
        <button id="click">Click</button>
        <button id="heading">Heading</button>
        <button id="top">Top</button>
      </span>
      <span class="volume">
        Volume: <input id="volume" type="range" min=0 value=100 max=100>
      </span>
    </div>
  </div>
</div>`;
    return wrapper;
  }
}

const embed = new CvoxEmbed();
embed.insertCvoxEmbed();
